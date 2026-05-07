import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Broadcaster } from "../events/broadcast";
import type { BranchStatusMonitor } from "../git/branch-status";
import { SetupOrchestrator } from "./orchestrator";

function tempRoot(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "orch-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function makeMonitorSpy() {
  const calls: Array<{ method: string; arg?: unknown }> = [];
  const monitor = {
    setPhase(arg: unknown) {
      calls.push({ method: "setPhase", arg });
    },
    markReady() {
      calls.push({ method: "markReady" });
    },
  } as unknown as BranchStatusMonitor;
  return { monitor, calls };
}

describe("SetupOrchestrator branch-status integration", () => {
  it("setPhase('cloning') is called before clone, 'clone-failed' on non-zero exit", async () => {
    const { dir, cleanup } = tempRoot();
    try {
      const broadcaster = new Broadcaster(1024);
      const { monitor, calls } = makeMonitorSpy();

      // Build orchestrator with a config that points to an unreachable
      // cloneUrl so spawnClone exits non-zero quickly.
      const orchestrator = new SetupOrchestrator({
        bootConfig: { appRoot: dir, repoDir: join(dir, "repo") },
        store: {
          read: () => ({
            git: {
              repository: { cloneUrl: "https://invalid.example.invalid/x.git" },
            },
            application: {},
          }),
          hydrate: () => {},
          applyInternal: async () => ({
            kind: "applied",
            before: null,
            after: {},
            transition: { kind: "no-op" },
          }),
        } as never,
        appService: { stop: async () => {}, snapshot: () => ({}) } as never,
        broadcaster,
        installState: { isInstalledFor: () => false } as never,
        logsDir: dir,
        branchStatus: monitor,
      });

      orchestrator.handle({
        kind: "bootstrap",
        config: {} as never,
      });

      // Poll until the orchestrator finishes the queue (or 15s timeout)
      const deadline = Date.now() + 15_000;
      while (orchestrator.isRunning() || orchestrator.pendingCount() > 0) {
        if (Date.now() > deadline) throw new Error("orchestrator hung");
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(calls[0]).toEqual({
        method: "setPhase",
        arg: { kind: "cloning" },
      });
      const failed = calls.find(
        (c) =>
          c.method === "setPhase" &&
          (c.arg as { kind: string })?.kind === "clone-failed",
      );
      expect(failed).toBeTruthy();
      expect(calls.some((c) => c.method === "markReady")).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("setPhase('checking-out') / 'checkout-failed' on branchChange error", async () => {
    const { dir, cleanup } = tempRoot();
    try {
      mkdirSync(join(dir, "repo"));
      // No git repo at appRoot, so checkout will fail
      const broadcaster = new Broadcaster(1024);
      const { monitor, calls } = makeMonitorSpy();

      const orchestrator = new SetupOrchestrator({
        bootConfig: { appRoot: dir, repoDir: join(dir, "repo") },
        store: {
          read: () => ({
            git: { repository: { cloneUrl: "" } },
            application: {},
          }),
          hydrate: () => {},
          applyInternal: async () => ({
            kind: "applied",
            before: null,
            after: {},
            transition: { kind: "no-op" },
          }),
        } as never,
        appService: { stop: async () => {}, snapshot: () => ({}) } as never,
        broadcaster,
        installState: { isInstalledFor: () => false } as never,
        logsDir: dir,
        branchStatus: monitor,
      });

      orchestrator.handle({
        kind: "branch-change",
        from: "main",
        to: "feat/x",
      });

      const deadline = Date.now() + 5_000;
      while (orchestrator.isRunning() || orchestrator.pendingCount() > 0) {
        if (Date.now() > deadline) throw new Error("orchestrator hung");
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(calls[0]).toEqual({
        method: "setPhase",
        arg: { kind: "checking-out", to: "feat/x" },
      });
      const failed = calls.find(
        (c) =>
          c.method === "setPhase" &&
          (c.arg as { kind: string })?.kind === "checkout-failed",
      );
      expect(failed).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});
