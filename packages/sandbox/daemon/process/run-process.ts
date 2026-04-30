import { Broadcaster } from "../events/broadcast";
import { DECO_UID, DECO_GID } from "../constants";
import { spawnPty, type PtyHandle } from "./pty-spawn";

export interface ProcessManagerDeps {
  broadcaster: Broadcaster;
  dropPrivileges?: boolean;
  env?: NodeJS.ProcessEnv;
}

export class ProcessManager {
  private children = new Map<string, PtyHandle>();
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

  run(source: string, cmd: string, label: string): PtyHandle {
    const existing = this.children.get(source);
    if (existing) {
      try {
        existing.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      this.children.delete(source);
    }
    this.deps.broadcaster.broadcastChunk(source, `${label}\r\n`);
    const child = spawnPty({
      cmd,
      env: this.deps.env,
      ...(this.deps.dropPrivileges ? { uid: DECO_UID, gid: DECO_GID } : {}),
    });
    this.children.set(source, child);
    this.deps.broadcaster.broadcastEvent("processes", {
      type: "processes",
      active: this.activeNames(),
    });
    child.onData((data) => this.deps.broadcaster.broadcastChunk(source, data));
    child.onExit(() => {
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
    } catch {
      /* already gone */
    }
    setTimeout(() => {
      if (this.children.get(name) === child) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }, 3000);
    return true;
  }
}
