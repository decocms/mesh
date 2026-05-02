import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ApplicationService } from "../app/application-service";
import type { TenantConfigStore } from "../config-store";
import type { Transition } from "../config-store/types";
import {
  PACKAGE_MANAGER_DAEMON_CONFIG,
  WELL_KNOWN_STARTERS,
} from "../constants";
import type { Broadcaster } from "../events/broadcast";
import { gitSync } from "../git/git-sync";
import type { InstallState } from "../install/install-state";
import { InstallState as InstallStateClass } from "../install/install-state";
import { discoverScripts } from "../process/script-discovery";
import type { Config } from "../types";
import { spawnClone } from "./clone";
import { configureGitIdentity } from "./identity";
import { spawnInstall } from "./install";
import { isResume } from "./resume";

export interface SetupOrchestratorDeps {
  bootConfig: { appRoot: string };
  store: TenantConfigStore;
  appService: ApplicationService;
  broadcaster: Broadcaster;
  installState: InstallState;
}

/**
 * Reducer over `Transition` events emitted by the config store.
 *
 * Each transition maps to one async recipe. An internal FIFO queue
 * serializes runs so an in-flight install can't race a branch checkout.
 * Same-kind transitions coalesce (only the most recent matters).
 */
export class SetupOrchestrator {
  private readonly queue: Transition[] = [];
  private running = false;
  private currentBranchHead: string | undefined;

  constructor(private readonly deps: SetupOrchestratorDeps) {}

  /** Fire-and-forget enqueue. */
  handle(transition: Transition): void {
    if (
      transition.kind === "no-op" ||
      transition.kind === "identity-conflict"
    ) {
      return;
    }
    this.coalesce(transition);
    void this.drain();
  }

  /** True while a transition is being applied. Surfaced on /health. */
  isRunning(): boolean {
    return this.running;
  }

  pendingCount(): number {
    return this.queue.length;
  }

