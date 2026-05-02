import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LogTee } from "./log-tee";
import { spawnPty } from "./pty-spawn";
import { RingBuffer } from "./ring-buffer";

const RING_BUFFER_BYTES = 256 * 1024;
const LOG_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_REAP_INTERVAL_MS = 60 * 1000;
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const JOB_FILE_PREFIX = "job";

export type JobStatus = "running" | "exited" | "failed" | "killed" | "timeout";

export type JobSpawnMode = "pipe" | "pty";

export interface JobSpec {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  mode: JobSpawnMode;
  timeoutMs?: number;
  /** Display label for SSE / log header. */
  label?: string;
  /**
   * Named-script tee. When set, output writes to `<logsDir>/app/<logName>`
   * (stable filename, overwritten across runs of the same name). When
   * unset, output writes to `<logsDir>/<jobId>` where jobId is `job<N>`
   * (sequential within the daemon lifetime, purged on startup).
   */
  logName?: string;
}

interface OutputChunk {
  stream: "stdout" | "stderr";
  data: string;
}

export interface JobSummary {
  id: string;
  command: string;
  status: JobStatus;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export interface JobResult {
  exitCode: number;
  status: JobStatus;
  timedOut: boolean;
}

interface JobInternal {
  id: string;
  spec: JobSpec;
  status: JobStatus;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
  timedOut: boolean;
  pid: number | undefined;
  pgid: number | undefined;
  stdout: RingBuffer;
  stderr: RingBuffer;
  /**
   * Single combined tee at `<logsDir>/<id>`. Header line ("$ <command>")
   * is written first, then stdout + stderr chunks interleave in arrival
   * order. Capped at 10MB; cleaned up when the job is reaped.
   */
  tee: LogTee;
  logPath: string;
  subscribers: Set<(c: OutputChunk) => void>;
  finishedPromise: Promise<JobResult>;
  resolveFinished: (r: JobResult) => void;
  kill: (signal?: NodeJS.Signals) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface JobManagerDeps {
  /** Where per-job logs live: <logsDir>/<jobId>/{stdout,stderr}.log. */
  logsDir: string;
  ttlMs?: number;
  reapIntervalMs?: number;
  /** Fires on spawn and finalize so callers can re-broadcast the running set. */
  onChange?: () => void;
}

/**
 * Manages transient, concurrent jobs (ad-hoc bash, package scripts via
 * /exec/:name). UUID-keyed; many jobs may run in parallel. The managed
 * application service (dev server) is NOT here — see ApplicationService.
 *
 * Lifecycle:
 *   spawn → running → (exited | failed | killed | timeout)
 *   completed jobs are reaped after `ttlMs` (default 15 min).
 */
export class JobManager {
  private readonly jobs = new Map<string, JobInternal>();
  private readonly reaper: ReturnType<typeof setInterval>;
  private readonly ttlMs: number;
  private idCounter = 0;

  constructor(private readonly deps: JobManagerDeps) {
    this.ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
    // Stale `job*` files from previous daemon lifetimes are unreachable
    // (in-memory state is gone; IDs restart from 1). Drop them so the
    // workspace doesn't accumulate orphaned tees.
    this.purgeStaleLogs();
    this.reaper = setInterval(
      () => this.reap(),
      deps.reapIntervalMs ?? DEFAULT_REAP_INTERVAL_MS,
    );
    this.reaper.unref?.();
  }

  spawn(spec: JobSpec): JobSummary {
    const id = `${JOB_FILE_PREFIX}${++this.idCounter}`;
    const job = this.create(id, spec);
    this.jobs.set(id, job);
    this.deps.onChange?.();
    return summarize(job);
  }

  get(id: string): JobSummary | null {
    const j = this.jobs.get(id);
    return j ? summarize(j) : null;
  }

  output(
    id: string,
  ): { stdout: string; stderr: string; truncated: boolean } | null {
    const j = this.jobs.get(id);
    if (!j) return null;
    const stdout = j.stdout.read();
    const stderr = j.stderr.read();
    return {
      stdout: stdout.data,
      stderr: stderr.data,
      truncated: stdout.truncated || stderr.truncated || j.tee.isTruncated(),
    };
  }

