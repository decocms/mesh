import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import * as net from "node:net";
import { DAEMON_PORT, DEFAULT_IMAGE } from "../../shared";
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

const RUNNER_KIND = "docker";
const LABEL_ROOT = "mesh-sandbox";
const LABEL_ID = "mesh-sandbox.id";
const DEFAULT_WORKDIR = "/app";
const PORT_READBACK_ATTEMPTS = 15;
const PORT_READBACK_INTERVAL_MS = 200;
const READINESS_ATTEMPTS = 25;
const READINESS_INTERVAL_MS = 200;
const READINESS_REQUEST_TIMEOUT_MS = 500;
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface DockerExec {
  (args: string[]): Promise<ExecResult>;
}

export interface DockerRunnerOptions {
  image?: string;
  exec?: DockerExec;
  /**
   * Label used to claim ownership of containers spawned by this runner.
   * Override per mesh instance if multiple need to coexist on one host.
   */
  labelPrefix?: string;
  /**
   * Optional persistent store. When supplied, the runner consults it before
   * docker-level discovery so cross-process races settle on the first row to
   * win the (user_id, project_ref, runner_kind) PK.
   */
  stateStore?: RunnerStateStore;
}

/** Private per-handle record. Never escapes the runner. */
interface DockerRecord {
  handle: string;
  daemonUrl: string;
  token: string;
  workdir: string;
  id: SandboxId;
  /**
   * True once we've attempted a repo bootstrap in this container. Covers both
   * successful clones and skipped-because-workdir-was-not-empty outcomes —
   * either way, we don't want to retry on the next ensure() call.
   */
  repoAttached: boolean;
}

interface PersistedDockerState {
  token: string;
  workdir: string;
  daemonUrl: string;
  repoAttached?: boolean;
  [k: string]: unknown;
}

export class DockerSandboxRunner implements SandboxRunner {
  private readonly image: string;
  private readonly exec_: DockerExec;
  private readonly labelPrefix: string;
  private readonly stateStore: RunnerStateStore | null;
  private readonly byHandle = new Map<string, DockerRecord>();
  private readonly inflight = new Map<string, Promise<Sandbox>>();

  constructor(opts: DockerRunnerOptions = {}) {
    this.image = opts.image ?? process.env.MESH_SANDBOX_IMAGE ?? DEFAULT_IMAGE;
    this.exec_ = opts.exec ?? defaultDockerExec;
    this.labelPrefix = opts.labelPrefix ?? LABEL_ROOT;
    this.stateStore = opts.stateStore ?? null;
  }

  async ensure(id: SandboxId, opts: EnsureOptions = {}): Promise<Sandbox> {
    const labelId = hashId(id);
    const pending = this.inflight.get(labelId);
    if (pending) return pending;
    const p = this.ensureInner(id, labelId, opts);
    this.inflight.set(labelId, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(labelId);
    }
  }

  async exec(handle: string, input: ExecInput): Promise<ExecOutput> {
    const rec = this.byHandle.get(handle);
    if (!rec) {
      throw new Error(`unknown sandbox handle ${handle}`);
    }
    return daemonBash(rec.daemonUrl, rec.token, input);
  }

  async delete(handle: string): Promise<void> {
    const rec = this.byHandle.get(handle);
    this.byHandle.delete(handle);
    await this.stopContainer(handle);
    if (this.stateStore) {
      if (rec) await this.stateStore.delete(rec.id, RUNNER_KIND);
      else await this.stateStore.deleteByHandle(RUNNER_KIND, handle);
    }
  }

  async alive(handle: string): Promise<boolean> {
    const r = await this.exec_([
      "inspect",
      "--format",
      "{{.State.Running}}",
      handle,
    ]);
    return r.code === 0 && r.stdout.trim() === "true";
  }

  async sweepOrphans(): Promise<number> {
    const r = await this.exec_([
      "ps",
      "-aq",
      "--filter",
      `label=${this.labelPrefix}=1`,
    ]);
    if (r.code !== 0) return 0;
    const ids = r.stdout.trim().split("\n").filter(Boolean);
    for (const id of ids) {
      await this.stopContainer(id);
      if (this.stateStore) {
        await this.stateStore.deleteByHandle(RUNNER_KIND, id).catch(() => {});
      }
    }
    return ids.length;
  }

