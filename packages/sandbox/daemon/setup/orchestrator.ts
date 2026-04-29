import type { Broadcaster } from "../events/broadcast";
import { discoverScripts } from "../process/script-discovery";
import { autoStartDev } from "../process/dev-autostart";
import type { ProcessManager } from "../process/run-process";
import type { Config } from "../types";
import { isResume } from "./resume";
import { spawnClone } from "./clone";
import { configureGitIdentity } from "./identity";
import { resolveBranch } from "./branch";
import { spawnInstall } from "./install";
import { linkNextCache, linkNodeModules } from "./cache";

export interface SetupState {
  running: boolean;
  done: boolean;
}

export interface SetupOrchestratorDeps {
  config: Config;
  broadcaster: Broadcaster;
  processManager: ProcessManager;
  dropPrivileges?: boolean;
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
    const { config, broadcaster, processManager, dropPrivileges } = this.deps;

    const onChunk = (_src: "setup", data: string) =>
      broadcaster.broadcastChunk("setup", data);

    try {
      if (!isResume(config.appRoot) && config.cloneUrl) {
        const code = await spawnClone({ config, onChunk, dropPrivileges });
        if (code !== 0) {
          broadcaster.broadcastChunk(
            "setup",
            `\r\nClone failed with exit code ${code}\r\n`,
          );
          this.state.running = false;
          this.state.done = true;
          return true;
        }
      } else if (isResume(config.appRoot)) {
        broadcaster.broadcastChunk(
          "setup",
          `$ (resuming setup; ${config.appRoot} already cloned)\r\n`,
        );
      }

      if (config.cloneUrl) {
        try {
          configureGitIdentity(config);
        } catch (e) {
          broadcaster.broadcastChunk(
            "setup",
            `\r\nWarning: git identity setup failed: ${(e as Error).message}\r\n`,
          );
        }
        try {
          resolveBranch({ config });
        } catch (e) {
          broadcaster.broadcastChunk(
            "setup",
            `\r\nWarning: branch resolution failed: ${(e as Error).message}\r\n`,
          );
        }
      }

      linkNextCache({ config, onChunk, dropPrivileges });

      const nmCached = await linkNodeModules({
        config,
        onChunk,
        dropPrivileges,
      });
      if (!nmCached) {
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
            this.state.running = false;
            this.state.done = true;
            return true;
          }
        }
      }

      const scripts = discoverScripts(config.appRoot, config.packageManager);
      broadcaster.broadcastEvent("scripts", { type: "scripts", scripts });
      autoStartDev({ config, scripts, pm: processManager });

      this.state.running = false;
      this.state.done = true;
      return true;
    } catch (e) {
      broadcaster.broadcastChunk(
        "setup",
        `\r\nSetup error: ${(e as Error).message}\r\n`,
      );
      this.state.running = false;
      this.state.done = true;
      return true;
    }
  }
}