  finished(id: string): Promise<JobResult> | null {
    const j = this.jobs.get(id);
    return j ? j.finishedPromise : null;
  }

  subscribe(id: string, fn: (c: OutputChunk) => void): (() => void) | null {
    const j = this.jobs.get(id);
    if (!j) return null;
    j.subscribers.add(fn);
    return () => j.subscribers.delete(fn);
  }

  list(filter?: { status?: ReadonlyArray<JobStatus> }): JobSummary[] {
    const out: JobSummary[] = [];
    for (const j of this.jobs.values()) {
      if (filter?.status && !filter.status.includes(j.status)) continue;
      out.push(summarize(j));
    }
    return out;
  }

  kill(id: string, signal: NodeJS.Signals = "SIGTERM"): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    if (j.status !== "running") return false;
    j.kill(signal);
    setTimeout(() => {
      if (j.status === "running") {
        j.kill("SIGKILL");
      }
    }, 3000);
    return true;
  }

  killAll(): number {
    let count = 0;
    for (const j of this.jobs.values()) {
      if (j.status === "running") {
        j.kill("SIGTERM");
        count++;
      }
    }
    return count;
  }

  delete(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    if (j.status === "running") return false;
    this.jobs.delete(id);
    j.tee.close();
    this.unlink(j.logPath);
    return true;
  }

  shutdown(): void {
    clearInterval(this.reaper);
    for (const j of this.jobs.values()) {
      if (j.status === "running") j.kill("SIGKILL");
      j.tee.close();
    }
    this.jobs.clear();
  }

  private reap(): void {
    const now = Date.now();
    for (const [id, j] of this.jobs) {
      if (j.status === "running" || j.finishedAt === null) continue;
      if (now - j.finishedAt > this.ttlMs) {
        this.jobs.delete(id);
        j.tee.close();
        this.unlink(j.logPath);
      }
    }
  }

  private purgeStaleLogs(): void {
    let entries: string[];
    try {
      entries = readdirSync(this.deps.logsDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name.startsWith(JOB_FILE_PREFIX)) continue;
      this.unlink(join(this.deps.logsDir, name));
    }
  }

  private unlink(path: string): void {
    try {
      unlinkSync(path);
    } catch {
      /* file already gone or never opened */
    }
  }

  private create(id: string, spec: JobSpec): JobInternal {
    const stdout = new RingBuffer(RING_BUFFER_BYTES);
    const stderr = new RingBuffer(RING_BUFFER_BYTES);
    const logPath = spec.logName
      ? join(this.deps.logsDir, "app", spec.logName)
      : join(this.deps.logsDir, id);
    const tee = new LogTee(logPath, LOG_MAX_BYTES);
    const header = spec.label ?? `$ ${spec.command}`;
    // Named-script tees keep history across runs; mark each invocation
    // with a dated event line so the boundary between runs is obvious.
    tee.write(
      existsSync(logPath)
        ? `\r\n=== ${new Date().toISOString()} ${header} ===\r\n`
        : `${header}\r\n`,
    );
    const subscribers = new Set<(c: OutputChunk) => void>();

    let resolveFinished!: (r: JobResult) => void;
    const finishedPromise = new Promise<JobResult>((resolve) => {
      resolveFinished = resolve;
    });

    const job: JobInternal = {
      id,
      spec,
      status: "running",
      exitCode: null,
      startedAt: Date.now(),
      finishedAt: null,
      timedOut: false,
      pid: undefined,
      pgid: undefined,
      stdout,
      stderr,
      tee,
      logPath,
      subscribers,
      finishedPromise,
      resolveFinished,
      kill: () => undefined,
      timer: null,
    };

    if (spec.mode === "pty") {
      this.startPty(job);
    } else {
      this.startPipe(job);
    }
    return job;
  }

