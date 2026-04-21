/**
 * Prep Image Baker
 *
 * Produces a Docker image that carries a cloned repo + installed dependencies
 * for a (user, repo) pair, so new thread containers can skip clone + install
 * on startup.
 *
 * Contract:
 *   bakePrepImage(input) → tag'd image name on success; throws on failure.
 *
 * Flow:
 *   1. `docker run` a builder container from the sandbox base image with
 *      the default daemon replaced by `sleep infinity` so we can exec into
 *      an otherwise idle container.
 *   2. `docker exec` the clone, install, lockfile-hash, and head-sha probes.
 *   3. `docker commit` the builder to `mesh-sandbox-prep:<prepKey>`, restoring
 *      the daemon entrypoint so containers spawned from this image behave
 *      like a fresh runner container.
 *   4. `docker rm -f` the builder.
 *
 * The function is self-contained: no mesh/db imports, no ambient state. The
 * caller (prep worker) owns persistence and the row lifecycle.
 */

import { spawn } from "node:child_process";
import { DEFAULT_IMAGE, DAEMON_PORT } from "../../shared";

const BUILDER_LABEL = "mesh-sandbox-prep-builder";
const DEFAULT_WORKDIR = "/app";
const CLONE_TIMEOUT_MS = 10 * 60_000;
const INSTALL_TIMEOUT_MS = 20 * 60_000;
const PROBE_TIMEOUT_MS = 30_000;
// Upper bound for the Deno dev-task warm-up. Deno resolves all static
// imports before the task body runs, so the cache-warming side-effect has
// happened by the time the task body executes — we don't need to wait for
// a long-running server. 30s covers the static-import fetch for typical
// deco-sites repos; longer waits traded bake time for marginal cache gain
// on deps only hit via lazy/dynamic imports, which weren't worth it.
const DENO_WARMUP_TIMEOUT_S = 30;

export interface BakeInput {
  prepKey: string;
  cloneUrl: string;
  gitUserName: string;
  gitUserEmail: string;
  /** Overrides the base image. Defaults to the plugin's shared image. */
  baseImage?: string;
  /**
   * Install command override. When omitted we sniff the cloned tree for a
   * recognised manifest/lockfile and pick the default package manager.
   */
  installCommand?: string | null;
}

export interface BakeResult {
  imageTag: string;
  lockfileHash: string | null;
  headSha: string | null;
  installCommand: string;
}

export type BakeLogger = (line: string) => void;

export interface BakeOptions {
  /**
   * Callback for streaming human-readable progress lines. Useful when the
   * caller wants to surface bake output in logs or UI. Defaults to no-op.
   */
  log?: BakeLogger;
}

