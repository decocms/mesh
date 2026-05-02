import type { Broadcaster } from "../events/broadcast";
import { discoverScripts } from "../process/script-discovery";
import { autoStartDev } from "../process/dev-autostart";
import type { ProcessManager } from "../process/run-process";
import type { Config } from "../types";
import { isResume } from "./resume";
import { spawnClone } from "./clone";
import { configureGitIdentity } from "./identity";
import { spawnInstall } from "./install";
import { resolveBranch } from "./branch";

export interface SetupState {
  running: boolean;
  done: boolean;
}

export interface SetupOrchestratorDeps {
  config: Config;
  broadcaster: Broadcaster;
  processManager: ProcessManager;
  dropPrivileges?: boolean;
  onTerminal?: (outcome: "ready" | "failed", reason?: string) => void;
}

export class SetupOrchestrator {
  readonly state: SetupState = { running: false, done: false };

  constructor(private readonly deps: SetupOrchestratorDeps) {}

  /** Returns true if the run started, false if it was rejected by the re-entry guard. */
  async run(): Promise<boolean> {
    if (this.state.running) return false;
    this.state.running = true;
    // Yield so concurrent callers see running=true before we proceed.
    // Without this, a no-op run (no clone, no install) would complete
    // synchronously and reset running=false before a second HTTP request's
    // handler even checks — making the 409 re-entry guard invisible.
    await Promise.resolve();
    const { config, broadcaster, processManager, dropPrivileges, onTerminal } =
      this.deps;

    const onChunk = (_src: "setup", data: string) =>
      broadcaster.broadcastChunk("setup", data);

    const finishFailed = (reason: string) => {
      this.state.running = false;
      this.state.done = true;
      onTerminal?.("failed", reason);
      return true;
    };

    try {
      configureGitIdentity(config);
    } catch (e) {
      broadcaster.broadcastChunk(
        "setup",
        `\r\nWarning: git identity setup failed: ${(e as Error).message}\r\n`,
      );
    }

    try {
      const notResume = !isResume(config.appRoot);
      const cloneUrl = config.git?.repository?.cloneUrl;
      try {
        if (notResume && cloneUrl) {
          const code = await spawnClone({ config, onChunk, dropPrivileges });
          if (code !== 0) {
            broadcaster.broadcastChunk(
              "setup",
              `\r\nClone failed with exit code ${code}\r\n`,
            );
            return finishFailed(`clone exit ${code}`);
          }
        } else if (isResume(config.appRoot)) {
          broadcaster.broadcastChunk(
            "setup",
            `$ (resuming setup; ${config.appRoot} already cloned)\r\n`,
          );
        }
      } catch (e) {
        const message = (e as Error).message;
        broadcaster.broadcastChunk(
          "setup",
          `\r\nBranch resolution error: ${message}\r\n`,
        );
        return finishFailed(message);
      }

      try {
        resolveBranch({ config });
      } catch (e) {
        broadcaster.broadcastChunk(
          "setup",
          `\r\nWarning: branch resolution failed: ${(e as Error).message}\r\n`,
        );
      }

      const installPromise = spawnInstall({
        config,
        onChunk,
        dropPrivileges,
      });
      if (installPromise) {
        const code = await installPromise;
        if (code !== 0) {
          broadcaster.broadcastChunk(
            "setup",
            `\r\nInstall failed with exit code ${code}\r\n`,
          );
          return finishFailed(`install exit ${code}`);
        }
      }

      const scripts = discoverScripts(
        config.appRoot,
        config.application?.packageManager?.name ?? null,
      );
      broadcaster.broadcastEvent("scripts", { type: "scripts", scripts });
      autoStartDev({ config, scripts, pm: processManager });

      this.state.running = false;
      this.state.done = true;
      onTerminal?.("ready");
      return true;
    } catch (e) {
      const message = (e as Error).message;
      broadcaster.broadcastChunk("setup", `\r\nSetup error: ${message}\r\n`);
      return finishFailed(message);
    }
  }
}
