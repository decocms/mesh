/**
 * Read-only probes that inspect the builder filesystem without mutating it.
 * Kept separate from `docker.ts` so the bake orchestrator can import these
 * at will, and so runtime modules can share them (e.g. listing workdir
 * entries during detection).
 */

import { DEFAULT_WORKDIR, runDocker, shellQuote } from "./docker";

const PROBE_TIMEOUT_MS = 30_000;

/** List entries in the workdir (including dotfiles) as a Set. */
export async function listWorkdir(handle: string): Promise<Set<string>> {
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
      `workdir probe failed (exit ${probe.code}): ${probe.stderr.trim()}`,
    );
  }
  return new Set(
    probe.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

/**
 * Hash the first recognised lockfile in the workdir. Used by the prep worker
 * to detect stale caches — if the lockfile hash changes, the prep image is
 * regenerated.
 */
export async function probeLockfileHash(
  handle: string,
): Promise<string | null> {
  const script = `cd ${shellQuote(DEFAULT_WORKDIR)} && for f in bun.lockb bun.lock pnpm-lock.yaml yarn.lock package-lock.json deno.lock; do if [ -f "$f" ]; then sha256sum "$f" | awk '{print $1}'; exit 0; fi; done; echo ''`;
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    PROBE_TIMEOUT_MS,
  );
  if (result.code !== 0) return null;
  const hash = result.stdout.trim();
  return hash.length ? hash : null;
}

/** Current git HEAD of the cloned workdir. Null if not a git repo. */
export async function probeHeadSha(handle: string): Promise<string | null> {
  const script = `cd ${shellQuote(DEFAULT_WORKDIR)} && (git rev-parse HEAD 2>/dev/null || echo '')`;
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    PROBE_TIMEOUT_MS,
  );
  if (result.code !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length ? sha : null;
}

/**
 * True iff the deno config file in the workdir defines a task named `name`.
 * Uses `grep` instead of parsing JSON so the probe doesn't need `jq` in the
 * base image and survives JSONC comments. False positives are fine — the
 * caller `tolerateExit`-wraps the step.
 */
export async function probeDenoTask(
  handle: string,
  name: string,
): Promise<boolean> {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  const quoted = shellQuote(`"${name}"[[:space:]]*:`);
  const script = `cd ${workdir} && (cat deno.json 2>/dev/null || cat deno.jsonc 2>/dev/null) | grep -Eq ${quoted}`;
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    PROBE_TIMEOUT_MS,
  );
  return result.code === 0;
}
