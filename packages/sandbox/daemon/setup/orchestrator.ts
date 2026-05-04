import { existsSync, unlinkSync } from "node:fs";
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
import { LogTee } from "../process/log-tee";
import { discoverScripts } from "../process/script-discovery";
import type { Config } from "../types";
import { spawnClone } from "./clone";
import { configureGitIdentity } from "./identity";
import { spawnInstall } from "./install";
import { isResume } from "./resume";

const INSTALL_LOG_MAX_BYTES = 10 * 1024 * 1024;

export interface SetupOrchestratorDeps {
  bootConfig: { appRoot: string; repoDir: string };
  store: TenantConfigStore;
  appService: ApplicationService;
  broadcaster: Broadcaster;
  installState: InstallState;
  /** Workspace tmp dir; install tee lives at `<logsDir>/app/install`. */
  logsDir: string;
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
      repoDir: this.deps.bootConfig.repoDir,
    }) as Config;
  }

  private chunk(data: string): void {
    this.deps.broadcaster.broadcastChunk("setup", data);
  }

  private async firstBootstrap(): Promise<void> {
    const config = this.currentConfig();
    if (!config) return;

    const cloneUrl = config.git?.repository?.cloneUrl;
    if (cloneUrl && !isResume(config.repoDir)) {
      const code = await spawnClone({
        config,
        onChunk: (_src, data) => this.chunk(data),
      });
      if (code !== 0) {
        this.chunk(`\r\nClone failed with exit code ${code}\r\n`);
        return;
      }
    } else if (cloneUrl) {
      this.chunk(`$ (resuming setup; ${config.repoDir} already cloned)\r\n`);
    }

    // Identity has to run after clone so `git config` has a repo to write
    // into — earlier order tripped posix_spawn ENOENT (it reads cwd before
    // exec, and repoDir doesn't exist until clone returns).
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
      } else {
        // Skipping runInstall on resume means the SSE `scripts` event from
        // that path doesn't fire — broadcast directly so the UI's Dev/Start
        // tabs reappear after a daemon restart.
        this.broadcastDiscoveredScripts(config);
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
      cwd: config.repoDir,
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
    const scripts = discoverScripts(config.repoDir, pm);
    const starter = WELL_KNOWN_STARTERS.find((s) => scripts.includes(s));
    if (!starter) return null;
    const prefix = config.runtimePathPrefix;
    return {
      cmd: `${prefix}cd ${config.repoDir} && ${pmConf.runPrefix} ${starter}`,
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
    const installLogPath = join(this.deps.logsDir, "app", "install");
    try {
      unlinkSync(installLogPath);
    } catch {
      /* not present */
    }
    const installTee = new LogTee(installLogPath, INSTALL_LOG_MAX_BYTES);
    const installPromise = spawnInstall({
      config,
      onChunk: (_src, data) => {
        this.chunk(data);
        installTee.write(data);
      },
    });
    // null = no install step needed (e.g. deno auto-fetches; or no manifest
    // present yet). Treat as success so the caller proceeds to start; mark
    // the install fingerprint so resume doesn't retry on every boot.
    if (!installPromise) {
      installTee.close();
      this.deps.installState.mark(
        InstallStateClass.fingerprint(config, this.currentBranchHead),
        true,
      );
      this.deps.appService.markInstalled();
      this.deps.appService.setStatus("idle");
      this.broadcastDiscoveredScripts(config);
      return true;
    }
    const code = await installPromise;
    installTee.close();
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
    this.broadcastDiscoveredScripts(config);
    return true;
  }

  // Source of truth for the SSE `scripts` event. Without this the UI never
  // opens script tabs (e.g. Dev) — the env panel gates `openScriptTabs` on
  // `vmEvents.scripts`. Idempotent: callers in both fresh-install and
  // skip-install paths dispatch the same payload.
  private broadcastDiscoveredScripts(config: Config): void {
    const cwd = config.application?.packageManager?.path ?? config.repoDir;
    const scripts = discoverScripts(
      cwd,
      config.application?.packageManager?.name ?? null,
    );
    this.deps.broadcaster.broadcastEvent("scripts", {
      type: "scripts",
      scripts,
    });
  }

  private refreshBranchHead(): void {
    const repoDir = this.deps.bootConfig.repoDir;
    if (!repoDir) return;
    if (!existsSync(join(repoDir, ".git"))) {
      this.currentBranchHead = undefined;
      return;
    }
    try {
      this.currentBranchHead = gitSync(["rev-parse", "HEAD"], { cwd: repoDir });
    } catch {
      this.currentBranchHead = undefined;
    }
  }

  private async checkoutBranch(branch: string): Promise<void> {
    const repoDir = this.deps.bootConfig.repoDir;
    if (!repoDir) return;
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
        { cwd: repoDir },
      );
      gitSync(
        ["-c", "safe.directory=*", "fetch", "origin", `${branch}:${branch}`],
        { cwd: repoDir },
      );
      onRemote = true;
    } catch {
      /* not on remote — fall through to local create */
    }
    if (onRemote) {
      gitSync(["-c", "safe.directory=*", "checkout", branch], { cwd: repoDir });
      return;
    }
    try {
      gitSync(["-c", "safe.directory=*", "checkout", branch], { cwd: repoDir });
    } catch {
      gitSync(["-c", "safe.directory=*", "checkout", "-b", branch], {
        cwd: repoDir,
      });
    }
  }
}
