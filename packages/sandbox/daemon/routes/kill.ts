import type { ProcessManager } from "../process/run-process";
import { jsonResponse } from "./body-parser";

export function makeKillHandler(pm: ProcessManager) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const name = url.pathname.slice("/_decopilot_vm/kill/".length);
    if (!name) return jsonResponse({ error: "missing script name" }, 400);
    return pm.kill(name)
      ? jsonResponse({ ok: true })
      : jsonResponse({ error: "not running" }, 400);
  };
}