  private async ensureInner(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
  ): Promise<Sandbox> {
    // 1. State-store lookup first (survives mesh restart + cross-process race).
    if (this.stateStore) {
      const persisted = await this.stateStore.get(id, RUNNER_KIND);
      if (persisted) {
        const probed = await this.probePersisted(id, persisted);
        if (probed) {
          this.byHandle.set(probed.handle, probed);
          await this.attachRepoIfNeeded(id, probed, opts);
          return { handle: probed.handle, workdir: probed.workdir };
        }
        // Stale row — purge and fall through to docker discovery / create.
        await this.stateStore.delete(id, RUNNER_KIND);
      }
    }

    // 2. Docker-level discovery (survives when state store is absent or empty,
    //    e.g. state store wiped but docker still has the container).
    const existingHandle = await this.findExisting(labelId);
    if (existingHandle) {
      const tracked = this.byHandle.get(existingHandle);
      if (tracked) {
        await this.attachRepoIfNeeded(id, tracked, opts);
        return { handle: tracked.handle, workdir: tracked.workdir };
      }
      const recovered = await this.recoverSandbox(id, existingHandle);
      if (recovered) {
        this.byHandle.set(existingHandle, recovered);
        await this.persist(id, recovered);
        await this.attachRepoIfNeeded(id, recovered, opts);
        return { handle: recovered.handle, workdir: recovered.workdir };
      }
      await this.stopContainer(existingHandle);
    }

    // 3. Fresh provision. attachRepoIfNeeded handles clone inline; if it fails
    //    we roll back the fresh container since it's not yet useful to anyone.
    //    Persist happens AFTER the clone so the mesh-side state store (queried
    //    by the decopilot/preview pollers) only surfaces this sandbox once the
    //    workdir is populated. Otherwise pollers hammer `/dev/start` on an
    //    empty workdir and the daemon loop-logs "cannot auto-start" until the
    //    clone finally finishes.
    const rec = await this.provision(id, labelId, opts);
    this.byHandle.set(rec.handle, rec);
    try {
      await this.attachRepoIfNeeded(id, rec, opts);
    } catch (err) {
      this.byHandle.delete(rec.handle);
      await this.stopContainer(rec.handle).catch(() => {});
      throw err;
    }
    await this.persist(id, rec);
    return { handle: rec.handle, workdir: rec.workdir };
  }

  /**
   * Run repo bootstrap (git identity + idempotent clone) in the existing
   * container. No-ops when no repo is requested or we've already attempted
   * attach in this sandbox. Mutates `rec.repoAttached` and persists on success.
   */
  private async attachRepoIfNeeded(
    id: SandboxId,
    rec: DockerRecord,
    opts: EnsureOptions,
  ): Promise<void> {
    if (!opts.repo || rec.repoAttached) return;
    await bootstrapRepo(rec.daemonUrl, rec.token, rec.workdir, opts.repo);
    rec.repoAttached = true;
    await this.persist(id, rec);
  }

  private async provision(
    id: SandboxId,
    labelId: string,
    opts: EnsureOptions,
  ): Promise<DockerRecord> {
    const token = randomBytes(24).toString("hex");
    const workdir = opts.workdir ?? DEFAULT_WORKDIR;
    const image = opts.image ?? this.image;
    const env: Record<string, string> = {
      DAEMON_TOKEN: token,
      DAEMON_PORT: String(DAEMON_PORT),
      WORKDIR: workdir,
      ...(opts.env ?? {}),
    };

    // Only the daemon port is published. Dev-server traffic goes through the
    // daemon's /proxy/:port/* endpoint, which reaches container loopback — so
    // the dev server can bind to 127.0.0.1 without a --host flag and it still
    // works.
    const args = [
      "run",
      "-d",
      "--rm",
      "--init",
      "--label",
      `${this.labelPrefix}=1`,
      "--label",
      `${LABEL_ID}=${labelId}`,
      "-p",
      `127.0.0.1:0:${DAEMON_PORT}`,
      ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      image,
    ];
    const result = await this.exec_(args);
    if (result.code !== 0) {
      throw new Error(
        `docker run failed (exit ${result.code}): ${result.stderr.trim() || "no output"}`,
      );
    }

    const handle = result.stdout.trim().split("\n").pop()?.trim();
    if (!handle) {
      throw new Error("docker run did not return a container id");
    }

    const hostPort = await this.readPort(handle, DAEMON_PORT);
    const daemonUrl = `http://127.0.0.1:${hostPort}`;
    await this.waitForReady(daemonUrl, handle);
    return { handle, daemonUrl, token, workdir, id, repoAttached: false };
  }

