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
  daemonBootId: string;
  storageDir?: string;
  onAccepted?: (payload: BootstrapPayload) => void;
}

// Unauthenticated. NetworkPolicy is the trust boundary — only mesh pods can
// reach :9000, so first valid POST wins. Don't add auth here without also
// thinking through how mesh delivers a pre-bootstrap secret.
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

    if (payload.schemaVersion !== 1) {
      return jsonResponse(
        { error: `unknown schemaVersion: ${String(payload.schemaVersion)}` },
        400,
      );
    }

    if (
      typeof payload.daemonToken !== "string" ||
      payload.daemonToken.length < 32
    ) {
      return jsonResponse({ error: "daemonToken must be ≥ 32 chars" }, 400);
    }

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

      if (phase === "failed") {
        return jsonResponse(
          { phase, bootId: deps.daemonBootId, hash: incomingHash },
          409,
        );
      }

      if (persistedHash !== null) {
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
        return jsonResponse(
          { phase, bootId: deps.daemonBootId, hash: persistedHash },
          200,
        );
      }

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
