import type { TenantConfigStore } from "../config-store";
import { PACKAGE_MANAGER_DAEMON_CONFIG } from "../constants";
import type { Broadcaster } from "../events/broadcast";
import type { JobManager } from "../process/job-manager";
import { discoverScripts } from "../process/script-discovery";
import { jsonResponse, parseBase64JsonBody } from "./body-parser";

export type ExecMode = "await" | "background";

export interface ExecDeps {
  /** Default cwd when no packageManager.path is set. Typically `<appRoot>/repo`. */
  repoDir: string;
  store: TenantConfigStore;
  jobManager: JobManager;
  /**
   * Bridges per-job pty output onto the global SSE log stream so the UI's
   * script-tab terminal renders /exec output. Without this, /exec jobs are
   * only observable via /jobs/:id/stream — which the env tab doesn't
   * subscribe to — so the tab stays blank.
   */
  broadcaster: Broadcaster;
}

interface ExecBody {
  mode?: ExecMode;
  timeoutMs?: number;
  env?: Record<string, string>;
}

/**
 * POST /_decopilot_vm/exec/<name> — run package-script `<name>` via the
 * configured package manager, as a Job. Multiple invocations of the same
 * script run concurrently (each gets its own job UUID); the daemon does
 * not coordinate or deduplicate them.
 */
export function makeExecHandler(deps: ExecDeps) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const rawName = url.pathname.slice("/_decopilot_vm/exec/".length);
    if (!rawName) return jsonResponse({ error: "missing script name" }, 400);
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      return jsonResponse({ error: "invalid script name" }, 400);
    }

    const config = deps.store.read();
    const pmName = config?.application?.packageManager?.name;
    if (!pmName) {
      return jsonResponse(
        { error: "no application configured; POST /config first" },
        409,
      );
    }
    const pmConf = PACKAGE_MANAGER_DAEMON_CONFIG[pmName];
    if (!pmConf) {
      return jsonResponse({ error: `unknown package manager: ${pmName}` }, 500);
    }

    const cwd = config.application?.packageManager?.path ?? deps.repoDir;
    const scripts = discoverScripts(cwd, pmName);
    if (!scripts.includes(name)) {
      return jsonResponse(
        {
          error: `script "${name}" not found in package file`,
          available: scripts,
        },
        404,
      );
    }

    let body: ExecBody = {};
    if (req.body) {
      try {
        const parsed = await parseBase64JsonBody(req);
        if (parsed && typeof parsed === "object") {
          body = parsed as ExecBody;
        }
      } catch {
        /* exec accepts an empty body — treat parse error as "no overrides" */
      }
    }
    // Exec defaults to background — package scripts can be long-running
    // (`npm run dev` via /exec/dev is the obvious case). Callers that want
    // a blocking response opt in via mode: "await".
    const mode: ExecMode = body.mode === "await" ? "await" : "background";

    const env: Record<string, string> = {
      HOST: "0.0.0.0",
      HOSTNAME: "0.0.0.0",
      ...(body.env ?? {}),
    };
    const desired = config.application?.desiredPort;
    if (desired !== undefined && env.PORT === undefined) {
      env.PORT = String(desired);
    }
    const cmd = `${config.runtimePathPrefix}cd ${cwd} && ${pmConf.runPrefix} ${name}`;
    const label = `$ ${pmConf.runPrefix} ${name}`;

    const job = deps.jobManager.spawn({
      command: cmd,
      cwd,
      env,
      mode: "pty",
      timeoutMs: body.timeoutMs,
      label,
      // Named tee: <logsDir>/app/<scriptName> stays stable across runs
      // so the LLM can `cat tmp/app/build` etc. without chasing job IDs.
      logName: name,
    });

    // Mirror job output onto the global SSE log stream under the script
    // name so the env-tab terminal (keyed on `name`) renders it. Header
    // line first, then forward stdout/stderr chunks until the job ends.
    deps.broadcaster.broadcastChunk(name, `${label}\r\n`);
    const unsubscribe = deps.jobManager.subscribe(job.id, (chunk) => {
      deps.broadcaster.broadcastChunk(name, chunk.data);
    });
    void deps.jobManager.finished(job.id)?.then(() => unsubscribe?.());

    if (mode === "background") {
      return jsonResponse({ jobId: job.id, status: job.status });
    }

    const finished = await deps.jobManager.finished(job.id);
    if (!finished) {
      return jsonResponse({ error: "job vanished before completion" }, 500);
    }
    const result = await finished;
    const out = deps.jobManager.output(job.id);
    return jsonResponse({
      jobId: job.id,
      stdout: out?.stdout ?? "",
      stderr: out?.stderr ?? "",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: out?.truncated ?? false,
    });
  };
}
