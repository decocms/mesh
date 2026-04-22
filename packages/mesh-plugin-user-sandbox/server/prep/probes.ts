/**
 * Read-only probes that inspect the builder filesystem without mutating it.
 * Kept separate from `docker.ts` so the bake orchestrator can import these
 * at will, and so runtime modules can share them (e.g. listing workdir
 * entries during detection).
 */

import { shellQuote } from "../../shared";
import { DEFAULT_WORKDIR, execInContainer } from "../docker-helpers";

// Probes are read-only file inspections — 30s is plenty for any realistic
// workdir, and `tolerateExit: true` lets each probe interpret exit codes
// themselves (e.g. `grep -q` exits 1 when no match, not a failure).
const PROBE_OPTS = { timeoutMs: 30_000, tolerateExit: true } as const;

/** List entries in the workdir (including dotfiles) as a Set. */
export async function listWorkdir(handle: string): Promise<Set<string>> {
  const probe = await execInContainer(
    handle,
    `cd ${shellQuote(DEFAULT_WORKDIR)} && ls -1a`,
    PROBE_OPTS,
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
  const result = await execInContainer(
    handle,
    `cd ${shellQuote(DEFAULT_WORKDIR)} && for f in bun.lockb bun.lock pnpm-lock.yaml yarn.lock package-lock.json deno.lock; do if [ -f "$f" ]; then sha256sum "$f" | awk '{print $1}'; exit 0; fi; done; echo ''`,
    PROBE_OPTS,
  );
  if (result.code !== 0) return null;
  const hash = result.stdout.trim();
  return hash.length ? hash : null;
}

/** Current git HEAD of the cloned workdir. Null if not a git repo. */
export async function probeHeadSha(handle: string): Promise<string | null> {
  const result = await execInContainer(
    handle,
    `cd ${shellQuote(DEFAULT_WORKDIR)} && (git rev-parse HEAD 2>/dev/null || echo '')`,
    PROBE_OPTS,
  );
  if (result.code !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length ? sha : null;
}

/**
 * True iff the deno config file in the workdir defines a task named `name`.
 * Reads `deno.json` (preferring that over `deno.jsonc`) and parses it in
 * Node, so "tasks" matches on the object shape and not a stray colon
 * inside a comment or unrelated key. Any read/parse error returns false —
 * the caller is always `tolerateExit`-wrapped.
 */
export async function probeDenoTask(
  handle: string,
  name: string,
): Promise<boolean> {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  const probe = await execInContainer(
    handle,
    `cd ${workdir} && (cat deno.json 2>/dev/null || cat deno.jsonc 2>/dev/null || true)`,
    PROBE_OPTS,
  );
  const text = probe.stdout.trim();
  if (!text) return false;
  const parsed = parseJsonOrJsonc(text);
  if (!parsed || typeof parsed !== "object") return false;
  const tasks = (parsed as { tasks?: unknown }).tasks;
  return (
    tasks !== null &&
    typeof tasks === "object" &&
    Object.prototype.hasOwnProperty.call(tasks, name)
  );
}

function parseJsonOrJsonc(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(stripJsoncComments(text));
    } catch {
      return null;
    }
  }
}

/**
 * Strip `//` line and `/* … *\/` block comments while leaving string
 * contents intact. Small state machine instead of a dep: deno config files
 * are tiny, and a regex-only approach would mangle a `//` inside a string.
 */
function stripJsoncComments(s: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < s.length) {
    const c = s[i];
    if (inString) {
      out += c;
      if (c === "\\" && i + 1 < s.length) {
        out += s[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length - 1 && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