export async function bakePrepImage(
  input: BakeInput,
  opts: BakeOptions = {},
): Promise<BakeResult> {
  const log = opts.log ?? (() => {});
  const baseImage = input.baseImage ?? DEFAULT_IMAGE;
  const imageTag = prepImageTag(input.prepKey);

  log(`[prep:${input.prepKey}] starting bake from base ${baseImage}`);
  const builderId = await startBuilder(baseImage);
  log(`[prep:${input.prepKey}] builder container: ${builderId}`);

  try {
    await execIn(builderId, cloneScript(input), {
      timeoutMs: CLONE_TIMEOUT_MS,
      label: "clone",
      log,
      prepKey: input.prepKey,
    });

    const detection = await detectProject(builderId);
    const installCommand = input.installCommand ?? detection.installCommand;
    log(`[prep:${input.prepKey}] install: ${installCommand}`);
    await execIn(builderId, installScript(installCommand), {
      timeoutMs: INSTALL_TIMEOUT_MS,
      label: "install",
      log,
      prepKey: input.prepKey,
      // Partial installs (one flaky postinstall, one deprecation warning that
      // Deno escalates to exit 1) are strictly better than an empty image.
      // Whatever did land in the cache still accelerates future threads.
      tolerateExit: true,
    });

    // For Deno projects, warm the caches on disk. Two strategies, best-first:
    //
    //   1. If the project has a one-shot `build` task (Fresh, deco-sites),
    //      run it. It terminates on its own and writes compiled artifacts
    //      (`_fresh/`, bundled islands, Tailwind CSS) to disk that the dev
    //      server reuses, so thread boot skips the build step entirely.
    //
    //   2. Otherwise, run `deno task dev` under a `timeout`. Deno resolves
    //      static imports before the task body executes, so even a
    //      SIGTERM'd dev server leaves the module cache populated. This
    //      doesn't save Fresh-style build time but covers projects without
    //      a build task.
    //
    // Both are `tolerateExit`-wrapped — whatever lands on disk ships, and a
    // project that can't compile without DB/env still gets module caches.
    if (detection.runtime === "deno") {
      if (detection.hasBuildTask) {
        log(`[prep:${input.prepKey}] running \`deno task build\` to prebuild`);
        await execIn(builderId, denoBuildScript(), {
          // Build can legitimately take minutes on large deco-sites —
          // mostly Tailwind + Fresh bundling. Cap at 5min.
          timeoutMs: 5 * 60_000,
          label: "build",
          log,
          prepKey: input.prepKey,
          tolerateExit: true,
        });
      } else {
        log(
          `[prep:${input.prepKey}] warming $DENO_DIR via dev-task cold start`,
        );
        await execIn(builderId, denoWarmupScript(), {
          timeoutMs: (DENO_WARMUP_TIMEOUT_S + 5) * 1000,
          label: "warmup",
          log,
          prepKey: input.prepKey,
          tolerateExit: true,
        });
      }
    }

    const [lockfileHash, headSha] = await Promise.all([
      probeLockfileHash(builderId),
      probeHeadSha(builderId),
    ]);

    log(
      `[prep:${input.prepKey}] committing image (lockfile=${lockfileHash ?? "none"}, head=${headSha ?? "none"})`,
    );
    await commitBuilder(builderId, imageTag);

    return { imageTag, lockfileHash, headSha, installCommand };
  } finally {
    await runDocker(["rm", "-f", builderId]).catch(() => {});
  }
}

// ─── docker subprocess helpers ──────────────────────────────────────────────

interface DockerResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runDocker(args: string[], timeoutMs = 60_000): Promise<DockerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stderr += `\n[docker ${args[0]}] timed out after ${timeoutMs}ms`;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
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
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

