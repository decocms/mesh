/**
 * Freestyle sandbox runner.
 *
 * Spins up a Freestyle VM per (user, projectRef). The VM runs an in-VM
 * daemon (see `freestyle-daemon-script.ts`) that:
 *   1. Clones the requested repo + checks out the branch
 *   2. Runs `<pm> install`
 *   3. Reverse-proxies `:9000` to the dev server
 *   4. Serves `/_decopilot_vm/*` for file ops + bash + SSE events
 *
 * Persistent state (vmId, previewDomain, repo, workload) lives in
 * `sandbox_runner_state` keyed by `(userId, projectRef, "freestyle")` so a
 * mesh restart can resume an existing VM by `freestyle.vms.ref({ vmId, spec })`
 * without a new create call (which would generate a new public URL).
 *
 * Exec / file ops / preview all hit the public freestyle domain
 * (`<hash>.deco.studio`) — the daemon is reachable from anywhere with the
 * URL, no per-pod bearer token. (Cloudflare WAF in front of the freestyle
 * domain is the only ingress filter; payloads to `/_decopilot_vm/*` are
 * base64-encoded to avoid the WAF matching shell-looking JSON bodies.)
 */

import { createHash } from "node:crypto";
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
  /**
   * Root domain for VM preview URLs. Each VM is registered with
   * `<domainKey>.<previewRootDomain>`. Defaults to `deco.studio`.
   * Override per environment if the freestyle account uses a different
   * apex (custom domain).
   */
  previewRootDomain?: string;
  /**
   * Idle timeout passed to `freestyle.vms.create`. Override for
   * tests / staging where you want longer-lived VMs.
   */
  idleTimeoutSeconds?: number;
}

interface FreestyleRecord {
  handle: string;
  vmId: string;
  previewDomain: string;
  workdir: string;
  id: SandboxId;
  workload: Workload | null;
  /**
   * Inputs needed to rebuild the `VmSpec` on resume after mesh restart.
   * Freestyle's `ref({ vmId, spec }).start()` wants the same spec the VM
   * was created with — without it, resume fails and we'd churn a new VM
   * (and a new public URL) on every restart.
   */
  repo: NonNullable<EnsureOptions["repo"]>;
}

