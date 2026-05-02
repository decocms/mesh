import type { ProcessManager } from "../process/run-process";
import { jsonResponse } from "./body-parser";

export function makeKillHandler(pm: ProcessManager) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const rawName = url.pathname.slice("/_decopilot_vm/kill/".length);
    if (!rawName) return jsonResponse({ error: "missing script name" }, 400);
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      return jsonResponse({ error: "invalid script name" }, 400);
    }
    return pm.kill(name)
      ? jsonResponse({ ok: true })
      : jsonResponse({ error: "not running" }, 400);
  };
}
