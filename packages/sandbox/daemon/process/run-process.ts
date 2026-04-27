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
    const opts: Parameters<typeof spawn>[2] = {
      stdio: ["ignore", "pipe", "pipe"],
      env: this.deps.env,
    };
    if (this.deps.dropPrivileges) {
      (opts as { uid: number; gid: number }).uid = DECO_UID;
      (opts as { uid: number; gid: number }).gid = DECO_GID;
    }
    const child = spawn("script", ["-q", "-c", cmd, "/dev/null"], opts);
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
