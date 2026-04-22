import { freestyle } from "freestyle-sandboxes";
import { gitIdentityScript, shellQuote, sleep } from "../../shared";
import type { RunnerStateStore } from "./state-store";
import type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  Sandbox,
  SandboxId,
  SandboxRunner,
} from "./types";
import { sandboxIdKey } from "./types";

const RUNNER_KIND = "freestyle";
const DEFAULT_WORKDIR = "/root";
const DEFAULT_IDLE_TIMEOUT = 1800;
const READINESS_ATTEMPTS = 60;
const READINESS_INTERVAL_MS = 1000;
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;

export interface FreestyleRunnerOptions {
  /** Seconds of inactivity before freestyle auto-stops the VM. */
  idleTimeoutSeconds?: number;
  /**
   * Persistent store for cross-restart recovery. Required in practice —
   * without it, a mesh restart orphans the VM (freestyle will reclaim via idle
   * timeout, but you pay N cold-boots during active dev).
   */
  stateStore?: RunnerStateStore;
}

interface FreestyleRecord {
  handle: string;
  workdir: string;
  id: SandboxId;
}

interface PersistedFreestyleState {
  workdir: string;
  [k: string]: unknown;
}

/**
 * Freestyle-backed runner. Uses the platform's native `vm.exec-await` endpoint
 * for shell commands — no daemon, no token, no domain.
 *
 * Trade-offs vs. a daemon-based approach:
 * - Each exec is a round-trip through freestyle's API. Latency is dominated
 *   by network, not our choice of transport.
 * - cwd/env must be wrapped into the command itself (freestyle's exec body
 *   doesn't accept them).
 * - The base VM image determines what's available (bash, git, curl, python3).
 *   If the agent needs something else it can `apt-get install` inside the
 *   sandbox — it's throwaway.
 */
export class FreestyleSandboxRunner implements SandboxRunner {
  private readonly idleTimeout: number;
  private readonly stateStore: RunnerStateStore | null;
  private readonly byHandle = new Map<string, FreestyleRecord>();
  private readonly inflight = new Map<string, Promise<Sandbox>>();

  constructor(opts: FreestyleRunnerOptions = {}) {
    this.idleTimeout = opts.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT;
    this.stateStore = opts.stateStore ?? null;
  }

  async ensure(id: SandboxId, opts: EnsureOptions = {}): Promise<Sandbox> {
    const key = sandboxIdKey(id);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = this.ensureInner(id, opts);
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  async exec(handle: string, input: ExecInput): Promise<ExecOutput> {
    const rec = this.byHandle.get(handle);
    if (!rec) {
      throw new Error(`unknown sandbox handle ${handle}`);
    }
    const timeoutMs = input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
    const wrapped = wrapCommand(
      input.command,
      input.cwd ?? rec.workdir,
      input.env,
    );
    const vm = freestyle.vms.ref({ vmId: handle });
    let timedOut = false;
    let result: {
      stdout?: string | null;
      stderr?: string | null;
      statusCode?: number | null;
    };
    try {
      result = await vm.exec({ command: wrapped, timeoutMs });
    } catch (err) {
      // Freestyle throws on timeout; surface as a structured result instead.
      if (err instanceof Error && /timeout/i.test(err.message)) {
        timedOut = true;
        result = { stdout: "", stderr: err.message, statusCode: -1 };
      } else {
        throw err;
      }
    }
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.statusCode ?? -1,
      timedOut,
    };
  }

  async delete(handle: string): Promise<void> {
    const rec = this.byHandle.get(handle);
    this.byHandle.delete(handle);
    await this.terminateVm(handle);
    if (this.stateStore) {
      if (rec) await this.stateStore.delete(rec.id, RUNNER_KIND);
      else await this.stateStore.deleteByHandle(RUNNER_KIND, handle);
    }
  }

  async alive(handle: string): Promise<boolean> {
    try {
      const info = await freestyle.vms.ref({ vmId: handle }).getInfo();
      return info.state === "running" || info.state === "starting";
    } catch {
      return false;
    }
  }

  async sweepOrphans(): Promise<number> {
    // Freestyle's idleTimeoutSeconds reaps stopped VMs natively. No enumeration
    // by label; if we need one later, use the list API + metadata tags.
    return 0;
  }

  private async ensureInner(
    id: SandboxId,
    opts: EnsureOptions,
  ): Promise<Sandbox> {
    if (this.stateStore) {
      const persisted = await this.stateStore.get(id, RUNNER_KIND);
      if (persisted) {
        const probed = await this.probePersisted(id, persisted);
        if (probed) {
          this.byHandle.set(probed.handle, probed);
          return { handle: probed.handle, workdir: probed.workdir };
        }
        await this.terminateVm(persisted.handle).catch(() => {});
        await this.stateStore.delete(id, RUNNER_KIND);
      }
    }

    const rec = await this.provision(id, opts);
    this.byHandle.set(rec.handle, rec);
    await this.persist(id, rec);
    return { handle: rec.handle, workdir: rec.workdir };
  }

