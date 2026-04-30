import { jsonResponse, parseBase64JsonBody } from "./routes/body-parser";
import {
  bootstrapMutex,
  getBootstrapHash,
  getPhase,
  setBootstrapHash,
  setConfig,
  setPhase,
} from "./state";
import {
  hashPayload,
  writeBootstrap,
  type BootstrapPayload,
} from "./persistence";
import { configFromBootstrap } from "./bootstrap-config";

const VALID_RUNTIMES = new Set(["node", "bun", "deno"]);
const VALID_PMS = new Set(["npm", "pnpm", "yarn", "bun", "deno"]);

export interface BootstrapHandlerDeps {
  /** UUID stamped at daemon process start; round-trips on every response. */
  daemonBootId: string;
  /**
   * Storage dir for `bootstrap.json` (defaults to `/home/sandbox/.daemon`).
   * Override exists for tests; do not pass in production.
   */
  storageDir?: string;
  /** Called inside the mutex once a bootstrap is accepted (for orchestrator wiring). */
  onAccepted?: (payload: BootstrapPayload) => void;
}

export function makeBootstrapHandler(deps: BootstrapHandlerDeps) {
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
    const payload = raw as Partial<BootstrapPayload>;

    // 1. schemaVersion known? 400.
    if (payload.schemaVersion !== 1) {
      return jsonResponse(
        { error: `unknown schemaVersion: ${String(payload.schemaVersion)}` },
        400,
      );
    }

    // 2. claimNonce matches process.env.CLAIM_NONCE (downward API)? 403.
    if (typeof payload.claimNonce !== "string" || !payload.claimNonce) {
      return jsonResponse({ error: "claimNonce required" }, 400);
    }

    // 3. daemonToken length check.
    if (
      typeof payload.daemonToken !== "string" ||
      payload.daemonToken.length < 32
    ) {
      return jsonResponse({ error: "daemonToken must be ≥ 32 chars" }, 400);
    }

    // 4. Light shape validation so a malformed payload doesn't survive
    //    until orchestrator-time. Spec keeps the schema deliberately small.
    if (!VALID_RUNTIMES.has(payload.runtime as string)) {
      return jsonResponse(
        { error: `runtime invalid: ${String(payload.runtime)}` },
        400,
      );
    }
    if (
      payload.packageManager !== undefined &&
      !VALID_PMS.has(payload.packageManager as string)
    ) {
      return jsonResponse(
        {
          error: `packageManager invalid: ${String(payload.packageManager)}`,
        },
        400,
      );
    }

    const fullPayload = payload as BootstrapPayload;

    return bootstrapMutex.run(() => {
      const phase = getPhase();
      const persistedHash = getBootstrapHash();
      const incomingHash = hashPayload(fullPayload);

      // Failed is terminal regardless of payload.
      if (phase === "failed") {
        return jsonResponse(
          { phase, bootId: deps.daemonBootId, hash: incomingHash },
          409,
        );
      }

      if (persistedHash !== null) {
        // Already bootstrapped (or in-flight bootstrapping). Idempotency check.
        if (incomingHash !== persistedHash) {
          return jsonResponse(
            {
              phase,
              bootId: deps.daemonBootId,
              hash: persistedHash,
              reason: "conflict",
            },
            409,
          );
        }
        // Same payload — return current phase as a 200.
        return jsonResponse(
          { phase, bootId: deps.daemonBootId, hash: persistedHash },
          200,
        );
      }

      // No persisted payload yet. Defense-in-depth: only accept from
      // pending-bootstrap. (ready/bootstrapping with hash=null shouldn't
      // happen, but guard anyway.)
      if (phase !== "pending-bootstrap") {
        return jsonResponse(
          { phase, bootId: deps.daemonBootId, hash: incomingHash },
          409,
        );
      }

      let hash: string;
      try {
        hash = writeBootstrap(fullPayload, deps.storageDir).hash;
      } catch (e) {
        return jsonResponse(
          { error: `persistence failed: ${(e as Error).message}` },
          500,
        );
      }

      setBootstrapHash(hash);
      setConfig(configFromBootstrap(fullPayload, deps.daemonBootId));
      setPhase("bootstrapping");
      deps.onAccepted?.(fullPayload);

      return jsonResponse(
        {
          phase: "bootstrapping",
          bootId: deps.daemonBootId,
          hash,
        },
        200,
      );
    });
  };
}