  private startPty(job: JobInternal): void {
    let child: ReturnType<typeof spawnPty>;
    try {
      child = spawnPty({
        cmd: job.spec.command,
        cwd: job.spec.cwd,
        env: job.spec.env as NodeJS.ProcessEnv | undefined,
      });
    } catch (e) {
      const msg = `spawn error: ${(e as Error).message}\n`;
      job.stderr.append(msg);
      job.tee.write(msg);
      this.fanOut(job, { stream: "stderr", data: msg });
      // Defer finalize so callers awaiting `finished` see the same shape
      // as a normal exit; spawn() returning synchronously must observe a
      // running job for one tick before it resolves to failed.
      queueMicrotask(() =>
        this.finalize(job, { exitCode: -1, timedOut: false }),
      );
      return;
    }
    job.pid = child.pid;
    job.kill = (signal) => child.kill(signal ?? "SIGTERM");

    child.onData((data) => {
      job.stdout.append(data);
      job.tee.write(data);
      this.fanOut(job, { stream: "stdout", data });
    });

    if (job.spec.timeoutMs && job.spec.timeoutMs > 0) {
      job.timer = setTimeout(() => {
        if (job.status !== "running") return;
        job.timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, job.spec.timeoutMs);
    }

    child.onExit((code) => {
      if (job.timer) clearTimeout(job.timer);
      this.finalize(job, {
        exitCode: code,
        timedOut: job.timedOut,
      });
    });
  }

  private startPipe(job: JobInternal): void {
    const opts: Parameters<typeof nodeSpawn>[2] = {
      cwd: job.spec.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: job.spec.env,
      detached: true,
    };
    const child: ChildProcess = nodeSpawn(
      "bash",
      ["-c", job.spec.command],
      opts,
    );
    job.pid = child.pid;
    job.pgid = child.pid;

    const killGroup = (signal: NodeJS.Signals) => {
      if (job.pgid === undefined) return;
      try {
        process.kill(-job.pgid, signal);
      } catch {
        /* group already gone */
      }
    };
    job.kill = (signal) => killGroup(signal ?? "SIGTERM");

    child.stdout?.on("data", (chunk: Buffer) => {
      const data = chunk.toString("utf-8");
      job.stdout.append(data);
      job.tee.write(data);
      this.fanOut(job, { stream: "stdout", data });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const data = chunk.toString("utf-8");
      job.stderr.append(data);
      job.tee.write(data);
      this.fanOut(job, { stream: "stderr", data });
    });

    if (job.spec.timeoutMs && job.spec.timeoutMs > 0) {
      job.timer = setTimeout(() => {
        if (job.status !== "running") return;
        job.timedOut = true;
        killGroup("SIGKILL");
      }, job.spec.timeoutMs);
    }

    child.on("close", (code) => {
      if (job.timer) clearTimeout(job.timer);
      // Reap survivors of any backgrounded children.
      killGroup("SIGKILL");
      this.finalize(job, {
        exitCode: code ?? 1,
        timedOut: job.timedOut,
      });
    });
    child.on("error", (err) => {
      if (job.timer) clearTimeout(job.timer);
      const msg = `spawn error: ${err.message}\n`;
      job.stderr.append(msg);
      job.tee.write(msg);
      this.fanOut(job, { stream: "stderr", data: msg });
      this.finalize(job, { exitCode: -1, timedOut: false });
    });
  }

  private finalize(
    job: JobInternal,
    result: { exitCode: number; timedOut: boolean },
  ): void {
    if (job.status !== "running") return;
    let status: JobStatus;
    if (result.timedOut) status = "timeout";
    else if (result.exitCode === 0) status = "exited";
    else if (result.exitCode === -1) status = "failed";
    else if (result.exitCode > 128) status = "killed";
    else status = "exited";
    job.status = status;
    job.exitCode = result.exitCode;
    job.finishedAt = Date.now();
    job.tee.close();
    job.resolveFinished({
      exitCode: result.exitCode,
      status,
      timedOut: result.timedOut,
    });
    this.deps.onChange?.();
  }

  private fanOut(job: JobInternal, chunk: OutputChunk): void {
    for (const sub of job.subscribers) {
      try {
        sub(chunk);
      } catch {
        /* one bad subscriber doesn't stop the rest */
      }
    }
  }
}

function summarize(j: JobInternal): JobSummary {
  return {
    id: j.id,
    command: j.spec.command,
    status: j.status,
    exitCode: j.exitCode,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    timedOut: j.timedOut,
    truncated: j.tee.isTruncated(),
  };
}
