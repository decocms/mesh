import { jsonResponse } from "./routes/body-parser";

/**
 * Bearer-token check for mutating /_decopilot_vm/* routes.
 *
 * Returns null when the request is authorized; otherwise returns a 401
 * Response the caller should hand back unchanged. Constant-time compare
 * to keep timing attacks off the table even though the netpol is the
 * primary boundary.
 *
 * The unauth'd allowlist (GET /health, GET /_decopilot_vm/idle, GET
 * /_decopilot_vm/events, GET /_decopilot_vm/scripts, OPTIONS preflight)
 * MUST NOT call this — mesh attaches the bearer to every request and
 * those handlers must accept it silently.
 *
 * Phase 1 will add POST /_decopilot_vm/bootstrap to the unauth'd set
 * (phase + nonce gated, not auth gated). Don't add it here when Phase 1
 * lands.
 */
export function requireToken(
  req: Request,
  expectedToken: string,
): Response | null {
  const header = req.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const provided = header.slice(prefix.length);
  if (!constantTimeEqual(provided, expectedToken)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
