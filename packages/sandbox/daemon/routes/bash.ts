import type { JobManager } from "../process/job-manager";
import { jsonResponse, parseBase64JsonBody } from "./body-parser";
import { awaitJobResponse } from "./jobs";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;

export type BashMode = "await" | "background";

export interface BashDeps {
  /** Default cwd for unscoped commands. Typically `<appRoot>/repo` (the repo). */
  repoDir: string;
  jobManager: JobManager;
  env?: Record<string, string>;
}

interface BashBody {
  command?: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  mode?: BashMode;
}

/**
 * Modes:
 *   - "await" (default): runs to completion and returns the full
 *     stdout/stderr/exitCode body. This is the legacy bash behavior.
 *   - "background": returns the jobId immediately. Caller can poll
 *     /_decopilot_vm/jobs/:id, stream output, or kill via the jobs API.
 */
export function makeBashHandler(deps: BashDeps) {
  return async (req: Request): Promise<Response> => {
    let body: BashBody;
    try {
      body = (await parseBase64JsonBody(req)) as BashBody;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    if (!body.command || typeof body.command !== "string") {
      return jsonResponse({ error: "command is required" }, 400);
    }

    const mode: BashMode = body.mode === "background" ? "background" : "await";
    const timeout = clampTimeout(body.timeout, mode);
    const env = body.env ? { ...(deps.env ?? {}), ...body.env } : deps.env;

    const job = deps.jobManager.spawn({
      command: body.command,
      cwd: body.cwd ?? deps.repoDir,
      env,
      mode: "pipe",
      timeoutMs: timeout,
      label: `$ ${body.command}`,
    });

    if (mode === "background") {
      return jsonResponse({ jobId: job.id, status: job.status });
    }

    return awaitJobResponse(deps.jobManager, job.id, { timedOutExitCode: -1 });
  };
}

function clampTimeout(raw: number | undefined, mode: BashMode): number {
  const fallback = DEFAULT_TIMEOUT_MS;
  const requested = typeof raw === "number" && raw > 0 ? raw : fallback;
  // Background jobs may run longer; cap at 15 min (matches JobManager TTL).
  const ceiling = mode === "background" ? MAX_TIMEOUT_MS : 120_000;
  return Math.min(requested, ceiling);
}
