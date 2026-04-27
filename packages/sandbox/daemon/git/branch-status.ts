import fs from "node:fs";
import type { Broadcaster } from "../events/broadcast";
import type { Config, BranchStatus } from "../types";
import { gitSync } from "./git-sync";

export class BranchStatusMonitor {
  private last: BranchStatus | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watcher: ReturnType<typeof fs.watch> | null = null;

  constructor(
    private readonly config: Config,
    private readonly broadcaster: Broadcaster,
  ) {}

  getLast(): BranchStatus | null {
    return this.last;
  }

  emit(): void {
    const next = this.compute();
    if (!next) return;
    if (this.last && JSON.stringify(this.last) === JSON.stringify(next)) {
      return;
    }
    this.last = next;
    this.broadcaster.broadcastEvent("branch-status", {
      type: "branch-status",
      ...next,
    });
  }

  schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit();
    }, 250);
  }

  watch(): void {
    if (this.watcher) return;
    const gitDir = `${this.config.appRoot}/.git`;
    try {
      this.watcher = fs.watch(gitDir, { recursive: true }, () =>
        this.schedule(),
      );
    } catch {
      setInterval(() => this.emit(), 5000);
    }
  }

  private compute(): BranchStatus | null {
    const run = (args: string[]) => {
      try {
        return gitSync(args, { cwd: this.config.appRoot });
      } catch {
        return "";
      }
    };
    const refExists = (ref: string) =>
      run(["rev-parse", "--verify", "--quiet", ref]).length > 0;
    try {
      const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (!branch || branch === "HEAD") return null;
      let base = run(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
      if (base.startsWith("origin/")) base = base.slice("origin/".length);
      if (!base) base = "main";
      const dirty = run(["status", "--porcelain=v1"]).length > 0;
      const branchRef = refExists(`origin/${branch}`)
        ? `origin/${branch}`
        : "HEAD";
      const unpushed =
        branchRef === `origin/${branch}`
          ? Number(
              run(["rev-list", "--count", `origin/${branch}..HEAD`]) || "0",
            )
          : 0;
      let aheadOfBase = 0;
      let behindBase = 0;
      if (refExists(`origin/${base}`)) {
        const lr = run([
          "rev-list",
          "--left-right",
          "--count",
          `origin/${base}...${branchRef}`,
        ]);
        const m = lr.match(/^(\d+)\s+(\d+)$/);
        if (m) {
          behindBase = Number(m[1]);
          aheadOfBase = Number(m[2]);
        }
      }
      const headSha = run(["rev-parse", branchRef]);
      return {
        branch,
        base,
        workingTreeDirty: dirty,
        unpushed,
        aheadOfBase,
        behindBase,
        headSha,
      };
    } catch {
      return null;
    }
  }
}