async function startBuilder(baseImage: string): Promise<string> {
  // `sleep infinity` keeps the builder alive without the daemon — we commit
  // it back to daemon CMD later. Not passing -p so we don't reserve a host
  // port we'll never talk to.
  const result = await runDocker([
    "run",
    "-d",
    "--label",
    `${BUILDER_LABEL}=1`,
    "--entrypoint",
    "/bin/sleep",
    baseImage,
    "infinity",
  ]);
  if (result.code !== 0) {
    throw new Error(
      `docker run builder failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  const handle = result.stdout.trim().split("\n").pop()?.trim();
  if (!handle) {
    throw new Error("docker run builder returned no container id");
  }
  return handle;
}

interface ExecInOptions {
  timeoutMs: number;
  label: string;
  log: BakeLogger;
  prepKey: string;
  /**
   * When true, a non-zero exit is logged as a warning and the step is still
   * considered successful. Used for `deno install` + warmup, where partial
   * installs (some deps cached) are strictly better than an empty image.
   */
  tolerateExit?: boolean;
}

async function execIn(
  handle: string,
  script: string,
  opts: ExecInOptions,
): Promise<void> {
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    opts.timeoutMs,
  );
  if (result.stdout.trim())
    opts.log(`[prep:${opts.prepKey}] ${opts.label}: ${result.stdout.trim()}`);
  if (result.code !== 0) {
    const tail = result.stderr.trim() || result.stdout.trim() || "no output";
    if (opts.tolerateExit) {
      opts.log(
        `[prep:${opts.prepKey}] ${opts.label} exited ${result.code} (continuing): ${tail.slice(-400)}`,
      );
      return;
    }
    throw new Error(`prep ${opts.label} failed (exit ${result.code}): ${tail}`);
  }
}

async function commitBuilder(handle: string, tag: string): Promise<void> {
  // The builder was launched with `--entrypoint /bin/sleep`, so the source
  // container carries that entrypoint and commit inherits it. `docker commit`
  // has no supported syntax for *clearing* an entrypoint (`--change
  // 'ENTRYPOINT []'` is silently a no-op), so we overwrite it with the daemon
  // command directly and leave CMD empty. Without this, thread containers
  // spawned from the prep image run `/bin/sleep node /opt/...daemon.mjs`,
  // which exits 1 immediately and produces a port-readback timeout upstream.
  const result = await runDocker([
    "commit",
    "--change",
    'ENTRYPOINT ["node","/opt/sandbox-daemon/daemon.mjs"]',
    "--change",
    "CMD []",
    "--change",
    `EXPOSE ${DAEMON_PORT}`,
    handle,
    tag,
  ]);
  if (result.code !== 0) {
    throw new Error(
      `docker commit failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

// ─── scripts that run inside the builder ────────────────────────────────────

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function cloneScript(input: BakeInput): string {
  const q = shellQuote;
  const workdir = q(DEFAULT_WORKDIR);
  return [
    `mkdir -p ${workdir}`,
    `git config --global user.name ${q(input.gitUserName)}`,
    `git config --global user.email ${q(input.gitUserEmail)}`,
    // Clone into /tmp first so we can detect an existing /app that happens
    // to be non-empty (e.g. base image seeded it), then move the .git
    // directory and tracked files over. In practice /app is empty here, so
    // the direct clone path wins.
    `if [ -z "$(ls -A ${workdir} 2>/dev/null)" ]; then git clone ${q(input.cloneUrl)} ${workdir}; else echo "workdir not empty, cloning into tmp" && rm -rf /tmp/prep-clone && git clone ${q(input.cloneUrl)} /tmp/prep-clone && cp -a /tmp/prep-clone/. ${workdir}/ && rm -rf /tmp/prep-clone; fi`,
  ].join(" && ");
}

function installScript(installCommand: string): string {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  // -lc so nvm/deno/bun shims on PATH work; cd first so the install finds
  // the manifest. The `|| true` on cache-prune is defensive — we don't want
  // a noisy cache purge to fail the whole bake.
  return `cd ${workdir} && ${installCommand}`;
}

type ProjectRuntime = "deno" | "bun" | "node" | "none";

interface ProjectDetection {
  runtime: ProjectRuntime;
  installCommand: string;
  /** True when `deno task build` (or equivalent) is defined and safe to run. */
  hasBuildTask: boolean;
}

async function detectProject(handle: string): Promise<ProjectDetection> {
  const probe = await runDocker(
    [
      "exec",
      handle,
      "bash",
      "-lc",
      `cd ${shellQuote(DEFAULT_WORKDIR)} && ls -1a`,
    ],
    PROBE_TIMEOUT_MS,
  );
  if (probe.code !== 0) {
    throw new Error(
      `project probe failed (exit ${probe.code}): ${probe.stderr.trim()}`,
    );
  }
  const files = new Set(
    probe.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );

  // Deno wins the runtime check over Node when both appear — deco-sites and
  // friends ship `deno.json` plus a stray `package.json` for editor tooling.
  if (files.has("deno.json") || files.has("deno.jsonc")) {
    const hasBuildTask = await probeDenoBuildTask(handle);
    return {
      runtime: "deno",
      installCommand: "deno install --allow-scripts",
      hasBuildTask,
    };
  }
  if (files.has("bun.lockb") || files.has("bun.lock")) {
    return {
      runtime: "bun",
      installCommand: "bun install --frozen-lockfile",
      hasBuildTask: false,
    };
  }
  if (files.has("pnpm-lock.yaml")) {
    return {
      runtime: "node",
      installCommand: "pnpm install --frozen-lockfile",
      hasBuildTask: false,
    };
  }
  if (files.has("yarn.lock")) {
    return {
      runtime: "node",
      installCommand: "yarn install --frozen-lockfile",
      hasBuildTask: false,
    };
  }
  if (files.has("package-lock.json")) {
    return { runtime: "node", installCommand: "npm ci", hasBuildTask: false };
  }
  if (files.has("package.json")) {
    return {
      runtime: "node",
      installCommand: "npm install",
      hasBuildTask: false,
    };
  }
  // No manifest — nothing to install. Bake still useful for the clone step.
  return {
    runtime: "none",
    installCommand: "echo 'no manifest detected; skipping install'",
    hasBuildTask: false,
  };
}

/**
 * True iff the project's `deno.json` / `deno.jsonc` defines a `build` task.
 * Used to pick the prebuild path over the generic dev-task warmup. Looking
 * at the raw JSON (instead of `deno task --list`) keeps the probe fast and
 * independent of deno.json validity — Deno's CLI refuses unknown fields.
 */
async function probeDenoBuildTask(handle: string): Promise<boolean> {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  // `jq` isn't guaranteed in the base image, so grep for the key. False
  // positives are fine — we'll still try running it, and tolerateExit masks
  // any failure.
  const script = `cd ${workdir} && (cat deno.json 2>/dev/null || cat deno.jsonc 2>/dev/null) | grep -Eq '"build"[[:space:]]*:'`;
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    PROBE_TIMEOUT_MS,
  );
  return result.code === 0;
}

/**
 * Warm the Deno module cache by running the project's dev task with a hard
 * timeout. Deno fetches every static import before the task body executes,
 * so by the time the timeout fires the cache-warming side-effect has
 * already happened. We pick `dev` first (deco-sites convention) and stop
 * there — caller tolerates non-zero exit, so a missing task or a crashing
 * server both still commit whatever landed in the cache.
 *
 * `BAKE_WARMUP=1` is exposed to the task so a project that dislikes the
 * side-effect can no-op via `if (Deno.env.get("BAKE_WARMUP")) Deno.exit(0)`.
 */
function denoWarmupScript(): string {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  const timeout = DENO_WARMUP_TIMEOUT_S;
  return [
    `cd ${workdir}`,
    "export BAKE_WARMUP=1",
    `timeout ${timeout} deno task dev >/dev/null 2>&1 || true`,
  ].join(" && ");
}

/**
 * Run the project's `build` task so compiled artifacts (`_fresh/`, bundled
 * islands, generated CSS) land on disk and get captured in the committed
 * image. A one-shot task that terminates on its own — unlike the dev-task
 * warmup this doesn't need an outer `timeout` wrapper, though the caller
 * still caps it at a few minutes via the exec budget.
 *
 * `BAKE_WARMUP=1` matches the dev warmup so projects can short-circuit.
 */
function denoBuildScript(): string {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  return [`cd ${workdir}`, "export BAKE_WARMUP=1", "deno task build"].join(
    " && ",
  );
}

async function probeLockfileHash(handle: string): Promise<string | null> {
  const script = `cd ${shellQuote(DEFAULT_WORKDIR)} && for f in bun.lockb bun.lock pnpm-lock.yaml yarn.lock package-lock.json deno.lock; do if [ -f "$f" ]; then sha256sum "$f" | awk '{print $1}'; exit 0; fi; done; echo ''`;
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    PROBE_TIMEOUT_MS,
  );
  if (result.code !== 0) return null;
  const hash = result.stdout.trim();
  return hash.length ? hash : null;
}

async function probeHeadSha(handle: string): Promise<string | null> {
  const script = `cd ${shellQuote(DEFAULT_WORKDIR)} && (git rev-parse HEAD 2>/dev/null || echo '')`;
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    PROBE_TIMEOUT_MS,
  );
  if (result.code !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length ? sha : null;
}

// ─── Exports ────────────────────────────────────────────────────────────────

export function prepImageTag(prepKey: string): string {
  return `mesh-sandbox-prep:${prepKey}`;
}

export async function prepImageExists(tag: string): Promise<boolean> {
  const result = await runDocker(["image", "inspect", tag]);
  return result.code === 0;
}

export async function deletePrepImage(tag: string): Promise<void> {
  await runDocker(["rmi", tag]);
}