  private coalesce(t: Transition): void {
    // Last-of-kind wins for transitions that fully describe themselves.
    const collapsable = new Set([
      "branch-change",
      "pm-change",
      "runtime-change",
      "desired-port-change",
      "intent-change",
      "proxy-retarget",
    ]);
    if (collapsable.has(t.kind)) {
      const idx = this.queue.findIndex((q) => q.kind === t.kind);
      if (idx >= 0) this.queue.splice(idx, 1);
    }
    this.queue.push(t);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const t = this.queue.shift();
        if (!t) break;
        try {
          await this.run(t);
        } catch (e) {
          this.deps.broadcaster.broadcastChunk(
            "setup",
            `\r\n[orchestrator] transition ${t.kind} failed: ${(e as Error).message}\r\n`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async run(t: Transition): Promise<void> {
    switch (t.kind) {
      case "first-bootstrap":
        return this.firstBootstrap();
      case "resume":
        return this.resumeFlow();
      case "branch-change":
        return this.branchChange(t.to);
      case "pm-change":
      case "runtime-change":
        return this.reinstallAndMaybeStart();
      case "desired-port-change":
        return this.maybeRestartDev();
      case "intent-change":
        if (t.to === "paused") return this.deps.appService.stop();
        return this.startIfReady();
      case "proxy-retarget":
        return; // probe pin reads from store; nothing for the reducer to do
      case "no-op":
      case "identity-conflict":
        return;
    }
  }

  private currentConfig(): Config | null {
    const enriched = this.deps.store.read();
    if (!enriched) return null;
    return Object.freeze({
      ...enriched,
      daemonToken: "",
      daemonBootId: "",
      proxyPort: 0,
      appRoot: this.deps.bootConfig.appRoot,
    }) as Config;
  }

  private chunk(data: string): void {
    this.deps.broadcaster.broadcastChunk("setup", data);
  }

  private async firstBootstrap(): Promise<void> {
    const config = this.currentConfig();
    if (!config) return;
    try {
      configureGitIdentity(config);
    } catch (e) {
      this.chunk(
        `\r\nWarning: git identity setup failed: ${(e as Error).message}\r\n`,
      );
    }

    const cloneUrl = config.git?.repository?.cloneUrl;
    if (cloneUrl && !isResume(config.appRoot)) {
      const code = await spawnClone({
        config,
        onChunk: (_src, data) => this.chunk(data),
      });
      if (code !== 0) {
        this.chunk(`\r\nClone failed with exit code ${code}\r\n`);
        return;
      }
    } else if (cloneUrl) {
      this.chunk(`$ (resuming setup; ${config.appRoot} already cloned)\r\n`);
    }

    if (config.git?.repository?.branch) {
      try {
        await this.checkoutBranch(config.git.repository.branch);
      } catch (e) {
        this.chunk(
          `\r\nWarning: branch resolution failed: ${(e as Error).message}\r\n`,
        );
      }
    }
    this.refreshBranchHead();

    if (config.application?.intent === "running") {
      const installed = await this.runInstall();
      if (installed) await this.startIfReady();
    }
  }

  private async resumeFlow(): Promise<void> {
    const config = this.currentConfig();
    if (!config) return;
    try {
      configureGitIdentity(config);
    } catch (e) {
      this.chunk(
        `\r\nWarning: git identity setup failed: ${(e as Error).message}\r\n`,
      );
    }
    if (config.git?.repository?.branch) {
      try {
        await this.checkoutBranch(config.git.repository.branch);
      } catch (e) {
        this.chunk(
          `\r\nWarning: branch sync failed: ${(e as Error).message}\r\n`,
        );
      }
    }
    this.refreshBranchHead();

    if (config.application?.intent === "running") {
      if (
        !this.deps.installState.isInstalledFor(config, this.currentBranchHead)
      ) {
        const ok = await this.runInstall();
        if (!ok) return;
      }
      await this.startIfReady();
    }
  }

  private async branchChange(to: string): Promise<void> {
    await this.deps.appService.stop();
    try {
      await this.checkoutBranch(to);
    } catch (e) {
      this.chunk(`\r\nbranch-change failed: ${(e as Error).message}\r\n`);
      return;
    }
    this.refreshBranchHead();
    const ok = await this.runInstall();
    if (ok) await this.startIfReady();
  }

  private async reinstallAndMaybeStart(): Promise<void> {
    await this.deps.appService.stop();
    const ok = await this.runInstall();
    if (ok) await this.startIfReady();
  }

  private async maybeRestartDev(): Promise<void> {
    if (!this.deps.appService.isAlive()) return;
    await this.deps.appService.stop();
    await this.startIfReady();
  }

  /**
   * Start the dev script iff intent=running, install fingerprint matches,
   * and we have a discovered start script. Otherwise nothing — the daemon
   * will not auto-retry; tenant must flip intent to (paused→running) or
   * change pm/runtime/branch to nudge another attempt.
   */
  private async startIfReady(): Promise<void> {
    const config = this.currentConfig();
    if (!config) return;
    if (config.application?.intent !== "running") return;
    if (
      !this.deps.installState.isInstalledFor(config, this.currentBranchHead)
    ) {
      this.chunk(
        "\r\n[orchestrator] skipping start: install fingerprint mismatch\r\n",
      );
      return;
    }
    const command = this.buildStartCommand(config);
    if (!command) {
      this.chunk(
        "\r\n[orchestrator] skipping start: no dev/start script discovered\r\n",
      );
      return;
    }
    const env: Record<string, string> = {
      HOST: "0.0.0.0",
      HOSTNAME: "0.0.0.0",
    };
    const desired = config.application?.desiredPort;
    if (desired !== undefined) env.PORT = String(desired);
    this.deps.appService.start({
      command: command.cmd,
      cwd: config.appRoot,
      env,
      label: command.label,
      source: command.source,
    });
  }

  private buildStartCommand(
    config: Config,
  ): { cmd: string; label: string; source: string } | null {
    const pm = config.application?.packageManager?.name;
    if (!pm) return null;
    const pmConf = PACKAGE_MANAGER_DAEMON_CONFIG[pm];
    if (!pmConf) return null;
    const scripts = discoverScripts(config.appRoot, pm);
    const starter = WELL_KNOWN_STARTERS.find((s) => scripts.includes(s));
    if (!starter) return null;
    const prefix = config.runtimePathPrefix;
    return {
      cmd: `${prefix}cd ${config.appRoot} && ${pmConf.runPrefix} ${starter}`,
      label: `$ ${pmConf.runPrefix} ${starter}`,
      // UI tab key — matches scripts list entries the UI renders against.
      source: starter,
    };
  }

  private async runInstall(): Promise<boolean> {
    const config = this.currentConfig();
    if (!config) return false;
    if (!config.application?.packageManager?.name) return false;
    this.deps.appService.setStatus("installing");
    const installPromise = spawnInstall({
      config,
      onChunk: (_src, data) => this.chunk(data),
    });
    if (!installPromise) {
      this.deps.appService.setStatus("idle");
      return false;
    }
    const code = await installPromise;
    if (code !== 0) {
      this.chunk(`\r\nInstall failed with exit code ${code}\r\n`);
      this.deps.appService.setStatus("failed", `install exit ${code}`);
      this.deps.installState.mark(
        InstallStateClass.fingerprint(config, this.currentBranchHead),
        false,
      );
      return false;
    }
    this.deps.installState.mark(
      InstallStateClass.fingerprint(config, this.currentBranchHead),
      true,
    );
    this.deps.appService.markInstalled();
    this.deps.appService.setStatus("idle");

    // Broadcast discovered scripts so SSE consumers can populate dropdowns.
    const cwd = config.application?.packageManager?.path ?? config.appRoot;
    const scripts = discoverScripts(
      cwd,
      config.application?.packageManager?.name ?? null,
    );
    this.deps.broadcaster.broadcastEvent("scripts", {
      type: "scripts",
      scripts,
    });
    return true;
  }

  private refreshBranchHead(): void {
    const appRoot = this.deps.bootConfig.appRoot;
    if (!appRoot) return;
    if (!existsSync(join(appRoot, ".git"))) {
      this.currentBranchHead = undefined;
      return;
    }
    try {
      this.currentBranchHead = gitSync(["rev-parse", "HEAD"], { cwd: appRoot });
    } catch {
      this.currentBranchHead = undefined;
    }
  }

  private async checkoutBranch(branch: string): Promise<void> {
    const appRoot = this.deps.bootConfig.appRoot;
    if (!appRoot) return;
    let onRemote = false;
    try {
      gitSync(
        [
          "-c",
          "safe.directory=*",
          "fetch",
          "origin",
          `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
        ],
        { cwd: appRoot },
      );
      gitSync(
        ["-c", "safe.directory=*", "fetch", "origin", `${branch}:${branch}`],
        { cwd: appRoot },
      );
      onRemote = true;
    } catch {
      /* not on remote — fall through to local create */
    }
    if (onRemote) {
      gitSync(["-c", "safe.directory=*", "checkout", branch], { cwd: appRoot });
      return;
    }
    try {
      gitSync(["-c", "safe.directory=*", "checkout", branch], { cwd: appRoot });
    } catch {
      gitSync(["-c", "safe.directory=*", "checkout", "-b", branch], {
        cwd: appRoot,
      });
    }
  }
}
