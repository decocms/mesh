import { DECO_GID, DECO_UID } from "../constants";
import type { Broadcaster } from "../events/broadcast";
import { appLogPath } from "../paths";
import { LogTee } from "../process/log-tee";
import { spawnPty, type PtyHandle } from "../process/pty-spawn";

export type AppStatus = "idle" | "installing" | "starting" | "up" | "failed";

export interface AppStateSnapshot {
  status: AppStatus;
  pid: number | undefined;
  failureReason: string | undefined;
  startedAt: number | undefined;
  installedAt: number | undefined;
  lastExitCode: number | null;
}

export interface ApplicationStartSpec {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  /** Display header echoed at the top of the terminal (e.g. `"$ yarn run dev"`). */
  label: string;
  /**
   * Stable key for global broadcaster events — must match the script-name
   * tab the UI renders against (e.g. `"dev"`). Decoupled from `label` so a
   * pretty header doesn't break the buffer routing.
   */
  source: string;
}

export interface ApplicationServiceDeps {
  broadcaster: Broadcaster;
  /** `<appRoot>/tmp/`. App tee writes to `<logsDir>/app/<spec.source>`. */
  logsDir: string;
  dropPrivileges?: boolean;
  /**
   * Called when the dev process exits non-zero. The owner (orchestrator)
   * is responsible for flipping tenant intent to "paused" so we don't
   * auto-retry — failure is sticky.
   */
  onFailure: (reason: string, exitCode: number) => void;
  /** Called when the dev process is up (probe will fill in details). */
  onStarting?: (pid: number) => void;
  /** Per-launch log file size cap. */
  logMaxBytes?: number;
}

const DEFAULT_LOG_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Singleton service that owns the dev process. Exactly one PTY at a time.
 * Drives the AppStatus state machine; the orchestrator transitions are
 * what call `start()` / `stop()`. The probe observes the PID and writes
 * proxy.targetPort back to the config store.
 */
export class ApplicationService {
  private state: AppStateSnapshot = {
    status: "idle",
    pid: undefined,
    failureReason: undefined,
    startedAt: undefined,
    installedAt: undefined,
    lastExitCode: null,
  };

  private child: PtyHandle | null = null;
  private currentTee: LogTee | null = null;
  private stopResolvers: Array<() => void> = [];
  // Set by stop()/killImmediate() so onExit can distinguish an intentional
  // teardown (no onFailure callback, status → idle) from a real crash
  // (status → failed, owner flips intent to paused). Without this every
  // orchestrator-driven stop (branch/pm/runtime/port change) was
  // misread as a failure and paused the tenant.
  private intentionalStop = false;

  constructor(private readonly deps: ApplicationServiceDeps) {}

  snapshot(): AppStateSnapshot {
    return { ...this.state };
  }

  pid(): number | undefined {
    return this.state.pid;
  }

  /** Mark that an install has completed; UI cares about this for "ready" gating. */
  markInstalled(): void {
    this.state = { ...this.state, installedAt: Date.now() };
  }

  setStatus(status: AppStatus, failureReason?: string): void {
    this.state = {
      ...this.state,
      status,
      failureReason: failureReason ?? this.state.failureReason,
    };
    this.emitStatus();
  }

  /** Start the dev process. Caller asserts the install fingerprint matches. */
  start(spec: ApplicationStartSpec): void {
    if (this.child) {
      // Replace the running process — caller is responsible for any pre-stop logic.
      this.killImmediate();
    }

    // Per-script tee at `<logsDir>/app/<source>` (e.g. `tmp/app/dev`).
    // History accumulates across launches; each (re)start writes a dated
    // event line so the boundary between runs is visible.
    const logPath = appLogPath(this.deps.logsDir, spec.source);
    this.currentTee = new LogTee(
      logPath,
      this.deps.logMaxBytes ?? DEFAULT_LOG_MAX_BYTES,
    );
    this.currentTee.writeHeader(spec.label);

    this.deps.broadcaster.broadcastChunk(spec.source, `${spec.label}\r\n`);
    const child = spawnPty({
      cmd: spec.command,
      cwd: spec.cwd,
      env: spec.env as NodeJS.ProcessEnv | undefined,
      ...(this.deps.dropPrivileges ? { uid: DECO_UID, gid: DECO_GID } : {}),
    });
    this.child = child;

    this.state = {
      ...this.state,
      status: "starting",
      pid: child.pid,
      startedAt: Date.now(),
      lastExitCode: null,
      failureReason: undefined,
    };
    this.emitStatus();
    this.deps.onStarting?.(child.pid);

    child.onData((data) => {
      this.deps.broadcaster.broadcastChunk(spec.source, data);
      this.currentTee?.write(data);
    });

    child.onExit((code) => {
      const wasRunning = this.child === child;
      const exitCode = code;
      this.currentTee?.close();
      this.currentTee = null;

      if (!wasRunning) {
        // We were replaced; ignore.
        return;
      }
      this.child = null;

      // SIGTERM/SIGKILL we initiated → not a failure. The orchestrator
      // calls stop() before pm/branch/port transitions; flagging
      // those exits as failures previously triggered onFailure → intent
      // paused, which made every restart silently no-op.
      const intentional = this.intentionalStop;
      this.intentionalStop = false;
      const wasFailure = !intentional && exitCode !== 0;
      const reason = wasFailure
        ? `dev script exited with code ${exitCode}`
        : intentional
          ? "dev script stopped"
          : "dev script exited cleanly";
      this.state = {
        ...this.state,
        status: wasFailure ? "failed" : "idle",
        pid: undefined,
        failureReason: wasFailure ? reason : undefined,
        lastExitCode: exitCode,
      };
      this.emitStatus();

      const resolvers = this.stopResolvers;
      this.stopResolvers = [];
      for (const r of resolvers) r();

      if (wasFailure) {
        try {
          this.deps.onFailure(reason, exitCode);
        } catch {
          /* failure callback must not crash the daemon */
        }
      }
    });
  }

  /** Returns once the child process actually exits, with grace fallback. */
  async stop(graceMs = 3000): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    const exited = new Promise<void>((resolve) => {
      this.stopResolvers.push(resolve);
    });
    this.intentionalStop = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    const timer = setTimeout(() => {
      if (this.child === child) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }, graceMs);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Probe-only update: dev script is responding. */
  markUp(): void {
    if (this.state.status === "starting") {
      this.state = { ...this.state, status: "up" };
      this.emitStatus();
    }
  }

  isAlive(): boolean {
    return this.child !== null;
  }

  shutdown(): void {
    this.killImmediate();
    this.currentTee?.close();
    this.currentTee = null;
  }

  private killImmediate(): void {
    if (!this.child) return;
    this.intentionalStop = true;
    try {
      this.child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    this.child = null;
  }

  private emitStatus(): void {
    this.deps.broadcaster.broadcastEvent("app-status", {
      type: "app-status",
      ...this.state,
    });
  }
}
