/**
 * Freestyle sandbox runner. One VM per (user, projectRef). Persistent
 * state in `sandbox_runner_state` lets a mesh restart resume via
 * `freestyle.vms.ref({ vmId, spec }).start()` — lose the ref and every
 * restart would churn a new VM with a new public URL.
 * Payloads to `/_decopilot_vm/*` are base64-encoded to dodge the
 * Cloudflare WAF in front of freestyle domains.
 */

import { createHash, randomBytes } from "node:crypto";
import { freestyle, VmSpec } from "freestyle-sandboxes";
import { VmDeno } from "@freestyle-sh/with-deno";
import { VmBun } from "@freestyle-sh/with-bun";
import { VmNodeJs } from "@freestyle-sh/with-nodejs";
import { IFRAME_BOOTSTRAP_SCRIPT } from "mesh-plugin-user-sandbox/shared";
import {
  sandboxIdKey,
  type EnsureOptions,
  type ExecInput,
  type ExecOutput,
  type ProxyRequestInit,
  type RunnerStateStore,
  type RunnerStateStoreOps,
  type Sandbox,
  type SandboxId,
  type SandboxRunner,
  type Workload,
} from "mesh-plugin-user-sandbox/runner";
import { buildDaemonScript } from "./freestyle-daemon-script";

const RUNNER_KIND = "freestyle" as const;
const PROXY_PORT = 9000;
const APP_WORKDIR = "/app";
/** Stop running VMs after this much idle time. Freestyle bills per active second. */
const DEFAULT_IDLE_TIMEOUT_SECONDS = 1800;

interface FreestyleRunnerOptions {
  stateStore?: RunnerStateStore;
  /** Override when the freestyle account uses a custom apex. Default: `deco.studio`. */
  previewRootDomain?: string;
  /** Override for tests / staging where you want longer-lived VMs. */
  idleTimeoutSeconds?: number;
}

interface FreestyleRecord {
  handle: string;
  vmId: string;
  previewDomain: string;
  workdir: string;
  id: SandboxId;
  workload: Workload | null;
  /** Persisted so VmSpec can be rebuilt deterministically on resume. */
  repo: NonNullable<EnsureOptions["repo"]>;
  /** Bearer token the in-VM daemon checks on every `/_decopilot_vm/*` request. */
  daemonToken: string;
}

interface PersistedFreestyleState {
  vmId: string;
  previewDomain: string;
  workdir: string;
  workload: Workload | null;
  repo: NonNullable<EnsureOptions["repo"]>;
  /** Added alongside bearer auth. Absent in pre-auth rows → resume bails. */
  daemonToken?: string;
  [k: string]: unknown;
}

export class FreestyleSandboxRunner implements SandboxRunner {
  readonly kind = RUNNER_KIND;
  private readonly stateStore: RunnerStateStore | null;
  private readonly previewRootDomain: string;
  private readonly idleTimeoutSeconds: number;
  private readonly byHandle = new Map<string, FreestyleRecord>();
  private readonly inflight = new Map<string, Promise<Sandbox>>();

  constructor(opts: FreestyleRunnerOptions = {}) {
    this.stateStore = opts.stateStore ?? null;
    this.previewRootDomain = opts.previewRootDomain ?? "deco.studio";
    this.idleTimeoutSeconds =
      opts.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS;
  }

  async ensure(id: SandboxId, opts: EnsureOptions = {}): Promise<Sandbox> {
    const key = sandboxIdKey(id);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    // See DockerSandboxRunner.ensure — state-store lock serializes across
    // pods; in-memory inflight dedupes within this process. The scoped
    // store reuses the lock connection so nested reads/writes don't starve
    // the main pg pool during long provisioning.
    const p =
      this.stateStore && this.stateStore.withLock
        ? this.stateStore.withLock(id, RUNNER_KIND, (scoped) =>
            this.ensureInner(id, opts, scoped),
          )
        : this.ensureInner(id, opts, this.stateStore);
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Routes through the daemon transport so CORS/bearer match file-ops. */
  async exec(handle: string, input: ExecInput): Promise<ExecOutput> {
    const rec = await this.requireRecord(handle);
    const res = await this.postDaemon(rec, "/_decopilot_vm/bash", {
      command: input.command,
      timeout: input.timeoutMs ?? 30_000,
      cwd: input.cwd,
      env: input.env,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `freestyle daemon /_decopilot_vm/bash returned ${res.status}${
          body ? `: ${body}` : ""
        }`,
      );
    }
    const json = (await res.json()) as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };
    return {
      stdout: json.stdout ?? "",
      stderr: json.stderr ?? "",
      exitCode: json.exitCode ?? -1,
      // Daemon has no timed-out flag; exitCode === -1 is set by kill-on-timeout.
      timedOut: (json.exitCode ?? 0) === -1,
    };
  }

