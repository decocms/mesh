import type { JobManager, JobStatus } from "../process/job-manager";
import { sseFormat } from "../events/sse-format";
import { jsonResponse } from "./body-parser";

export async function awaitJobResponse(
  jobManager: JobManager,
  id: string,
  opts: { extra?: Record<string, unknown>; timedOutExitCode?: number } = {},
): Promise<Response> {
  const wait = jobManager.finished(id);
  if (!wait)
    return jsonResponse({ error: "job vanished before completion" }, 500);
  const result = await wait;
  const out = jobManager.output(id);
  const exitCode =
    opts.timedOutExitCode !== undefined && result.timedOut
      ? opts.timedOutExitCode
      : result.exitCode;
  return jsonResponse({
    ...opts.extra,
    stdout: out?.stdout ?? "",
    stderr: out?.stderr ?? "",
    exitCode,
    timedOut: result.timedOut,
    truncated: out?.truncated ?? false,
  });
}

export interface JobsDeps {
  jobManager: JobManager;
}

const VALID_STATUS: ReadonlySet<JobStatus> = new Set([
  "running",
  "exited",
  "failed",
  "killed",
  "timeout",
]);

/** GET /_decopilot_vm/jobs?status=running,exited */
export function makeJobsListHandler(deps: JobsDeps) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status = statusParam
      ? statusParam
          .split(",")
          .filter((s): s is JobStatus => VALID_STATUS.has(s as JobStatus))
      : undefined;
    const jobs = deps.jobManager.list(
      status && status.length > 0 ? { status } : undefined,
    );
    return jsonResponse({ jobs });
  };
}

/** GET /_decopilot_vm/jobs/:id */
export function makeJobsGetHandler(deps: JobsDeps) {
  return async (req: Request): Promise<Response> => {
    const id = idFrom(req, "/jobs/");
    if (!id) return jsonResponse({ error: "missing job id" }, 400);
    const summary = deps.jobManager.get(id);
    if (!summary) return jsonResponse({ error: "job not found" }, 404);
    const out = deps.jobManager.output(id);
    return jsonResponse({
      ...summary,
      stdout: out?.stdout ?? "",
      stderr: out?.stderr ?? "",
      truncated: out?.truncated ?? false,
    });
  };
}

/** POST /_decopilot_vm/jobs/:id/kill[?signal=SIGTERM|SIGKILL] */
export function makeJobsKillHandler(deps: JobsDeps) {
  return async (req: Request): Promise<Response> => {
    const id = idFrom(req, "/jobs/", "/kill");
    if (!id) return jsonResponse({ error: "missing job id" }, 400);
    const url = new URL(req.url);
    const sig = (url.searchParams.get("signal") ?? "SIGTERM") as NodeJS.Signals;
    const ok = deps.jobManager.kill(id, sig);
    if (!ok) return jsonResponse({ error: "job not running" }, 400);
    return jsonResponse({ ok: true });
  };
}

/** POST /_decopilot_vm/jobs/kill-all */
export function makeJobsKillAllHandler(deps: JobsDeps) {
  return async (): Promise<Response> => {
    const count = deps.jobManager.killAll();
    return jsonResponse({ ok: true, killed: count });
  };
}

/** DELETE /_decopilot_vm/jobs/:id */
export function makeJobsDeleteHandler(deps: JobsDeps) {
  return async (req: Request): Promise<Response> => {
    const id = idFrom(req, "/jobs/");
    if (!id) return jsonResponse({ error: "missing job id" }, 400);
    const ok = deps.jobManager.delete(id);
    if (!ok)
      return jsonResponse({ error: "job not found or still running" }, 400);
    return jsonResponse({ ok: true });
  };
}

/** GET /_decopilot_vm/jobs/:id/stream — SSE: replay buffered output, then live. */
export function makeJobsStreamHandler(deps: JobsDeps) {
  return async (req: Request): Promise<Response> => {
    const id = idFrom(req, "/jobs/", "/stream");
    if (!id) return jsonResponse({ error: "missing job id" }, 400);
    const summary = deps.jobManager.get(id);
    if (!summary) return jsonResponse({ error: "job not found" }, 404);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, payload: unknown) => {
          try {
            controller.enqueue(sseFormat(event, JSON.stringify(payload)));
          } catch {
            /* controller closed */
          }
        };

        const replay = deps.jobManager.output(id);
        if (replay) {
          if (replay.stdout) send("stdout", { data: replay.stdout });
          if (replay.stderr) send("stderr", { data: replay.stderr });
        }
        if (summary.status !== "running") {
          send("end", {
            status: summary.status,
            exitCode: summary.exitCode,
            timedOut: summary.timedOut,
          });
          controller.close();
          return;
        }

        const unsubscribe = deps.jobManager.subscribe(id, (chunk) => {
          send(chunk.stream, { data: chunk.data });
        });

        void deps.jobManager.finished(id)?.then((result) => {
          send("end", {
            status: result.status,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
          });
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });

        req.signal.addEventListener("abort", () => {
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no",
      },
    });
  };
}

function idFrom(req: Request, prefix: string, suffix?: string): string | null {
  const url = new URL(req.url);
  const tail = url.pathname.split(prefix)[1];
  if (!tail) return null;
  let id = tail;
  if (suffix && id.endsWith(suffix)) {
    id = id.slice(0, -suffix.length);
  }
  if (!id || id.includes("/")) return null;
  return id;
}
