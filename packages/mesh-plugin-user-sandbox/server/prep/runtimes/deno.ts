/**
 * Deno runtime strategy.
 *
 * Cold-start for a deco-site hitting first request costs 60-90s of module
 * fetches. The bake warmup reproduces as much of that work as possible
 * inside the builder so the committed image ships with fully warmed caches.
 *
 * Three independent caches need warming, each reached by a different
 * technique:
 *
 *   1. **Static module cache** (`$DENO_DIR`): everything `deno` can discover
 *      by walking imports from entrypoints. Populated as a *side-effect* of
 *      `deno install` + any `deno task` invocation — Deno resolves the full
 *      static graph before running the task body.
 *
 *   2. **Build artefacts** (`_fresh/`, bundled islands, generated Tailwind):
 *      only produced by a one-shot `deno task build`. Not every project has
 *      one; we probe and skip when absent.
 *
 *   3. **Lazy / dynamic imports** (deco-cx/apps loaders, matchers, actions;
 *      the bootstrapper's own deco version pulled from `deco.cx/run`): these
 *      are `import()`-ed on demand when a block first resolves, so they are
 *      NOT part of the static graph `deno install` walks. The only way to
 *      cache them is to actually *serve a request*.
 *
 * For (3) we boot the project's `start` task (or `dev` as fallback),
 * wait for the dev server to bind its TCP port, and curl a handful of
 * endpoints — typically `/`, `/deco/meta`, `/sitemap.xml`. That forces
 * Fresh/deco to walk the block graph, triggering the `import()` calls
 * that populate `$DENO_DIR` with the lazy bits.
 *
 * `deno task start` (not `dev`) is preferred because deco's convention
 * wraps it in `deno run … https://deco.cx/run — deno task dev`: the
 * bootstrapper itself fetches a deco version through jsr.io, which is
 * usually ahead of the version pinned in `deno.json`. Running `start`
 * caches that too; running `dev` alone misses it.
 */

import type { Runtime, RuntimeContext } from "./types";
import { probeDenoTask } from "../probes";
import { DEFAULT_WORKDIR, shellQuote } from "../docker";

// Build can legitimately take minutes on large deco-sites — mostly
// Tailwind + Fresh bundling. Cap at 5min.
const BUILD_TIMEOUT_MS = 5 * 60_000;
// Serve warmup budget: (a) bootstrapper + static graph cold-start (30-60s),
// (b) two probe passes × three endpoints × up to 15s each on first hit
// (~90s worst case), (c) 15s tail-hold for async deco work (block install,
// `installing N apps`) that fires after port-bind but before first request.
// 180s covers the common case; tolerateExit captures whatever got cached
// if we run out.
const SERVE_TIMEOUT_MS = 180 * 1000;
const SERVE_TIMEOUT_S = Math.floor(SERVE_TIMEOUT_MS / 1000);
// Two passes: first hit costs the lazy `import()`, second hit catches
// anything still resolving asynchronously (e.g. block graph entries loaded
// on-demand by the first request's handlers).
const PROBE_PASSES = 2;
// Final hold after the last probe. deco emits "installing N apps" logs
// *after* Fresh binds the port, and those registrations trigger more lazy
// imports; without this wait, SIGTERM fires before they reach $DENO_DIR.
const TAIL_HOLD_SECONDS = 15;

const DENO_RUNTIME: Runtime = {
  name: "deno",
  // `--allow-scripts` so pre/postinstall hooks (e.g. native binary fetches
  // in npm shim packages) run. Without it, projects with a Playwright or
  // zstd-wasm dependency ship an image that tries to redownload at runtime.
  defaultInstallCommand: "deno install --allow-scripts",
  warmup: denoWarmup,
};

export default DENO_RUNTIME;

async function denoWarmup(ctx: RuntimeContext): Promise<void> {
  // Phase 1: build — only if the project has it. Populates `_fresh/` and
  // friends so the dev server we run next skips the bundler.
  if (await probeDenoTask(ctx.builderId, "build")) {
    ctx.log(`[prep:${ctx.prepKey}] running \`deno task build\``);
    await ctx.exec(buildScript(), {
      label: "build",
      timeoutMs: BUILD_TIMEOUT_MS,
      tolerateExit: true,
    });
  }

  // Phase 2: serve — cache everything reachable only through a real request,
  // including the bootstrapper's own deco version pulled from deco.cx/run.
  const serveTask = await pickServeTask(ctx.builderId);
  if (!serveTask) {
    ctx.log(
      `[prep:${ctx.prepKey}] no start/dev task found; skipping serve warmup`,
    );
    return;
  }
  ctx.log(
    `[prep:${ctx.prepKey}] warming lazy imports via \`deno task ${serveTask}\` + HTTP probe`,
  );
  await ctx.exec(serveScript(serveTask), {
    label: `warmup:${serveTask}`,
    timeoutMs: SERVE_TIMEOUT_MS + 15_000,
    tolerateExit: true,
  });
}

