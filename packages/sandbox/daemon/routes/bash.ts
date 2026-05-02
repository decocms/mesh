import { spawn } from "node:child_process";
import { DECO_UID, DECO_GID } from "../constants";
import { parseBase64JsonBody, jsonResponse } from "./body-parser";

export interface BashDeps {
  appRoot: string;
  dropPrivileges?: boolean;
  env?: NodeJS.ProcessEnv;
}

export function makeBashHandler(deps: BashDeps) {
  return async (req: Request): Promise<Response> => {
    let body: { command?: string; timeout?: number };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }

    if (!body.command || typeof body.command !== "string") {
      return jsonResponse({ error: "command is required" }, 400);
    }

    const timeout = Math.min(body.timeout ?? 30000, 120000);
    const opts: Parameters<typeof spawn>[2] = {
      cwd: deps.appRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: deps.env,
      // Own pgid so we can SIGKILL the whole subtree. Without this, a
      // backgrounded child (`bun server.ts ... &`) outlives bash and leaks:
      // macOS bash 3.2 also wedges in wait4() waiting on it, so the only
      // way to recover is to signal the group, not just the shell.
      detached: true,
    };

    if (deps.dropPrivileges) {
      (opts as { uid: number; gid: number }).uid = DECO_UID;
      (opts as { uid: number; gid: number }).gid = DECO_GID;
    }

    const child = spawn("bash", ["-c", body.command], opts);
    const pgid = child.pid;

    let stdout = "";
    let stderr = "";
    let killed = false;

    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf-8");
    });

    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf-8");
    });

    const killGroup = (signal: NodeJS.Signals) => {
      if (pgid === undefined) return;
      try {
        process.kill(-pgid, signal);
      } catch {
        /* group already gone */
      }
    };

    const timer = setTimeout(() => {
      killed = true;
      killGroup("SIGKILL");
    }, timeout);

    const exitCode: number = await new Promise((resolve) => {
      child.on("close", (code) => {
        clearTimeout(timer);
        // Even on clean exit, reap any survivors of the backgrounded-job
        // case so a `&` child can't outlive the request.
        killGroup("SIGKILL");
        resolve(killed ? -1 : (code ?? 1));
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        killGroup("SIGKILL");
        stderr += (stderr ? "\n" : "") + `spawn error: ${err.message}`;
        resolve(-1);
      });
    });

    return jsonResponse({ stdout, stderr, exitCode });
  };
}