  async resolveDaemonUrl(handle: string): Promise<string | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.daemonUrl ?? null;
  }

  async resolveDaemonToken(handle: string): Promise<string | null> {
    const rec = await this.lookupRecord(handle);
    return rec?.token ?? null;
  }

  /**
   * HTTP passthrough to the sandbox daemon. The route handler calls this to
   * reach either:
   *   - dev-server traffic via `/proxy/:port/<subPath>`, or
   *   - dev-lifecycle endpoints (`/dev/*`, `/_decopilot_vm/events`).
   *
   * The bearer token never leaves this class — the caller gets back a native
   * `Response` with the body streamed from the daemon.
   */
  async proxyDaemonRequest(
    handle: string,
    path: string,
    init: { method: string; headers: Headers; body: BodyInit | null },
  ): Promise<Response> {
    const rec = await this.lookupRecord(handle);
    if (!rec) {
      return new Response(JSON.stringify({ error: "sandbox not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${rec.token}`);
    headers.delete("host");
    headers.delete("connection");
    headers.delete("accept-encoding");
    headers.delete("content-length");
    const hasBody = init.method !== "GET" && init.method !== "HEAD";
    const target = `${rec.daemonUrl}${path.startsWith("/") ? path : `/${path}`}`;
    return fetch(target, {
      method: init.method,
      headers,
      body: hasBody ? init.body : undefined,
      redirect: "manual",
      // @ts-expect-error Bun/Undici-only: allow streaming request body.
      duplex: hasBody ? "half" : undefined,
    });
  }

  /**
   * Open a raw TCP upgrade to the daemon's `/proxy/:port/*` endpoint with the
   * bearer attached. Caller is responsible for piping bytes to/from the
   * browser socket. Returns the upstream socket plus any bytes the upstream
   * already wrote as the HTTP response head.
   *
   * We open the upgrade manually (net.connect + raw HTTP) because we need
   * access to the upstream socket — http.request's `upgrade` event gives it
   * back but the handshake state would still be in progress. Doing it by
   * hand lets us forward the full 101 response verbatim to the browser.
   */
  async openDaemonUpgrade(
    handle: string,
    path: string,
    clientHeaders: IncomingHttpHeaders | Headers,
  ): Promise<net.Socket> {
    const rec = await this.lookupRecord(handle);
    if (!rec) {
      throw new Error(`sandbox not found: ${handle}`);
    }
    const daemonHost = new URL(rec.daemonUrl);
    const socket = net.connect(
      Number(daemonHost.port || 80),
      daemonHost.hostname,
    );
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
    });

    const headers: Record<string, string> = {};
    const addHeader = (k: string, v: string) => {
      headers[k] = v;
    };
    if (clientHeaders instanceof Headers) {
      clientHeaders.forEach((value, key) => addHeader(key, value));
    } else {
      for (const [k, v] of Object.entries(clientHeaders)) {
        if (v == null) continue;
        if (Array.isArray(v)) {
          for (const vv of v) addHeader(k, vv);
        } else {
          addHeader(k, v);
        }
      }
    }
    delete headers["host"];
    delete headers["authorization"];
    headers["host"] = `127.0.0.1:${daemonHost.port}`;
    headers["authorization"] = `Bearer ${rec.token}`;

    const lines = [`GET ${path.startsWith("/") ? path : `/${path}`} HTTP/1.1`];
    for (const [k, v] of Object.entries(headers)) {
      lines.push(`${k}: ${v}`);
    }
    lines.push("", "");
    socket.write(lines.join("\r\n"));
    return socket;
  }

  /**
   * Find a DockerRecord for the given handle. Checks the in-memory cache
   * first, then falls back to the state store — needed when the mesh process
   * restarted (so `byHandle` is empty) but the container is still running.
   */
  private async lookupRecord(handle: string): Promise<DockerRecord | null> {
    const cached = this.byHandle.get(handle);
    if (cached) return cached;
    if (!this.stateStore) return null;
    const persisted = await this.stateStore.getByHandle(RUNNER_KIND, handle);
    if (!persisted) return null;
    const state = persisted.state as Partial<PersistedDockerState>;
    if (!state.token || !state.daemonUrl) return null;
    try {
      const hostPort = await this.readPort(handle, DAEMON_PORT);
      const daemonUrl = `http://127.0.0.1:${hostPort}`;
      const rec: DockerRecord = {
        handle,
        daemonUrl,
        token: state.token,
        workdir: state.workdir ?? DEFAULT_WORKDIR,
        id: persisted.id,
        repoAttached: state.repoAttached ?? false,
      };
      this.byHandle.set(handle, rec);
      return rec;
    } catch {
      return null;
    }
  }

  private async probePersisted(
    id: SandboxId,
    record: { handle: string; state: Record<string, unknown> },
  ): Promise<DockerRecord | null> {
    const state = record.state as Partial<PersistedDockerState>;
    if (!state.token || !state.daemonUrl) return null;
    // Re-read the port — docker's ephemeral port assignment survives rm --init
    // but we may have restarted and lost the port mapping in memory.
    try {
      const hostPort = await this.readPort(record.handle, DAEMON_PORT);
      const daemonUrl = `http://127.0.0.1:${hostPort}`;
      const res = await fetch(`${daemonUrl}/health`, {
        signal: AbortSignal.timeout(READINESS_REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return {
        handle: record.handle,
        daemonUrl,
        token: state.token,
        workdir: state.workdir ?? DEFAULT_WORKDIR,
        id,
        repoAttached: state.repoAttached ?? false,
      };
    } catch {
      return null;
    }
  }

  private async waitForReady(daemonUrl: string, handle: string): Promise<void> {
    for (let i = 0; i < READINESS_ATTEMPTS; i++) {
      try {
        const res = await fetch(`${daemonUrl}/health`, {
          signal: AbortSignal.timeout(READINESS_REQUEST_TIMEOUT_MS),
        });
        if (res.ok) return;
      } catch {
        // Connection refused / reset / timeout — daemon still starting.
      }
      await sleep(READINESS_INTERVAL_MS);
    }
    await this.stopContainer(handle).catch(() => {});
    throw new Error(
      `sandbox daemon at ${daemonUrl} did not respond on /health within ${
        (READINESS_ATTEMPTS * READINESS_INTERVAL_MS) / 1000
      }s`,
    );
  }

  private async recoverSandbox(
    id: SandboxId,
    handle: string,
  ): Promise<DockerRecord | null> {
    const env = await this.exec_([
      "inspect",
      "--format",
      "{{range .Config.Env}}{{println .}}{{end}}",
      handle,
    ]);
    if (env.code !== 0) return null;
    let token: string | null = null;
    let workdir = DEFAULT_WORKDIR;
    for (const line of env.stdout.split("\n")) {
      if (line.startsWith("DAEMON_TOKEN=")) {
        token = line.slice("DAEMON_TOKEN=".length);
      } else if (line.startsWith("WORKDIR=")) {
        workdir = line.slice("WORKDIR=".length);
      }
    }
    if (!token) return null;
    const hostPort = await this.readPort(handle, DAEMON_PORT);
    const daemonUrl = `http://127.0.0.1:${hostPort}`;
    try {
      const res = await fetch(`${daemonUrl}/health`, {
        signal: AbortSignal.timeout(READINESS_REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
    } catch {
      return null;
    }
    // Recovered via docker inspect — state store is empty so we don't know
    // whether a repo was previously attached. Leave repoAttached=false and
    // let attachRepoIfNeeded's idempotent bootstrap sort it out.
    return { handle, daemonUrl, token, workdir, id, repoAttached: false };
  }

  private async findExisting(labelId: string): Promise<string | null> {
    const r = await this.exec_([
      "ps",
      "-q",
      "--filter",
      `label=${LABEL_ID}=${labelId}`,
    ]);
    if (r.code !== 0) return null;
    return r.stdout.trim().split("\n").filter(Boolean)[0] ?? null;
  }

  private async stopContainer(handle: string): Promise<void> {
    await this.exec_(["stop", "--time", "2", handle]);
  }

  private async readPort(
    handle: string,
    containerPort: number,
  ): Promise<number> {
    for (let i = 0; i < PORT_READBACK_ATTEMPTS; i++) {
      const r = await this.exec_(["port", handle, `${containerPort}/tcp`]);
      if (r.code === 0) {
        const port = parsePortMapping(r.stdout);
        if (port !== null) return port;
      } else if (/no such container/i.test(r.stderr)) {
        // Container exited (and `--rm` cleaned it up) before the daemon bound
        // the port. Retrying for 3s is pointless — fail fast with the exit
        // status and logs so the caller sees what crashed.
        const diag = await this.containerExitDiagnostics(handle);
        throw new Error(
          `sandbox container ${handle} exited before daemon started${diag}`,
        );
      }
      await sleep(PORT_READBACK_INTERVAL_MS);
    }
    throw new Error(
      `timed out waiting for docker port mapping on container ${handle}`,
    );
  }

  private async containerExitDiagnostics(handle: string): Promise<string> {
    const parts: string[] = [];
    const inspect = await this.exec_([
      "inspect",
      "--format",
      "{{.State.ExitCode}}",
      handle,
    ]);
    if (inspect.code === 0 && inspect.stdout.trim()) {
      parts.push(`exit=${inspect.stdout.trim()}`);
    }
    const logs = await this.exec_(["logs", "--tail", "20", handle]);
    const tail = [logs.stdout, logs.stderr]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    if (tail) parts.push(`logs:\n${tail}`);
    return parts.length ? ` (${parts.join(" ")})` : "";
  }

  private async persist(id: SandboxId, rec: DockerRecord): Promise<void> {
    if (!this.stateStore) return;
    const state: PersistedDockerState = {
      token: rec.token,
      workdir: rec.workdir,
      daemonUrl: rec.daemonUrl,
      repoAttached: rec.repoAttached,
    };
    await this.stateStore.put(id, RUNNER_KIND, { handle: rec.handle, state });
  }
}

async function daemonBash(
  daemonUrl: string,
  token: string,
  input: ExecInput,
): Promise<ExecOutput> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
  const response = await fetch(`${daemonUrl}/bash`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      command: input.command,
      timeoutMs,
      cwd: input.cwd,
      env: input.env,
    }),
    signal: AbortSignal.timeout(timeoutMs + 5_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `sandbox daemon /bash returned ${response.status}${body ? `: ${body}` : ""}`,
    );
  }
  const json = (await response.json()) as {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    timedOut?: boolean;
  };
  return {
    stdout: json.stdout ?? "",
    stderr: json.stderr ?? "",
    exitCode: json.exitCode ?? -1,
    timedOut: Boolean(json.timedOut),
  };
}

/**
 * Idempotent repo bootstrap: sets global git identity, then clones into
 * `workdir`. Three branches:
 *  - `workdir/.git` exists → already a repo, skip.
 *  - `workdir` empty → clone directly.
 *  - `workdir` non-empty and not a repo → late-attach. Move every existing
 *    file (including dotfiles) into a sibling `<workdir>.prelink.<unix-ts>/`
 *    backup so the clone can proceed without clobbering user work.
 */
async function bootstrapRepo(
  daemonUrl: string,
  token: string,
  workdir: string,
  repo: NonNullable<EnsureOptions["repo"]>,
): Promise<void> {
  const qWorkdir = shellQuote(workdir);
  // `shopt -s dotglob nullglob` lets the glob expand to dotfiles and to
  // nothing when the dir is empty, so `mv` never sees `*` literally.
  const cmd = [
    `git config --global user.name ${shellQuote(repo.userName)}`,
    `git config --global user.email ${shellQuote(repo.userEmail)}`,
    `if [ -d ${qWorkdir}/.git ]; then echo "workdir already a git repo, skipping clone"; elif [ -z "$(ls -A ${qWorkdir} 2>/dev/null)" ]; then git clone ${shellQuote(repo.cloneUrl)} ${qWorkdir}; else BACKUP=${qWorkdir}.prelink.$(date +%s) && mkdir -p "$BACKUP" && ( shopt -s dotglob nullglob && mv ${qWorkdir}/* "$BACKUP"/ ) && echo "moved pre-link contents to $BACKUP" && git clone ${shellQuote(repo.cloneUrl)} ${qWorkdir}; fi`,
  ].join(" && ");
  // git clone for medium repos can easily exceed the default 60s exec timeout.
  const result = await daemonBash(daemonUrl, token, {
    command: cmd,
    timeoutMs: 10 * 60_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `docker sandbox repo bootstrap failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function hashId(id: SandboxId): string {
  return createHash("sha256")
    .update(sandboxIdKey(id))
    .digest("hex")
    .slice(0, 16);
}

function parsePortMapping(stdout: string): number | null {
  for (const line of stdout.split("\n")) {
    const match = line.trim().match(/:(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const defaultDockerExec: DockerExec = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "docker CLI not found on PATH. Install Docker Desktop (macOS) or Docker Engine (Linux).",
          ),
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