interface PersistedFreestyleState {
  vmId: string;
  previewDomain: string;
  workdir: string;
  workload: Workload | null;
  repo: NonNullable<EnsureOptions["repo"]>;
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
    // pods; in-memory inflight dedupes within this process.
    const runInner = () => this.ensureInner(id, opts);
    const p =
      this.stateStore && this.stateStore.withLock
        ? this.stateStore.withLock(id, RUNNER_KIND, runInner)
        : runInner();
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Freestyle daemon serves `/_decopilot_vm/bash` directly — no separate
   * exec channel. We POST through the daemon transport so the bearer/CORS
   * story is identical to the file-ops path.
   */
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
      // Daemon doesn't currently surface a timed-out flag — exitCode === -1
      // is the closest signal (kill on timeout sets it that way).
      timedOut: (json.exitCode ?? 0) === -1,
    };
  }

  async delete(handle: string): Promise<void> {
    const rec = await this.lookupRecord(handle);
    this.byHandle.delete(handle);
    if (rec) {
      try {
        const vm = freestyle.vms.ref({ vmId: rec.vmId });
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
          `[FreestyleSandboxRunner] delete vm ${rec.vmId} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      if (this.stateStore) {
        await this.stateStore.delete(rec.id, RUNNER_KIND);
      }
    } else if (this.stateStore) {
      await this.stateStore.deleteByHandle(RUNNER_KIND, handle);
    }
  }

  /**
   * Best-effort liveness via daemon health. Freestyle's SDK doesn't expose
   * a cheap status check; hitting `/_decopilot_vm/scripts` (a tiny GET) is
   * the cheapest "is the daemon up" signal we have.
   */
  async alive(handle: string): Promise<boolean> {
    const rec = await this.lookupRecord(handle);
    if (!rec) return false;
    try {
      const res = await fetch(
        `https://${rec.previewDomain}/_decopilot_vm/scripts`,
        { signal: AbortSignal.timeout(2_000) },
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
   * Daemon proxy. Callers speak Docker's canonical `/_daemon/<…>` path
   * scheme; this method translates to the freestyle daemon's actual paths:
   *
   *   `/_daemon/fs/<op>`         → `/_decopilot_vm/<op>`
   *   `/_daemon/bash`            → `/_decopilot_vm/bash`
   *   `/_daemon/_decopilot_vm/…` → `/_decopilot_vm/…` (browser SSE)
   *   `/_daemon/dev/…`           → no-op (returns 204; freestyle's dev server
   *                                 boots via systemd, not via daemon HTTP)
   *
   * Body is base64-encoded for POST/PUT to avoid Cloudflare WAF matching
   * shell-looking JSON bodies (mirrors the legacy `vm-tools/freestyle.ts`
   * encoding behavior).
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
    // Strip cookies + hop-by-hop. Freestyle ignores Authorization.
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
    ]) {
      headers.delete(h);
    }
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

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private async ensureInner(
    id: SandboxId,
    opts: EnsureOptions,
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
    if (this.stateStore) {
      const persisted = await this.stateStore.get(id, RUNNER_KIND);
      if (persisted) {
        const probed = await this.resume(id, persisted, opts);
        if (probed) {
          this.byHandle.set(probed.handle, probed);
          return this.toSandbox(probed);
        }
        await this.stateStore.delete(id, RUNNER_KIND);
      }
    }
    // 2. Fresh provision.
    const rec = await this.provision(id, opts);
    this.byHandle.set(rec.handle, rec);
    await this.persist(id, rec);
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
    const workload = opts.workload ?? state.workload ?? null;
    // Rebuild the spec from persisted inputs + caller's workload override.
    // VmSpec instances are pure builders; rebuilding deterministically
    // matches what was passed at create time when both inputs match.
    const spec = this.buildSpec({
      repo: state.repo,
      workload,
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
    };
  }

  private async provision(
    id: SandboxId,
    opts: EnsureOptions,
  ): Promise<FreestyleRecord> {
    const repo = opts.repo!;
    const workload = opts.workload ?? null;
    const previewDomain = `${this.computeDomainKey(id)}.${this.previewRootDomain}`;
    const spec = this.buildSpec({ repo, workload });
    let result: { vmId: string };
    try {
      result = await freestyle.vms.create({
        spec,
        domains: [{ domain: previewDomain, vmPort: PROXY_PORT }],
        recreate: true,
        idleTimeoutSeconds: this.idleTimeoutSeconds,
      });
    } catch (err) {
      // Freestyle wraps server-side failures as `InternalErrorError`. Surface
      // which call failed so logs distinguish provision-time errors from
      // resume / start / domain-conflict scenarios.
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
    };
  }

  /**
   * Stable per-(userId, projectRef) domain key. 16 hex chars (64 bits) is
   * enough collision resistance for a per-user routing key. The hash
   * intentionally uses the new ref shape — so existing prod entries (keyed
   * off a different hash input pre-Stage 0) won't resume; they'll get a new
   * VM + new URL on next ensure(). Old VMs idle out via `idleTimeoutSeconds`.
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
  }: {
    repo: NonNullable<EnsureOptions["repo"]>;
    workload: Workload | null;
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
    const rec: FreestyleRecord = {
      handle: persisted.handle,
      vmId: state.vmId,
      previewDomain: state.previewDomain,
      workdir: state.workdir ?? APP_WORKDIR,
      id: persisted.id,
      workload: state.workload ?? null,
      repo: state.repo,
    };
    this.byHandle.set(handle, rec);
    return rec;
  }

  private async requireRecord(handle: string): Promise<FreestyleRecord> {
    const rec = await this.lookupRecord(handle);
    if (!rec) throw new Error(`unknown freestyle sandbox handle ${handle}`);
    return rec;
  }

  private async persist(id: SandboxId, rec: FreestyleRecord): Promise<void> {
    if (!this.stateStore) return;
    const state: PersistedFreestyleState = {
      vmId: rec.vmId,
      previewDomain: rec.previewDomain,
      workdir: rec.workdir,
      workload: rec.workload,
      repo: rec.repo,
    };
    await this.stateStore.put(id, RUNNER_KIND, { handle: rec.handle, state });
  }

  /**
   * Internal POST helper for `exec` — uses the same base64-encoding scheme
   * as `proxyDaemonRequest` so callers see identical behavior whether they
   * go through the runner's exec method or the proxy.
   */
  private async postDaemon(
    rec: FreestyleRecord,
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const url = `https://${rec.previewDomain}${path}`;
    const encoded = encodeBase64Utf8(JSON.stringify(body));
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: encoded,
    });
  }
}

/**
 * Translate Docker's `/_daemon/*` path scheme to freestyle's `/_decopilot_vm/*`.
 * Returns `null` for paths that have no freestyle analogue (caller should
 * 204 / no-op).
 *
 * Exported for unit testing. The mapping is the only Docker-vs-Freestyle
 * surface that's easy to break silently when adding a third runner.
 */
export function translateDaemonPath(path: string): string | null {
  const stripped = path.replace(/^\/_daemon(?=\/|$)/, "") || "/";
  // dev lifecycle is systemd-managed inside freestyle VMs; no HTTP equivalent.
  if (stripped === "/dev" || stripped.startsWith("/dev/")) return null;
  // SSE + scripts already use the `/_decopilot_vm/` namespace.
  if (stripped.startsWith("/_decopilot_vm/")) return stripped;
  // File ops live under `/fs/<op>` in Docker's daemon, `/_decopilot_vm/<op>`
  // in freestyle's. Map them across.
  if (stripped.startsWith("/fs/")) {
    return `/_decopilot_vm/${stripped.slice("/fs/".length)}`;
  }
  // Bash: Docker has `/_daemon/bash`; freestyle has `/_decopilot_vm/bash`.
  if (stripped === "/bash") return "/_decopilot_vm/bash";
  // Anything else — pass through as-is. Most likely a 404 on freestyle's side,
  // which is the right signal to the caller.
  return stripped;
}

/**
 * Derive a human-readable repo label from a clone URL.
 * `https://github.com/owner/name.git` → `owner/name`.
 * Falls back to the URL's pathname (or the URL itself if parsing fails).
 */
function deriveRepoLabel(cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl);
    const trimmed = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return trimmed || u.hostname;
  } catch {
    return cloneUrl;
  }
}

/**
 * Encode a JS string as base64(percent-encoded UTF-8). Mirrors the
 * decode path in `freestyle-daemon-script.ts`'s `parseJsonBody`.
 */
function encodeBase64Utf8(text: string): string {
  return btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}