  async delete(handle: string): Promise<void> {
    const rec = await this.lookupRecord(handle);
    this.byHandle.delete(handle);
    if (rec) {
      await this.disposeVm(rec.vmId, "delete");
      if (this.stateStore) {
        await this.stateStore.delete(rec.id, RUNNER_KIND);
      }
    } else if (this.stateStore) {
      await this.stateStore.deleteByHandle(RUNNER_KIND, handle);
    }
  }

  /** stop() + delete() a VM; timebound + errors are logged, not thrown. */
  private async disposeVm(vmId: string, reason: string): Promise<void> {
    try {
      const vm = freestyle.vms.ref({ vmId });
      await Promise.race([
        vm.stop().then(() => vm.delete()),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("freestyle vm.delete() timed out")),
            10_000,
          ),
        ),
      ]);
    } catch (err) {
      console.error(
        `[FreestyleSandboxRunner] dispose vm ${vmId} (${reason}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Freestyle SDK has no cheap status check; small GET is our best signal. */
  async alive(handle: string): Promise<boolean> {
    const rec = await this.lookupRecord(handle);
    if (!rec) return false;
    try {
      const res = await fetch(
        `https://${rec.previewDomain}/_decopilot_vm/scripts`,
        {
          headers: { authorization: `Bearer ${rec.daemonToken}` },
          signal: AbortSignal.timeout(2_000),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async getPreviewUrl(handle: string): Promise<string | null> {
    const rec = await this.lookupRecord(handle);
    if (!rec) return null;
    return `https://${rec.previewDomain}`;
  }

  /**
   * Translates Docker's canonical `/_daemon/*` to freestyle's `/_decopilot_vm/*`:
   *   /_daemon/fs/<op>         → /_decopilot_vm/<op>
   *   /_daemon/bash            → /_decopilot_vm/bash
   *   /_daemon/_decopilot_vm/… → /_decopilot_vm/… (browser SSE)
   *   /_daemon/dev/…           → 204 (systemd handles dev on freestyle)
   * Bodies are base64-encoded to dodge the Cloudflare WAF.
   */
  async proxyDaemonRequest(
    handle: string,
    path: string,
    init: ProxyRequestInit,
  ): Promise<Response> {
    const rec = await this.lookupRecord(handle);
    if (!rec) {
      return new Response(JSON.stringify({ error: "sandbox not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const translated = translateDaemonPath(path);
    if (translated === null) {
      // No-op route on freestyle (e.g. /dev/start — systemd handles it).
      return new Response(null, { status: 204 });
    }
    const target = `https://${rec.previewDomain}${translated}`;
    const headers = new Headers(init.headers);
    // Strip cookies + hop-by-hop, then set our own bearer. Any Authorization
    // that arrived from the browser (there shouldn't be one — mesh session
    // auth ran upstream) is overwritten with the VM's per-sandbox token.
    for (const h of [
      "cookie",
      "host",
      "connection",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
      "transfer-encoding",
      "accept-encoding",
      "content-length",
      "authorization",
    ]) {
      headers.delete(h);
    }
    headers.set("authorization", `Bearer ${rec.daemonToken}`);
    const hasBody = init.method !== "GET" && init.method !== "HEAD";
    let body: BodyInit | null = init.body;
    if (hasBody && body !== null) {
      // Freestyle daemon's parseJsonBody expects base64 → percent-encoded UTF-8 → JSON.
      const text =
        typeof body === "string"
          ? body
          : body instanceof Uint8Array
            ? new TextDecoder().decode(body)
            : await new Response(body).text();
      body = encodeBase64Utf8(text);
      headers.set("content-type", "text/plain");
    }
    return fetch(target, {
      method: init.method,
      headers,
      body: hasBody ? body : undefined,
      redirect: "manual",
      signal: init.signal,
      // @ts-expect-error Bun/Undici-only: allow streaming request body.
      duplex: hasBody ? "half" : undefined,
    });
  }

  private async ensureInner(
    id: SandboxId,
    opts: EnsureOptions,
    store: RunnerStateStoreOps | null,
  ): Promise<Sandbox> {
    if (!opts.repo) {
      throw new Error(
        "FreestyleSandboxRunner requires `opts.repo` — bake-in clone is part of the VmSpec; blank/freestyle sandboxes aren't supported.",
      );
    }
    if (!opts.repo.branch) {
      throw new Error(
        "FreestyleSandboxRunner requires `opts.repo.branch` — the daemon clones with -b and the branch is part of the spec.",
      );
    }
    // 1. State-store resume.
    if (store) {
      const persisted = await store.get(id, RUNNER_KIND);
      if (persisted) {
        const probed = await this.resume(id, persisted, opts);
        if (probed) {
          this.byHandle.set(probed.handle, probed);
          return this.toSandbox(probed);
        }
        await store.delete(id, RUNNER_KIND);
      }
    }
    // 2. Fresh provision.
    const rec = await this.provision(id, opts);
    this.byHandle.set(rec.handle, rec);
    await this.persist(id, rec, store);
    return this.toSandbox(rec);
  }

  private toSandbox(rec: FreestyleRecord): Sandbox {
    return {
      handle: rec.handle,
      workdir: rec.workdir,
      previewUrl: `https://${rec.previewDomain}`,
    };
  }

  private async resume(
    id: SandboxId,
    persisted: { handle: string; state: Record<string, unknown> },
    opts: EnsureOptions,
  ): Promise<FreestyleRecord | null> {
    const state = persisted.state as Partial<PersistedFreestyleState>;
    if (!state.vmId || !state.previewDomain || !state.repo) return null;
    // Rows persisted before bearer auth landed have no daemonToken. The
    // running VM's daemon script also predates auth, so issuing a new token
    // wouldn't match. Dispose the old VM explicitly — relying on idle-timeout
    // orphans one VM per stale row, which stacks up and is billed.
    if (!state.daemonToken) {
      await this.disposeVm(state.vmId, "resume:no-daemon-token");
      return null;
    }
    // Workload (runtime / packageManager / devPort) is baked into the
    // daemon script at VM create time — see buildSpec's additionalFiles.
    // `freestyle.vms.ref({ vmId, spec }).start()` boots the existing VM
    // with the already-written /opt/daemon.js; the rebuilt spec is
    // effectively ignored. When the caller's workload has diverged from
    // what was baked, resume would silently keep running the old PM. Bail
    // so ensureInner deletes the stale state row and provisions fresh.
    if (!workloadEquals(opts.workload ?? null, state.workload ?? null)) {
      console.warn(
        `[FreestyleSandboxRunner] resume vm ${state.vmId} skipped: workload changed (persisted=${JSON.stringify(state.workload)} current=${JSON.stringify(opts.workload ?? null)}); will recreate`,
      );
      return null;
    }
    const workload = opts.workload ?? state.workload ?? null;
    // VmSpec is a pure builder — deterministic rebuild matches create-time spec.
    const spec = this.buildSpec({
      repo: state.repo,
      workload,
      daemonToken: state.daemonToken,
    });
    try {
      const vm = freestyle.vms.ref({ vmId: state.vmId, spec });
      await vm.start();
    } catch (err) {
      console.warn(
        `[FreestyleSandboxRunner] resume vm ${state.vmId} failed (will recreate): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
    return {
      handle: state.vmId,
      vmId: state.vmId,
      previewDomain: state.previewDomain,
      workdir: state.workdir ?? APP_WORKDIR,
      id,
      workload,
      repo: state.repo,
      daemonToken: state.daemonToken,
    };
  }

  private async provision(
    id: SandboxId,
    opts: EnsureOptions,
  ): Promise<FreestyleRecord> {
    const repo = opts.repo!;
    const workload = opts.workload ?? null;
    const previewDomain = `${this.computeDomainKey(id)}.${this.previewRootDomain}`;
    // 32 bytes (256 bits) of entropy; daemon requires ≥ 32 chars.
    const daemonToken = randomBytes(32).toString("hex");
    const spec = this.buildSpec({ repo, workload, daemonToken });
    let result: { vmId: string };
    try {
      result = await freestyle.vms.create({
        spec,
        domains: [{ domain: previewDomain, vmPort: PROXY_PORT }],
        recreate: true,
        idleTimeoutSeconds: this.idleTimeoutSeconds,
      });
    } catch (err) {
      // Freestyle wraps failures as InternalErrorError — name the call site.
      throw new Error(
        `[FreestyleSandboxRunner] vms.create failed for domain=${previewDomain} user=${id.userId} projectRef=${id.projectRef}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const handle = result.vmId;
    return {
      handle,
      vmId: result.vmId,
      previewDomain,
      workdir: APP_WORKDIR,
      id,
      workload,
      repo,
      daemonToken,
    };
  }

  /**
   * Stable per-(userId, projectRef) domain key. 16 hex (64 bits) is
   * enough collision resistance for a per-user routing key; old VMs idle
   * out via `idleTimeoutSeconds`.
   */
  private computeDomainKey(id: SandboxId): string {
    return createHash("sha256")
      .update(sandboxIdKey(id))
      .digest("hex")
      .slice(0, 16);
  }

  /**
   * Build a freestyle `VmSpec` from workload + repo. Deterministic — same
   * inputs always produce an equivalent spec, which keeps create-vs-resume
   * spec-comparison stable on freestyle's side.
   */
  private buildSpec({
    repo,
    workload,
    daemonToken,
  }: {
    repo: NonNullable<EnsureOptions["repo"]>;
    workload: Workload | null;
    daemonToken: string;
  }): VmSpec {
    const runtime = workload?.runtime ?? "node";
    const packageManager = workload?.packageManager ?? null;
    const port = String(workload?.devPort ?? 3000);
    const pathPrefix =
      runtime === "deno"
        ? "export PATH=/opt/deno/bin:$PATH && "
        : runtime === "bun"
          ? "export PATH=/opt/bun/bin:$PATH && "
          : "";
    const repoLabel = repo.displayName ?? deriveRepoLabel(repo.cloneUrl);
    const daemonScript = buildDaemonScript({
      upstreamPort: port,
      packageManager,
      pathPrefix,
      port,
      cloneUrl: repo.cloneUrl,
      repoName: repoLabel,
      proxyPort: PROXY_PORT,
      bootstrapScript: IFRAME_BOOTSTRAP_SCRIPT,
      gitUserName: repo.userName,
      gitUserEmail: repo.userEmail,
      branch: repo.branch!,
      daemonToken,
    });
    const baseSpec = new VmSpec()
      .with("node", new VmNodeJs())
      .additionalFiles({
        "/opt/daemon.js": { content: daemonScript },
        "/opt/run-daemon.sh": {
          content:
            "#!/bin/bash\nsource /etc/profile.d/nvm.sh\nexec node /opt/daemon.js\n",
        },
        "/opt/install-ripgrep.sh": {
          content:
            "#!/bin/bash\napt-get update -qq && apt-get install -y -qq ripgrep locales && sed -i 's/^#\\s*en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && locale-gen\n",
        },
        "/opt/prepare-app-dir.sh": {
          content:
            "#!/bin/bash\nid -u deco &>/dev/null || useradd -m -u 1000 deco\nmkdir -p /app && chown deco:deco /app\n",
        },
      })
      .systemdService({
        name: "install-ripgrep",
        mode: "oneshot",
        exec: ["/bin/bash /opt/install-ripgrep.sh"],
        wantedBy: ["multi-user.target"],
      })
      .systemdService({
        name: "prepare-app-dir",
        mode: "oneshot",
        exec: ["/bin/bash /opt/prepare-app-dir.sh"],
        wantedBy: ["multi-user.target"],
      })
      .systemdService({
        name: "daemon",
        mode: "service",
        exec: ["/bin/bash /opt/run-daemon.sh"],
        after: [
          "install-nodejs.service",
          "install-ripgrep.service",
          "prepare-app-dir.service",
        ],
        requires: [
          "install-nodejs.service",
          "install-ripgrep.service",
          "prepare-app-dir.service",
        ],
        wantedBy: ["multi-user.target"],
        restartPolicy: { policy: "always", restartSec: 2 },
      });
    return runtime === "deno"
      ? baseSpec.with("deno", new VmDeno())
      : runtime === "bun"
        ? baseSpec.with("js", new VmBun())
        : baseSpec;
  }

  private async lookupRecord(handle: string): Promise<FreestyleRecord | null> {
    const cached = this.byHandle.get(handle);
    if (cached) return cached;
    if (!this.stateStore) return null;
    const persisted = await this.stateStore.getByHandle(RUNNER_KIND, handle);
    if (!persisted) return null;
    const state = persisted.state as Partial<PersistedFreestyleState>;
    if (!state.vmId || !state.previewDomain || !state.repo) return null;
    // Pre-auth row (no token) — caller can't talk to the daemon. Resume will
    // return null on a fresh ensure; here we surface null too so proxy paths
    // 404 instead of calling with a missing token.
    if (!state.daemonToken) return null;
    const rec: FreestyleRecord = {
      handle: persisted.handle,
      vmId: state.vmId,
      previewDomain: state.previewDomain,
      workdir: state.workdir ?? APP_WORKDIR,
      id: persisted.id,
      workload: state.workload ?? null,
      repo: state.repo,
      daemonToken: state.daemonToken,
    };
    this.byHandle.set(handle, rec);
    return rec;
  }

  private async requireRecord(handle: string): Promise<FreestyleRecord> {
    const rec = await this.lookupRecord(handle);
    if (!rec) throw new Error(`unknown freestyle sandbox handle ${handle}`);
    return rec;
  }

  private async persist(
    id: SandboxId,
    rec: FreestyleRecord,
    store: RunnerStateStoreOps | null,
  ): Promise<void> {
    if (!store) return;
    const state: PersistedFreestyleState = {
      vmId: rec.vmId,
      previewDomain: rec.previewDomain,
      workdir: rec.workdir,
      workload: rec.workload,
      repo: rec.repo,
      daemonToken: rec.daemonToken,
    };
    await store.put(id, RUNNER_KIND, { handle: rec.handle, state });
  }

  /** Same base64 scheme as `proxyDaemonRequest` — parity with exec path. */
  private async postDaemon(
    rec: FreestyleRecord,
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const url = `https://${rec.previewDomain}${path}`;
    const encoded = encodeBase64Utf8(JSON.stringify(body));
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        authorization: `Bearer ${rec.daemonToken}`,
      },
      body: encoded,
    });
  }
}

/**
 * Docker `/_daemon/*` → freestyle `/_decopilot_vm/*`. Returns null for
 * paths with no freestyle analogue (caller 204s). Exported for tests —
 * easiest Docker-vs-Freestyle surface to break silently.
 */
export function translateDaemonPath(path: string): string | null {
  const stripped = path.replace(/^\/_daemon(?=\/|$)/, "") || "/";
  // /dev/* is systemd-managed on freestyle, no HTTP equivalent.
  if (stripped === "/dev" || stripped.startsWith("/dev/")) return null;
  if (stripped.startsWith("/_decopilot_vm/")) return stripped;
  if (stripped.startsWith("/fs/")) {
    return `/_decopilot_vm/${stripped.slice("/fs/".length)}`;
  }
  if (stripped === "/bash") return "/_decopilot_vm/bash";
  // Pass through — a 404 on freestyle's side is the right caller signal.
  return stripped;
}

function workloadEquals(a: Workload | null, b: Workload | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.runtime === b.runtime &&
    a.packageManager === b.packageManager &&
    a.devPort === b.devPort
  );
}

function deriveRepoLabel(cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl);
    const trimmed = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return trimmed || u.hostname;
  } catch {
    return cloneUrl;
  }
}

/** Mirrors the decode path in `freestyle-daemon-script.ts`'s `parseJsonBody`. */
function encodeBase64Utf8(text: string): string {
  return btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}