/**
 * `start` is the deco convention and the preferred target because it pulls
 * the bootstrapper's deco version through `deco.cx/run`. `dev` is the fallback
 * for Deno projects that don't use the deco scaffold.
 */
async function pickServeTask(
  builderId: string,
): Promise<"start" | "dev" | null> {
  if (await probeDenoTask(builderId, "start")) return "start";
  if (await probeDenoTask(builderId, "dev")) return "dev";
  return null;
}

function buildScript(): string {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  // BAKE_WARMUP=1 matches the serve warmup so projects can short-circuit
  // both in a single guard: `if (Deno.env.get("BAKE_WARMUP")) Deno.exit(0)`.
  return `cd ${workdir} && export BAKE_WARMUP=1 && deno task build`;
}

/**
 * Run the dev server long enough to serve a few requests, then stop.
 *
 * Mechanics:
 *   1. Pin `PORT=8000` so we know where to curl.
 *   2. Start the task in the background, redirect its output to a log we
 *      can dump on failure.
 *   3. Wait for the TCP port to bind using `/dev/tcp` (bash-only, so the
 *      script MUST be run via `bash -lc` — which `execIn` already does).
 *      We don't probe with curl here because first request is slow and
 *      we just want to know the listener is up.
 *   4. Curl a handful of well-known endpoints over `PROBE_PASSES` passes.
 *      First pass triggers the lazy `import()` calls deco fires on first
 *      hit for loaders/matchers/actions; later passes catch branches that
 *      resolve on-demand inside handlers (sub-loaders, theme blocks, etc.).
 *   5. Hold the server up for `TAIL_HOLD_SECONDS` so async block-install
 *      work that fires after port-bind (deco's "installing N apps" step)
 *      reaches `$DENO_DIR` before SIGTERM.
 *
 * A hard wall-clock timeout (`timeout $SERVE_TIMEOUT_S`) guards the whole
 * thing; if anything hangs, SIGTERM fires and whatever landed in the cache
 * still gets committed.
 */
function serveScript(task: "start" | "dev"): string {
  const workdir = shellQuote(DEFAULT_WORKDIR);
  const timeout = SERVE_TIMEOUT_S;
  // Endpoints chosen to exercise the deco routing paths that trigger lazy
  // block imports: `/` walks the front-page block graph; `/deco/meta` walks
  // the full block registry; `/sitemap.xml` walks the catalog/routing
  // blocks. Non-deco Deno apps will 404 most of these — harmless, the
  // static graph was already cached by reaching the server.
  const probes = ["/", "/deco/meta", "/sitemap.xml"];
  const curlLoop = probes
    .map(
      (p) =>
        `echo "[warmup pass $PASS] GET ${p}" && curl -sS -o /dev/null --max-time 30 "http://127.0.0.1:\${PORT}${p}" || true`,
    )
    .join("\n");

  // Script body executed via `bash -lc` in the builder container. Heredoc
  // not used because execIn already passes the whole string to `bash -lc`.
  const body = `
set +e
cd ${workdir}
export BAKE_WARMUP=1
export PORT=8000
export LOG=/tmp/bake-warmup.log

deno task ${task} >"$LOG" 2>&1 &
SERVER_PID=$!

# Wait up to 90s for the TCP port to bind.
bound=0
for i in $(seq 1 90); do
  if (echo >"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
    bound=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[warmup] server exited before binding $PORT"
    tail -80 "$LOG"
    exit 0
  fi
  sleep 1
done

if [ "$bound" = "0" ]; then
  echo "[warmup] timed out waiting for port $PORT"
  tail -80 "$LOG"
  kill -TERM "$SERVER_PID" 2>/dev/null
  exit 0
fi

for PASS in $(seq 1 ${PROBE_PASSES}); do
${curlLoop}
  # Brief gap between passes lets the server finish streaming the response
  # and any tail imports it kicked off before we hit it again.
  sleep 2
done

# Final hold: deco's post-bind "installing N apps" and handler-side lazy
# imports often finish after the last curl. This gives them time to land
# in \$DENO_DIR before SIGTERM.
sleep ${TAIL_HOLD_SECONDS}

kill -TERM "$SERVER_PID" 2>/dev/null
wait "$SERVER_PID" 2>/dev/null
exit 0
`;
  // Wrap the whole script in GNU coreutils `timeout` as a last-resort wall
  // clock. If anything stalls past SERVE_TIMEOUT_S we still exit cleanly
  // with whatever we cached.
  return `timeout ${timeout} bash -c ${shellQuote(body)} || true`;
}
