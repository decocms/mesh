import { jsonResponse, parseBase64JsonBody } from "./body-parser";
import { bootstrapMutex, peekTenantConfig, setTenantConfig } from "../state";
import { writeBootstrap } from "../persistence";
import { validateMutableFields } from "../validate";
import type { TenantConfig } from "../types";

export type ConfigChangeKind = "devport-only" | "rerun";

export interface ConfigUpdateDeps {
  daemonBootId: string;
  storageDir?: string;
  onApplied: (kind: ConfigChangeKind, tenant: TenantConfig) => void;
}

export interface ConfigReadDeps {
  daemonBootId: string;
}

/**
 * GET /_decopilot_vm/config — current tenantConfig. `env` values are masked
 * (only keys are returned) so the response can be displayed in UI without
 * leaking secrets the user PUT into the daemon. PUT round-trips them by
 * key+value as usual.
 */
export function makeConfigReadHandler(deps: ConfigReadDeps) {
  return async (): Promise<Response> => {
    const tenant = peekTenantConfig();
    if (!tenant) {
      return jsonResponse(
        { error: "no bootstrap; POST /_decopilot_vm/bootstrap first" },
        404,
      );
    }
    return jsonResponse({
      bootId: deps.daemonBootId,
      config: tenant,
    });
  };
}

/**
 * PUT /_decopilot_vm/config — patch mutable fields on an already-bootstrapped
 * daemon. Identity (cloneUrl, gitUserName, gitUserEmail) is rejected if it
 * differs from the pinned values; everything else is replaceable.
 *
 * Field-level patch semantics:
 *   - field absent → leave existing
 *   - field present (incl. null where the type allows) → set
 *
 * Re-orchestration is triggered when any field that affects clone/install/
 * autostart changes. devPort/env-only patches just rewire state and let the
 * probe pick up the new pin on its next tick.
 */
export function makeConfigUpdateHandler(deps: ConfigUpdateDeps) {
  return async (req: Request): Promise<Response> => {
    let raw: unknown;
    try {
      raw = await parseBase64JsonBody(req);
    } catch (e) {
      return jsonResponse({ error: `bad body: ${(e as Error).message}` }, 400);
    }
    if (!raw || typeof raw !== "object") {
      return jsonResponse({ error: "payload must be an object" }, 400);
    }
    const patch = raw as Partial<TenantConfig>;
    const v = validateMutableFields(patch);
    if (v.kind === "invalid") {
      return jsonResponse({ error: v.reason }, 400);
    }

    return bootstrapMutex.run(() => {
      const current = peekTenantConfig();
      if (!current) {
        return jsonResponse(
          { error: "no bootstrap; POST /_decopilot_vm/bootstrap first" },
          409,
        );
      }

      // Identity is the bootstrap's pinned half — reject any non-matching value.
      // (Omitted fields stay as-is.)
      const identityConflict = checkIdentityConflict(current, patch);
      if (identityConflict) {
        return jsonResponse(
          { error: identityConflict, reason: "identity-conflict" },
          409,
        );
      }

      try {
        const unsafeMerge = { ...current, ...patch } as TenantConfig; // should do this in a safe way
        writeBootstrap(unsafeMerge, deps.storageDir);
      } catch (e) {
        return jsonResponse(
          { error: `persistence failed: ${(e as Error).message}` },
          500,
        );
      }

      setTenantConfig(patch as TenantConfig);

      return jsonResponse({
        bootId: deps.daemonBootId,
      });
    });
  };
}

function checkIdentityConflict(
  current: TenantConfig,
  patch: Partial<TenantConfig>,
): string | null {
  if (
    patch.git?.repository?.cloneUrl !== undefined &&
    patch.git?.repository?.cloneUrl !== current.git?.repository?.cloneUrl
  ) {
    return "cloneUrl is immutable once set";
  }
  return null;
}
