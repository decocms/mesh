import type { TenantConfigStore } from "../config-store";
import type { ApplyResult } from "../config-store/types";
import type { TenantConfig } from "../types";
import { jsonResponse, parseBase64JsonBody } from "./body-parser";

export interface ConfigDeps {
  daemonBootId: string;
  store: TenantConfigStore;
}

/**
 * GET /_decopilot_vm/config — current TenantConfig (in-memory snapshot,
 * which mirrors disk after every successful apply). Returns 404 when no
 * tenant config has been set yet.
 */
export function makeConfigReadHandler(deps: ConfigDeps) {
  return async (): Promise<Response> => {
    const tenant = deps.store.read();
    if (!tenant) {
      return jsonResponse(
        { error: "no tenant config; POST /_decopilot_vm/config first" },
        404,
      );
    }
    return jsonResponse({
      bootId: deps.daemonBootId,
      config: stripDerived(tenant),
    });
  };
}

/**
 * POST /_decopilot_vm/config — set initial tenant config. PUT/POST share
 * the same handler shape: both deep-merge into current. POST is the
 * conventional first-set; PUT is the conventional patch.
 */
export function makeConfigUpdateHandler(deps: ConfigDeps) {
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
    const result = await deps.store.apply(patch);
    return makeApplyResponse(deps.daemonBootId, result);
  };
}

function makeApplyResponse(bootId: string, result: ApplyResult): Response {
  if (result.kind === "rejected") {
    const status = inferStatus(result.reason);
    return jsonResponse({ error: result.reason }, status);
  }
  return jsonResponse({
    bootId,
    transition: result.transition.kind,
    config: result.after,
  });
}

function inferStatus(reason: string): number {
  if (reason.includes("immutable")) return 409;
  if (reason.startsWith("persistence failed")) return 500;
  return 400;
}

function stripDerived(
  enriched: ReturnType<TenantConfigStore["read"]>,
): TenantConfig | null {
  if (!enriched) return null;
  return {
    git: enriched.git,
    application: enriched.application,
  };
}
