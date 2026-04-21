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
 *   2. Clone the repo into `/app`.
 *   3. Detect the runtime (deno/bun/node/none) from the manifest files in
 *      the clone and delegate install + warmup to the runtime strategy.
 *      Runtime-specific behaviour lives in `./runtimes/<name>.ts` — this
 *      file never branches on runtime name.
 *   4. Probe the lockfile hash + git HEAD so the bake worker can detect
 *      stale caches.
 *   5. `docker commit` the builder to `mesh-sandbox-prep:<prepKey>`, restoring
 *      the daemon entrypoint so containers spawned from this image behave
 *      like a fresh runner container.
 *   6. `docker rm -f` the builder.
 *
 * The function is self-contained: no mesh/db imports, no ambient state. The
 * caller (prep worker) owns persistence and the row lifecycle.
 */

import { CLAUDE_IMAGE, DEFAULT_IMAGE, gitIdentityScript } from "../../shared";
import {
  commitBuilder,
  DEFAULT_WORKDIR,
  execIn,
  runDocker,
  shellQuote,
  startBuilder,
  type BakeLogger,
} from "./docker";
import { probeHeadSha, probeLockfileHash } from "./probes";
import { detectRuntime } from "./runtimes";
import type { RuntimeContext } from "./runtimes/types";

const CLONE_TIMEOUT_MS = 10 * 60_000;
const INSTALL_TIMEOUT_MS = 20 * 60_000;

export interface BakeInput {
  prepKey: string;
  cloneUrl: string;
  gitUserName: string;
  gitUserEmail: string;
  /**
   * Overrides the base image. Defaults to the plain `mesh-sandbox:local`;
   * set to `mesh-sandbox:claude` when the decopilot local+claude-code flow
   * is enabled so prepped sandboxes ship with the CLI and the first turn
   * doesn't pay an install cost. Gated by `MESH_CLAUDE_CODE_IN_SANDBOX=1`
   * so multi-tenant prep caches don't bloat unnecessarily.
   */
  baseImage?: string;
  /**
   * Install command override. When omitted we detect the runtime from the
   * cloned tree and use the runtime's `defaultInstallCommand`.
   */
  installCommand?: string | null;
}

export interface BakeResult {
  imageTag: string;
  lockfileHash: string | null;
  headSha: string | null;
  installCommand: string;
}

export interface BakeOptions {
  /**
   * Callback for streaming human-readable progress lines. Useful when the
   * caller wants to surface bake output in logs or UI. Defaults to no-op.
   */
  log?: BakeLogger;
}

export type { BakeLogger } from "./docker";