  private async provision(
    id: SandboxId,
    opts: EnsureOptions,
  ): Promise<FreestyleRecord> {
    const workdir = opts.workdir ?? DEFAULT_WORKDIR;
    // No spec, no domains — bare VM, accessed only via vm.exec().
    const { vmId } = await freestyle.vms.create({
      idleTimeoutSeconds: this.idleTimeout,
    });

    await this.waitForReady(vmId);

    // Ensure the workdir exists; freestyle's default root dir isn't guaranteed.
    await this.execRaw(vmId, `mkdir -p ${shellQuote(workdir)}`);

    if (opts.repo) {
      await this.bootstrapRepo(vmId, workdir, opts.repo);
    }

    return { handle: vmId, workdir, id };
  }

  private async bootstrapRepo(
    vmId: string,
    workdir: string,
    repo: NonNullable<EnsureOptions["repo"]>,
  ): Promise<void> {
    const cmds = [
      gitIdentityScript(repo.userName, repo.userEmail),
      `git clone ${shellQuote(repo.cloneUrl)} ${shellQuote(workdir)}`,
    ].join(" && ");
    const result = await this.execRaw(vmId, cmds);
    if ((result.statusCode ?? -1) !== 0) {
      throw new Error(
        `freestyle sandbox repo bootstrap failed (exit ${result.statusCode}): ${result.stderr ?? ""}`,
      );
    }
  }

  private async execRaw(
    vmId: string,
    command: string,
  ): Promise<{
    stdout?: string | null;
    stderr?: string | null;
    statusCode?: number | null;
  }> {
    return freestyle.vms.ref({ vmId }).exec({ command, timeoutMs: 60_000 });
  }

  private async probePersisted(
    id: SandboxId,
    record: { handle: string; state: Record<string, unknown> },
  ): Promise<FreestyleRecord | null> {
    const state = record.state as Partial<PersistedFreestyleState>;
    try {
      const info = await freestyle.vms.ref({ vmId: record.handle }).getInfo();
      if (info.state !== "running" && info.state !== "starting") {
        return null;
      }
    } catch {
      return null;
    }
    return {
      handle: record.handle,
      workdir: state.workdir ?? DEFAULT_WORKDIR,
      id,
    };
  }

  private async waitForReady(vmId: string): Promise<void> {
    const vm = freestyle.vms.ref({ vmId });
    for (let i = 0; i < READINESS_ATTEMPTS; i++) {
      try {
        const info = await vm.getInfo();
        if (info.state === "running") return;
        if (info.state === "stopped" || info.state === "suspended") {
          throw new Error(
            `freestyle VM ${vmId} entered terminal state ${info.state} during boot`,
          );
        }
      } catch (err) {
        if (i === READINESS_ATTEMPTS - 1) throw err;
      }
      await sleep(READINESS_INTERVAL_MS);
    }
    await this.terminateVm(vmId).catch(() => {});
    throw new Error(
      `freestyle VM ${vmId} did not reach "running" within ${
        (READINESS_ATTEMPTS * READINESS_INTERVAL_MS) / 1000
      }s`,
    );
  }

  private async terminateVm(vmId: string): Promise<void> {
    const vm = freestyle.vms.ref({ vmId });
    try {
      await vm.stop();
    } catch {
      // Already stopped / gone — safe to ignore.
    }
    try {
      await vm.delete();
    } catch {
      // Already deleted / gone — safe to ignore.
    }
  }

  private async persist(id: SandboxId, rec: FreestyleRecord): Promise<void> {
    if (!this.stateStore) return;
    const state: PersistedFreestyleState = { workdir: rec.workdir };
    await this.stateStore.put(id, RUNNER_KIND, { handle: rec.handle, state });
  }
}

/**
 * Freestyle's exec endpoint runs a string via its own shell, and doesn't
 * accept cwd/env. Wrap so the caller's cwd/env survive.
 */
function wrapCommand(
  command: string,
  cwd: string,
  env: Record<string, string> | undefined,
): string {
  const envPrefix = env
    ? Object.entries(env)
        .map(([k, v]) => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
            throw new Error(`invalid env var name: ${k}`);
          }
          return `${k}=${shellQuote(v)}`;
        })
        .join(" ") + " "
    : "";
  return `cd ${shellQuote(cwd)} && ${envPrefix}bash -lc ${shellQuote(command)}`;
}
