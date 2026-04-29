import { getIdleStatus } from "../activity";
import { jsonResponse } from "./body-parser";

/**
 * GET /_decopilot_vm/idle — reports `lastActivityAt` (ISO) and `idleMs`. Used
 * by mesh's idle-sweep loop to decide whether to refresh the SandboxClaim's
 * shutdownTime.
 *
 * Unauthenticated like the daemon's other GET endpoints. The exposed values
 * (timestamp, age in ms) carry no secret material; the iframe-attached studio
 * UI is intentionally allowed to read them cross-origin via CORS.
 */
export function makeIdleHandler(): () => Response {
  return () => jsonResponse(getIdleStatus());
}
