import { spawn, type ChildProcess } from "node:child_process";
import { Broadcaster } from "../events/broadcast";
import { DECO_UID, DECO_GID } from "../constants";

export interface ProcessManagerDeps {
  broadcaster: Broadcaster;
  dropPrivileges?: boolean;
  env?: NodeJS.ProcessEnv;
}

export class ProcessManager {
  private children = new Map<string, ChildProcess>();
  constructor(private readonly deps: ProcessManagerDeps) {}

  activeNames(): string[] {
    return Array.from(this.children.keys());
  }

  /** Pids of every child currently tracked — used to scope port discovery. */
  allPids(): number[] {
    const out: number[] = [];
    for (const child of this.children.values()) {
      if (typeof child.pid === "number") out.push(child.pid);
    }
    return out;
  }

  run(source: string, cmd: string, label: string): ChildProcess {
    const existing = this.children.get(source);
    if (existing) {
      try {
        existing.stdout?.removeAllListeners("data");
        existing.stderr?.removeAllListeners("data");
      } catch {}
      try {
        existing.kill("SIGKILL");
      } catch {}
      this.children.delete(source);
    }
    this.deps.broadcaster.broadcastChunk(source, `${label}\r\n`);
    // stdin is `pipe` (not `ignore`) so it's an open writable that never
    // closes. Vite's CLI shortcuts call setRawMode then watch stdin for EOF;
    // with stdin closed at spawn the child sees EOF immediately and exits
    // right after announcing it's ready. Keeping the pipe open without ever
    // writing to it is the cheapest way to keep long-running dev servers alive.
    const opts: Parameters<typeof spawn>[2] = {
      stdio: ["pipe", "pipe", "pipe"],
      env: this.deps.env,
    };
    if (this.deps.dropPrivileges) {
      (opts as { uid: number; gid: number }).uid = DECO_UID;
      (opts as { uid: number; gid: number }).gid = DECO_GID;
    }
    const child = spawn("sh", ["-c", cmd], opts);
    this.children.set(source, child);
    this.deps.broadcaster.broadcastEvent("processes", {
      type: "processes",
      active: this.activeNames(),
    });
    child.stdout?.on("data", (c: Buffer) =>
      this.deps.broadcaster.broadcastChunk(source, c.toString("utf-8")),
    );
    child.stderr?.on("data", (c: Buffer) =>
      this.deps.broadcaster.broadcastChunk(source, c.toString("utf-8")),
    );
    child.on("error", () => {
      if (this.children.get(source) === child) {
        this.children.delete(source);
        this.deps.broadcaster.broadcastEvent("processes", {
          type: "processes",
          active: this.activeNames(),
        });
      }
    });
    child.on("close", () => {
      if (this.children.get(source) === child) {
        this.children.delete(source);
      }
      this.deps.broadcaster.broadcastEvent("processes", {
        type: "processes",
        active: this.activeNames(),
      });
    });
    return child;
  }

  kill(name: string): boolean {
    const child = this.children.get(name);
    if (!child) return false;
    try {
      child.kill("SIGTERM");
    } catch {}
    setTimeout(() => {
      if (this.children.get(name) === child) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    }, 3000);
    return true;
  }
}