export async function bakePrepImage(
  input: BakeInput,
  opts: BakeOptions = {},
): Promise<BakeResult> {
  const log = opts.log ?? (() => {});
  // When claude-code-in-sandbox is opted in (local dev flow), prep on top
  // of the claude-baked variant so first-turn latency doesn't include the
  // ~30s CLI install. Everyone else sticks with the lean base.
  const defaultBase =
    process.env.MESH_CLAUDE_CODE_IN_SANDBOX === "1"
      ? CLAUDE_IMAGE
      : DEFAULT_IMAGE;
  const baseImage = input.baseImage ?? defaultBase;
  const imageTag = prepImageTag(input.prepKey);

  log(`[prep:${input.prepKey}] starting bake from base ${baseImage}`);
  const builderId = await startBuilder(baseImage);
  log(`[prep:${input.prepKey}] builder container: ${builderId}`);

  try {
    const exec: RuntimeContext["exec"] = (script, stepOpts) =>
      execIn(builderId, script, {
        ...stepOpts,
        log,
        prepKey: input.prepKey,
      });

    await exec(cloneScript(input), {
      label: "clone",
      timeoutMs: CLONE_TIMEOUT_MS,
    });

    const runtime = await detectRuntime(builderId);
    const installCommand =
      input.installCommand ?? runtime.defaultInstallCommand;
    log(
      `[prep:${input.prepKey}] runtime=${runtime.name}; install=${installCommand}`,
    );
    await exec(installScript(installCommand), {
      label: "install",
      timeoutMs: INSTALL_TIMEOUT_MS,
      // Partial installs (one flaky postinstall, one deprecation warning
      // that the package manager escalates to exit 1) are strictly better
      // than an empty image. Whatever did land in the cache still
      // accelerates future threads.
      tolerateExit: true,
    });

    if (runtime.warmup) {
      await runtime.warmup({
        builderId,
        prepKey: input.prepKey,
        log,
        exec,
      });
    }

    // Sanity-check the claude bake before stamping `mesh.claude=1`. The
    // label is a *base-name* check upstream — it doesn't actually peek
    // inside the layers. A misconfigured `mesh-sandbox:claude` tag (e.g.
    // someone ran `docker tag mesh-sandbox:local mesh-sandbox:claude`
    // instead of `docker build -f Dockerfile.claude`) would otherwise
    // silently produce a "claude-baked" prep that triggers ~18s of lazy
    // install on every container start. Fail loudly here so the user
    // fixes the source image once instead of debugging mystery slowness
    // every thread.
    if (baseImage === CLAUDE_IMAGE) {
      try {
        await exec("command -v claude && claude --version", {
          label: "verify-claude",
          timeoutMs: 30_000,
        });
      } catch (err) {
        throw new Error(
          `prep verify-claude: ${baseImage} is missing the claude binary. ` +
            `Rebuild it with \`docker build -t ${baseImage} -f packages/mesh-plugin-user-sandbox/image/Dockerfile.claude packages/mesh-plugin-user-sandbox/image\` ` +
            `then \`docker rmi mesh-sandbox-prep:*\` to force-rebake stale prep images. ` +
            `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const [lockfileHash, headSha] = await Promise.all([
      probeLockfileHash(builderId),
      probeHeadSha(builderId),
    ]);

    log(
      `[prep:${input.prepKey}] committing image (lockfile=${lockfileHash ?? "none"}, head=${headSha ?? "none"})`,
    );
    await commitBuilder(builderId, imageTag, {
      labels: {
        // Provenance marker so `resolvePrepImage` can tell whether a
        // cached prep predates the claude-in-base switch and needs a
        // rebake. Only "1" counts as claude-baked; anything else (or
        // missing) invalidates when MESH_CLAUDE_CODE_IN_SANDBOX=1.
        "mesh.claude": baseImage === CLAUDE_IMAGE ? "1" : "0",
      },
    });

    return { imageTag, lockfileHash, headSha, installCommand };
  } finally {
    await runDocker(["rm", "-f", builderId]).catch(() => {});
  }
}

// ─── scripts that run inside the builder ────────────────────────────────────

function cloneScript(input: BakeInput): string {
  const q = shellQuote;
  const workdir = q(DEFAULT_WORKDIR);
  // Clone into /tmp first when /app is non-empty (base image seeded it),
  // then move the .git directory and tracked files over. In practice /app
  // is empty here, so the direct clone path wins.
  return [
    `mkdir -p ${workdir}`,
    gitIdentityScript(input.gitUserName, input.gitUserEmail),
    `if [ -z "$(ls -A ${workdir} 2>/dev/null)" ]; then git clone ${q(input.cloneUrl)} ${workdir}; else echo "workdir not empty, cloning into tmp" && rm -rf /tmp/prep-clone && git clone ${q(input.cloneUrl)} /tmp/prep-clone && cp -a /tmp/prep-clone/. ${workdir}/ && rm -rf /tmp/prep-clone; fi`,
  ].join(" && ");
}

function installScript(installCommand: string): string {
  return `cd ${shellQuote(DEFAULT_WORKDIR)} && ${installCommand}`;
}

// ─── Public helpers ─────────────────────────────────────────────────────────

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

/**
 * Cheap label probe on a prep image. Returns the value of `mesh.claude`
 * ("1" when the prep was baked on top of `mesh-sandbox:claude`, "0"
 * otherwise, null when the image is missing or didn't stamp the label —
 * i.e. baked before we started writing it).
 */
export async function readPrepClaudeLabel(tag: string): Promise<string | null> {
  const result = await runDocker([
    "image",
    "inspect",
    "--format",
    '{{index .Config.Labels "mesh.claude"}}',
    tag,
  ]);
  if (result.code !== 0) return null;
  const out = result.stdout.trim();
  // `docker inspect` prints the literal string "<no value>" when the key
  // is absent. Treat that the same as an unlabeled legacy image.
  if (!out || out === "<no value>") return null;
  return out;
}
