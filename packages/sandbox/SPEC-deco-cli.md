# Spec: `deco` CLI as the process-control surface for sandboxes

Status: draft, iterating per-PR
Owner: pedrofrxncx
Scope: `packages/sandbox/daemon`, `packages/sandbox/cli` (new), `packages/sandbox/image`, `packages/sandbox/server/runner/{agent-sandbox,docker,freestyle}`, mesh sandbox proxy, studio UI sandbox view

## Summary

Add a small `deco` CLI binary inside the sandbox image (and installable on the host for local-dev) that lets any caller — the LLM via its existing bash tool, a human via `kubectl exec` / `docker exec` / shell, the studio UI via its existing exec channel — read and write the terminal of any managed process in the sandbox. Bidirectional process control becomes a shell command, not a new MCP tool.

Under the hood the daemon grows a server-side terminal emulator per managed process, plus stdin/screen/resize/wait-until routes. The CLI is a thin client over those routes. The studio UI gets a real xterm.js panel bound to a new WS endpoint backed by the same emulator.

The corepack hang from 2026-04-30 is the motivating instance, but the bug class is general: any CLI that prompts via TTY (npx, husky, apt, inquirer-based tools, gh/gcloud auth, etc.) hangs the sandbox today because nothing on the input side ever writes a byte. After this spec lands, the sandbox stops being write-only-from-the-outside.

## Why

Three problems with the current shape:

1. **Interactive prompts hang the sandbox.** `run-process.ts:47-48` opens stdin as a pipe and never writes to it (deliberately — closing it kills Vite). `script -q -c cmd /dev/null` allocates a PTY around the cmd. Combination: any program that reads from the TTY blocks forever waiting on a pipe nobody's connected to. We already burned a production morning on corepack downloading yarn 1.22.22; the same trap is set for every interactive CLI a postinstall or dev script invokes.
2. **The output channel is write-only.** `Broadcaster.broadcastChunk` pushes raw stdout/stderr bytes out via SSE/WS. Clients see the prompt; they have no way to respond. The PTY is allocated, stdin pipe is open, and we just never use the inbound direction.
3. **The "right" answer (env-var pack) is leaky.** Setting `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, `npm_config_yes=true`, `DEBIAN_FRONTEND=noninteractive`, etc. in the image suppresses common prompts but doesn't generalize. Each new misbehaving CLI is a Dockerfile patch and an image bump. We need a structural escape hatch.

## Goals

- Any prompt that fires inside the sandbox is answerable by the LLM (via existing `bash` MCP tool), the studio UI (via xterm.js), or a human operator (via `kubectl exec`/`docker exec`) — same primitive across all three.
- Zero new MCP tools required for the LLM path. Agent uses `deco` through the existing `bash` route. Discoverability via `deco --help` and a one-line note in the sandbox system prompt.
- Same CLI shape works against K8s sandboxes, Docker sandboxes, freestyle sandboxes, and local-dev sandboxes (with or without Docker). One mental model, four runtimes.
- Server-side terminal emulator means the LLM reads a clean rendered screen, not a million ANSI progress chunks.
- UI gets real xterm.js, not a `<pre>` tail. Vite/Next CLI shortcuts (`r`, `o`, `q`) become reachable.
- Layer 1 (env-var pack) still ships in the Dockerfile so the typical case never reaches the escape hatch.

## Non-goals

- Replacing the daemon's existing `bash`/`exec` routes. They keep doing what they do; `deco` is one binary the agent invokes through them.
- A "structured prompt" abstraction (`pendingQuestion: string`). Looks tempting for `[Y/n]` cases, breaks immediately for `gum choose`, `inquirer` checkboxes, `git rebase -i` opening vim. Stdin-as-bytes + emulated screen is the universal shape.
- Multi-user collaborative editing of a sandbox's terminal. Last-write-wins on stdin bytes, soft signal in UI when the agent is typing. Anything richer (input lock, broadcasting cursors) is v3.
- Heuristic "process is stalled" detection on the daemon side. The CLI exposes screen + cursor + lastChunkAt; whoever's watching can decide. We can layer a heuristic later as a UI affordance, not a daemon responsibility.
- Replacing the existing SSE event stream (`/_decopilot_vm/events`). Process control gets its own routes; the existing event stream stays for setup/lifecycle events.

---

## Architecture

```
                 ┌────────── studio UI ────────────┐
                 │  xterm.js panel, tab per proc   │
                 └──────────────┬──────────────────┘
                                │ WS
                                │
[LLM] ─bash MCP tool─> [mesh] ──┼───── HTTP / WS proxy ─────> [daemon]
                                │                                 │
[human] ─kubectl exec──> [pod shell] ──spawn──> [deco CLI] ──HTTP─┤
                                                                  │
                                            ┌─────────────────────┘
                                            ▼
                              ┌──────────────────────────────┐
                              │ ProcessManager + Broadcaster │
                              │  ┌───────────────────────┐   │
                              │  │ headless terminal emu │   │  per managed
                              │  │ (xterm-headless)      │   │  process
                              │  │  ↑ screen buffer      │   │
                              │  └─────────┬─────────────┘   │
                              │            │ stdin pipe       │
                              │            ▼                  │
                              │     [child via script PTY]    │
                              └──────────────────────────────┘
```

Three consumption shapes against one daemon surface:

- **Agent path**: bash tool → daemon `/bash` route → spawns `deco proc <verb>` → CLI loops back to daemon HTTP at `127.0.0.1:9000`. Request/response. Fits the agent loop, no streaming.
- **UI path**: browser → mesh WS proxy → daemon `/_decopilot_vm/processes/:name/term` WS. Streaming. Inbound `{type:"stdin"|"resize"}`, outbound chunks + periodic snapshots.
- **Human path**: same as agent path but the human types `deco` directly in a shell. The binary is on PATH inside the image; `kubectl exec -it <pod> -- bash` is the entry point.

The daemon's job is to expose both transports. The CLI never streams — it does request/response only. Streaming is the UI's concern.

## The non-obvious bit: server-side terminal emulator

Raw byte streams aren't useful to either the LLM or the agent's screen-reading flow. During `bun install` the child emits ~10k chunks like `\x1b[2K\x1b[1G  📦 Installing [741/1204]` — erase line, cursor home, redraw. If the agent reads "all bytes since boot" it gets a million transient frames. It needs **what's on screen now**.

The daemon runs an in-process headless terminal emulator (`xterm-headless` from the `@xterm` family — same lineage as the studio UI's xterm.js, kept version-locked) per managed process. The PTY's stdout pipes into the emulator; the emulator maintains a screen buffer (e.g. 200 cols × 50 rows + 500 lines of scrollback). That buffer is the **single source of truth** for both the UI render and the LLM's read.

This pays off three ways:

1. LLM reads the rendered screen as plain text — including the prompt sitting at the cursor, with all `\x1b[2K` and `\x1b[1G` already collapsed. Decision-grade input.
2. UI render becomes one paint per N chunks instead of one DOM update per chunk. Actually *cheaper* than what the log pane does today.
3. Same data shape works for every process (setup, dev, ad-hoc exec calls), so we don't fork the API per use case.

Memory cost per emulator: tens of KB (200×50 cells × ~16 bytes/cell + 500-line scrollback). Cap scrollback to keep this bounded.

---

## Phase 1 — Daemon foundations

Substantive work, no UI/agent changes yet. Lays the groundwork everything else binds to.

### 1.1 Headless emulator per managed process

`packages/sandbox/daemon/process/run-process.ts:55` — when spawning via `script`, attach an `xterm-headless` instance to the child's stdout. Two options:

- **Per-process emulator**: instantiate one `Terminal({ cols: 200, rows: 50, scrollback: 500 })` per child, keep alive for the child's lifetime. Memory: ~tens of KB per process. Simplest.
- **On-demand replay**: ring-buffer raw bytes (capped), spin up an emulator on read, replay. Cheaper at idle, slower on read, more code. Skip.

Go with per-process. `ProcessManager` grows a `getEmulator(name): Terminal | null` accessor. Existing `broadcaster.broadcastChunk` keeps firing for the SSE stream; the emulator is fed in parallel.

### 1.2 New routes (`packages/sandbox/daemon/routes/processes.ts`, new file)

All under `/_decopilot_vm/processes/:name/*`. All require `Authorization: Bearer <DAEMON_TOKEN>` per Phase 0 of `SPEC-daemon-bootstrap.md`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/_decopilot_vm/processes` | List managed processes: `[{ name, pid, status, startedAt, lastChunkAt }]` |
| `GET` | `/_decopilot_vm/processes/:name/screen` | Returns `{ screen, cursor:{row,col}, cols, rows, lastChunkAt, isAwaitingInput }`. `screen` is the rendered buffer as plain text (newline-joined rows, trailing whitespace trimmed per row) |
| `GET` | `/_decopilot_vm/processes/:name/logs?tail=N&since=DUR` | Raw byte stream from the broadcaster's ring buffer. ANSI not stripped. For when the caller wants the firehose, not the rendered view |
| `POST` | `/_decopilot_vm/processes/:name/stdin` | Body: raw bytes. Caps at 4KB per call. Writes to `child.stdin`. Returns `{ ok: true, bytesWritten }` |
| `POST` | `/_decopilot_vm/processes/:name/resize` | Body: `{ cols, rows }`. Forwards to the PTY (script's TIOCSWINSZ). Updates the emulator geometry. |
| `GET` | `/_decopilot_vm/processes/:name/wait?regex=R&timeout=DUR` | Server-side regex match against the screen buffer. Blocks until match or timeout. Returns `{ matched: bool, screen, elapsedMs }`. Reduces agent token spend on polling loops. |
| `POST` | `/_decopilot_vm/processes/:name/restart` | Kill + respawn. Same cmd, same env, fresh emulator. |
| `POST` | `/_decopilot_vm/processes/:name/kill` | SIGTERM, escalate to SIGKILL after 3s (matches `ProcessManager.kill`). |
| `WS` | `/_decopilot_vm/processes/:name/term` | Bidi: outbound chunks + periodic `{type:"snapshot",screen,cursor}`; inbound `{type:"stdin",data}` and `{type:"resize",cols,rows}`. The UI's transport. |

`isAwaitingInput` heuristic for `/screen`: cheap to compute. True iff `lastChunkAt > 1.5s ago` AND the cursor sits past a `?` or `[Y/n]` / `[y/N]` / `:` on the cursor's line. Imperfect — that's fine, it's a soft signal, the caller still sees the screen and decides.

### 1.3 Process arbitrary-start (defer to Phase 4)

`POST /_decopilot_vm/processes` with `{ name, cmd, env? }` to start an arbitrary supervised process. Useful (worker, test runner) but expands surface beyond what the corepack class needs. Park in Phase 4.

### 1.4 Tests

- Unit: emulator collapses progress-bar redraws into a single screen line.
- Unit: `screen` endpoint returns deterministic text for a known cmd output.
- Unit: `stdin` endpoint writes bytes; child reads them; output reflects.
- Unit: `resize` propagates: PTY learns new dims, emulator resizes, redraw matches.
- Unit: `wait?regex=` blocks then unblocks on screen update; respects timeout.
- Unit: `isAwaitingInput` true after a known prompt, false during normal log churn.
- E2E: corepack hang scenario — start a project that triggers the prompt, `POST /stdin` with `Y\n`, child unblocks. This is the end-to-end regression test for the original bug.
- E2E: stdin bytes cap returns 413 on >4KB.

### 1.5 Risks

- **xterm-headless API surface drift.** The package has had API changes across versions. Pin in the daemon's package.json and lock the studio UI to a compatible major. Track as one component.
- **`script -q` vs PTY resize.** `script` allocates a PTY but its passthrough of TIOCSWINSZ is platform-dependent. Verify on Linux (which is all we ship). Fall back to `ioctl` on the script process's PTY master fd if needed.
- **Stdout passthrough cost.** Every byte now goes through emulator parsing in addition to the existing broadcaster. Bun's emulator should be fine for normal dev-server traffic; benchmark against a pathological case (e.g. `seq 1 1000000`).
- **`script` is not on every distro.** `oven/bun:1.3.13-debian` (`Dockerfile:2`) has it via `bsdutils`. If the freestyle/local paths use a different base, may need an `ENV`/`RUN` line to install `bsdutils`. Verify before Phase 5.

---

## Phase 2 — `deco` CLI binary

The user-facing artifact. Lives at `packages/sandbox/cli/`, ships in the image at `/usr/local/bin/deco`, also publishable as `@decocms/sandbox-cli` for local-host installs.

### 2.1 Build

Compile to a static binary via `bun build --compile --target=bun-linux-x64`. Single file, no runtime deps, ~5MB. Spawn cost ~10ms — fine for the agent's loop.

For local-host installs (devs on macOS/Windows), publish per-platform binaries via `bun build --target=bun-darwin-arm64` etc., wrapped in an npm package whose postinstall pulls the right binary. Or skip per-platform binaries and ship as a Bun script that the user runs via `bunx`. Pick the latter for simplicity in v1; revisit if startup cost matters.

### 2.2 Subcommands

```
deco proc list                                # status table
deco proc screen <name>                        # rendered terminal, plain text
deco proc logs <name> [--tail N] [--since DUR] # raw bytes (ANSI preserved)
deco proc send <name> <input> [--wait DUR] [--wait-regex R]
deco proc restart <name>
deco proc kill <name>
deco proc wait <name> --regex R [--timeout DUR]
deco env                                       # show env the dev process sees
deco config                                    # daemon config (token redacted)
```

`deco proc send`'s `<input>` accepts C-style escape sequences (`Y\n`, `\x1b[A`, `\t`) and resolves them to bytes — so the agent doesn't do shell-escape gymnastics. The escape grammar: `\n`, `\r`, `\t`, `\\`, `\xHH`, `\uHHHH`. Document a couple of examples in `--help` because the agent reads those.

`--wait DUR` on `send` does a single-shot wait-for-screen-change after the write, then prints the new screen. `--wait-regex R` waits until the regex matches the screen. Combined: `deco proc send dev "Y\n" --wait-regex "Ready in"` is the natural shape for "answer the prompt, tell me when boot is done." Halves round-trips for the agent.

### 2.3 Output formats

Stable. The agent will grep this; an unstable format breaks tools downstream.

- `proc list`: aligned ASCII table, header row, columns `NAME STATUS PID UPTIME LAST_OUTPUT`. `--json` flag for machine consumption.
- `proc screen`: raw text, trailing newline. No headers, no decoration. ANSI already stripped server-side.
- `proc logs`: raw bytes, ANSI preserved. The caller asked for the firehose; give it.
- `proc send`: one-line ack `wrote N bytes` on success, exit 0. With `--wait*`, prints screen after; exit code 0 on match, 124 on timeout (matches `timeout(1)`).
- `proc wait`: prints final screen on match, exit 0; on timeout prints last screen, exit 124.

`--json` flag on every read command for structured consumers (mesh proxy could call `deco proc list --json` for its own status surface).

### 2.4 Config / discovery

CLI reads two env vars by convention:

- `DAEMON_URL` — defaults to `http://127.0.0.1:9000`. Set to mesh URL for remote-mode (Phase 5).
- `DAEMON_TOKEN` — defaults to `$DAEMON_TOKEN` from env (already set by bootstrap or env-injection per `SPEC-daemon-bootstrap.md`).

No flag for the URL/token in normal use. Override via env if needed (`DAEMON_URL=https://mesh.example/sandboxes/<handle>/daemon deco proc list`).

### 2.5 Permission model

Inside the sandbox, the boundary is the pod itself: anyone with shell access has full daemon access. Same as today's exec route. No new access-control concept.

For local-mode (Phase 5), the daemon binds to `127.0.0.1` with a randomized token that mesh writes to a file the CLI auto-discovers. Same boundary: the host's user namespace.

### 2.6 Logging / audit

Every CLI invocation in K8s mode lands in mesh's audit trail — the agent's bash tool calls already audit-log, and the bash tool's command line includes `deco proc send dev …`. No new audit concept, but document that `deco proc send` writes are audit-visible for the same reason `bash` calls are.

### 2.7 Tests

- E2E (in image): `deco proc list` returns a table with `dev` after boot.
- E2E: `deco proc send dev "Y\n" --wait-regex "Ready"` resolves on a real Vite project.
- Snapshot: `proc list --json` schema stable across releases (lock with a snapshot test).
- Unit: escape-sequence resolution for `send` input.

### 2.8 Risks

- **Binary size in image.** ~5MB Bun-compiled; negligible against the existing image.
- **Spawn cost in tight agent loops.** ~10ms per invocation. Agents that poll `proc screen` 10x/s would notice. Document `proc wait --regex` as the right primitive for those flows.
- **Output format drift.** Lock `--json` schemas with snapshot tests. Treat human-readable output as best-effort, point automated consumers at `--json`.
- **Name collision with future `deco` binary.** The brand owns the namespace. Open Q on whether to namespace as `decocms` instead. Default to `deco`.

---

## Phase 3 — UI: xterm.js panel

Replaces the existing read-only logs `<pre>` in the studio sandbox view with a real terminal.

### 3.1 Component

`packages/sandbox/server/...` exports a React component (lives in studio's existing UI workspace, not in the sandbox package itself — actual location to confirm). xterm.js bound to `WS /_decopilot_vm/processes/:name/term` through the mesh proxy.

- Tab per managed process (setup, dev, plus arbitrary ones from Phase 4).
- Active tab takes keystrokes; inactive tabs show their last screen.
- Resize: `ResizeObserver` on the panel computes cols/rows, fires `{type:"resize",cols,rows}` upstream. Debounce 150ms.
- Color/font: match studio's existing theme. `xterm-addon-fit` for sizing, `xterm-addon-web-links` for clickable URLs (Vite prints `http://localhost:3000` — should be a link).
- Scrollback: 1000 lines on the client. Server-side scrollback is independent.

### 3.2 Status pills above the terminal

Keep them. Casual users glance at pills (`running`, `awaiting input`, `exited`); power users dive into the terminal. The pills are driven by `proc list` polled every 2s, or pushed via the existing `/_decopilot_vm/events` SSE stream (preferred — no polling).

`awaiting input` pill is the heuristic from §1.2 surfaced in the UI. Clicking it focuses the terminal so the user can type.

### 3.3 Mesh WS proxy

Daemon's WS endpoints aren't reachable directly. The mesh-side proxy needs to handle WS upgrades and forward to the daemon's port via the K8s service IP / pod IP. The existing HTTP proxy (`vm-tools/index.ts:43`, `vm-events.ts:383`) needs a sibling for WS.

Implementation: Hono's WebSocket support + `http.request` with `Upgrade: websocket`. Pass through `Authorization: Bearer <DAEMON_TOKEN>`. Same auth model as the HTTP proxy.

### 3.4 Agent-typing soft signal

When an LLM tool call is in flight that wrote stdin, surface a small "agent typing…" badge in the terminal panel. Driven by mesh observing `bash deco proc send …` invocations and pushing a transient event over the existing SSE stream. Cosmetic; doesn't block the user from typing.

### 3.5 Risks

- **xterm.js bundle size.** ~250KB minified. Already present if the studio UI shows ANSI colors anywhere; verify before pulling in.
- **WS upgrade through corporate proxies.** Some envs strip Upgrade headers. Fallback path: long-poll `proc screen` at ~500ms. Treat as v2 polish.
- **Concurrent typing UX.** User and agent both writing: visible churn, last-write-wins. Document; revisit if it actually bites.

---

## Phase 4 — Arbitrary process supervision

After Phases 1-3 are landed and used in anger.

### 4.1 `POST /_decopilot_vm/processes`

Body: `{ name: string, cmd: string, env?: Record<string,string>, cwd?: string }`. Spawns under the same `ProcessManager` + `script` PTY + emulator pipeline. Same constraints as the existing managed processes (drops privileges to `DECO_UID/GID`, runs as the sandbox user).

### 4.2 CLI exposure

```
deco proc start <name> -- <cmd...>           # spawns under supervisor
deco proc start <name> -e KEY=VAL -- <cmd>   # with env
```

### 4.3 Why this unlocks

The agent can run `deco proc start tests -- bun test --watch` and then `deco proc screen tests` to see results, instead of one-shot `bash bun test` runs that lose context across calls. Same for ad-hoc workers, debug servers, etc.

### 4.4 Risks

- **Resource pressure.** Each managed process is an emulator + a child + a broadcaster ring buffer. Cap concurrent supervised processes per sandbox (e.g. 16) to prevent agent runaway from OOMing the pod.
- **Cleanup.** What happens to an arbitrary process when its `name` is reused? Same as current: kill + respawn. Document.

---

## Phase 5 — Multi-runtime: Docker, freestyle, local

The same daemon and the same CLI work in every deployment shape. The mesh-side proxy and the CLI's bootstrap differ.

Per the project guideline (memory note `feedback_no_freestyle_mesh_must_be_oss`): freestyle and Docker are first-class. This section treats them that way.

### 5.1 K8s (already covered)

- Daemon in pod, CLI baked into image, mesh proxies via service IP.
- CLI auto-discovers daemon via `127.0.0.1:9000` + `$DAEMON_TOKEN` (from bootstrap per `SPEC-daemon-bootstrap.md`).

### 5.2 Docker runner

`packages/sandbox/server/runner/docker/` — daemon runs in the container, mesh proxies via `docker exec` or a published port on `127.0.0.1`.

- Daemon image: same. CLI baked in: same.
- Auth: container env carries `DAEMON_TOKEN` (per existing docker runner bootstrap shape, called out in `SPEC-daemon-bootstrap.md` non-changes).
- Mesh-side proxy: HTTP/WS to the published port. Treat as a generic "daemon URL" — same proxy code path as K8s once the URL resolves.

No CLI changes needed. The agent's `bash deco proc list` works inside the container exactly the same way.

### 5.3 Freestyle runner

`packages/sandbox/server/runner/freestyle/` — daemon spawned via SSH (or whatever freestyle's transport is) on a remote host, no container.

- Daemon binary: shipped via the freestyle bootstrap path (already exists per `freestyle/runner.ts:558` "source nvm so node + corepack are on PATH").
- CLI binary: ship alongside the daemon in the freestyle bootstrap. Or skip — the agent on freestyle can call daemon HTTP routes directly, without the CLI, if no shell is available.
- Caveat: freestyle's transport for the agent's bash tool determines whether `deco` is reachable. If freestyle exposes a remote-shell, `deco` works. If it only exposes daemon HTTP, the CLI is moot — the agent uses the underlying HTTP routes via mesh tools (Phase 6, optional).

The structural insight: freestyle's existing bootstrap already enforces bearer auth (`freestyle/runner.ts:230`), and the daemon itself is the same package. Phase 1's routes work identically. The CLI is a UX layer on top; whether it ships in freestyle is a freestyle-specific call.

### 5.4 Local-dev sandbox

The interesting one. Today there's no first-class "run a sandbox locally" path; devs running mesh locally don't have an easy way to test the sandbox flow without K8s or Docker.

**Without Docker (subprocess mode).** The daemon is just a Bun script (`packages/sandbox/daemon/entry.ts`). Mesh's local-dev mode can spawn it as a subprocess on the host:

```
[mesh dev process] ── spawn ──> [daemon (Bun child)]
                                        │
                                        ├── 127.0.0.1:<random port>
                                        └── DAEMON_TOKEN=<random>
                                                ▲
                                                │
[deco CLI on host] ────────────────────────────┘
```

- Mesh writes the daemon URL + token to a known location (e.g. `~/.deco/sandboxes/<handle>/env`) so the CLI auto-discovers it.
- Sandbox FS is just a host directory, not an emptyDir. Caveat: no `readOnlyRootFilesystem` isolation. Document as dev-only.
- No PTY tricks needed beyond what the daemon already does — `script` works on the host.

**With Docker locally.** Same as §5.2 but the container runs on the dev's machine via Docker Desktop / colima / etc.

**Multi-mode CLI.** The same `deco` binary works:

- Inside a sandbox (K8s pod, Docker container, freestyle host, local subprocess): talks to `127.0.0.1:9000` via env vars set by the bootstrap.
- On a developer's laptop: `deco --sandbox <handle>` resolves to mesh's proxy, which forwards to the remote daemon. Agent path is irrelevant here; this is for human SREs and devs.

This is the unification the user flagged: same CLI, four runtimes, two surfaces (sandbox-internal and sandbox-external). Worth shipping the CLI standalone (`@decocms/sandbox-cli` on npm) so the laptop case works.

### 5.5 What to verify before declaring multi-runtime done

- Docker runner: `deco proc list` works inside a docker-runner sandbox with no code changes beyond having the binary on PATH.
- Freestyle runner: defer; the bootstrap shape there is different and out of `SPEC-daemon-bootstrap.md`'s scope. CLI can be added in a follow-up if there's demand.
- Local subprocess: requires a new local runner in `packages/sandbox/server/runner/`, separate spec. Phase 5.4 sketches it; full design is its own doc.

---

## Phase 6 — Optional: thin MCP tools as a fallback

If specific agent flows benefit from skipping the bash → CLI → daemon hops (latency, audit shape, structured args), expose three MCP tools that proxy to the same daemon routes:

- `SANDBOX_TERMINAL_READ({ processName })` → daemon `GET /screen`.
- `SANDBOX_TERMINAL_WRITE({ processName, input })` → daemon `POST /stdin`.
- `SANDBOX_TERMINAL_INTERACT({ processName, send, waitForChangeMs, waitRegex })` → composite.

Don't ship these in v1. The CLI route is preferred for the reasons in Architecture above. Add only if a concrete agent flow demonstrates the bash hop is the bottleneck.

If added, they're thin wrappers over the daemon routes — no special logic, just MCP-tool ergonomics (typed args, `ctx.access.check()`, audit field shape). ~50 LoC each.

---

## Layer 1: env-var pack (already partially landed)

The motivating-incident hot fix from 2026-04-30 added `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` to the Dockerfile and a redundant `export` prefix in `dev-autostart.ts:24`. This spec subsumes that fix as Layer 1 of a layered defense.

### What ships in the Dockerfile

```dockerfile
ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_yes=true \
    DEBIAN_FRONTEND=noninteractive \
    HUSKY=0 \
    ADBLOCK=1 \
    DISABLE_OPENCOLLECTIVE=1
```

These cover the well-known interactive CLIs by surface convention. Most prompts never fire. Phase 1's escape hatch handles the rest.

### What we explicitly don't set

- `CI=true`. Most catch-all flag, but changes tool behavior in subtle ways: yarn 1 fails install on lockfile mismatch, jest output flips, dev-only optimizations skip. For a *dev sandbox* we want tools to behave like dev but not prompt. `CI=true` overshoots.

### Cleanup from the hot fix

Once the Dockerfile env is in place:

- `packages/sandbox/daemon/setup/install.ts:21` — the in-cmd `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 &&` becomes redundant. Drop for symmetry; image ENV covers it.
- `packages/sandbox/daemon/process/dev-autostart.ts:24` — same. Drop.

This is a follow-up commit on top of the Dockerfile change, not a separate phase.

---

## Suggested PR sequence

1. **Layer 1 cleanup**: expand Dockerfile env, remove the redundant in-cmd exports. Image bump. (1 PR, small.)
2. **Phase 1.1 + 1.2**: emulator + routes. Daemon-only, no CLI yet. Includes the corepack regression test. Image bump. (1 PR, medium.)
3. **Phase 2**: `deco` CLI binary + image install + workspace setup for `packages/sandbox/cli`. Image bump. (1 PR, medium.)
4. **Phase 3.3**: mesh WS proxy. (1 PR, small-medium — verify Hono WS upgrade story.)
5. **Phase 3.1 + 3.2 + 3.4**: studio UI terminal panel. (1 PR, medium.)
6. **System prompt**: add the one-line note pointing the LLM at `deco --help`. (1 PR, trivial — coordinated with whoever owns sandbox agent prompts.)
7. **Phase 4**: arbitrary process start. After observing real usage. (1 PR, small.)
8. **Phase 5.2 + 5.4**: Docker + local-subprocess verification + minor runner-side changes. (1-2 PRs.)
9. **Phase 6** (optional): MCP tool wrappers if demand emerges. (1 PR, small.)

PRs 2-5 should soak between merges; the daemon emulator is the single biggest correctness risk.

---

## Risks and what to verify before merging Phase 1

### Emulator correctness on real-world output

`xterm-headless`'s parser has corners (DCS sequences, OSC, application keypad mode). Most dev-server and install output is well-behaved, but `htop`, `vim`, `gum` use the corners. Test against:

- `bun install` (progress bars).
- `next dev` cold start (animated dots, color).
- `gum choose` if a postinstall ever uses it.
- `git log --color` for ANSI passthrough.

Any divergence from a real terminal renders the screen wrong — and the LLM will reason against the wrong screen. This is the single highest-leverage thing to verify before rolling broadly.

### `script` PTY and emulator drift

`script -q -c cmd /dev/null` allocates a PTY and the emulator reads its output. If the cmd queries `tput lines/cols` or `stty size`, it sees the PTY's geometry, not the emulator's. We need to set the PTY's geometry to match the emulator's at start (e.g. 200×50) and propagate resize events. The current code doesn't size the PTY explicitly — verify it inherits from script's parent, then either fix script invocation or use `node-pty` to drive the PTY directly with explicit geometry.

This is a real risk: if PTY geometry differs from emulator geometry, the screen buffer and what the program "thinks" it's drawing on diverge, and progress bars wrap weirdly.

### Stdin write contention

Two writers (UI and agent) racing on the same stdin pipe interleave at byte boundaries — partial sequences. Mitigation: serialize writes inside the daemon (single mutex per process), and make `proc send` atomic (the whole input bytes write or fail).

### `proc wait --regex` complexity creep

The wait endpoint regex match is a feature flag for "agent doesn't burn tokens polling." But regex on screen buffers gets fiddly — does it match across line wraps, does it match into scrollback, does it match the cursor's current line. Spec the matcher precisely:

- Match against the visible screen only (not scrollback).
- Lines joined with `\n`, no trailing whitespace per line.
- Anchors (`^`, `$`) match against full-screen string.
- Re-evaluate on every screen update; debounce to avoid CPU thrash on rapid output (≥50ms between evaluations).

Document. Test with regression cases.

### `script` availability across base images

`oven/bun:1.3.13-debian` has `script` via `bsdutils`. The freestyle daemon may run on a different base. If freestyle doesn't have `script`, the daemon falls back to direct spawn (no PTY) — emulator still works on stdout/stderr, but programs that detect TTY (color, progress bars) downgrade. Acceptable; not a blocker.

---

## Open questions

1. **Binary name: `deco` vs `decocms`.** `deco` is shorter, matches the brand, and reads naturally in shell. Risk: future name collision with another tool a sandbox might pull in. Mitigation: namespace as `decocms` if collision becomes real. Default to `deco` for v1.

2. **Where does the CLI workspace live?** `packages/sandbox/cli/` keeps it co-located with the daemon and image. Alternative: top-level `apps/cli/` if it grows independent commands beyond `proc *`. Default: `packages/sandbox/cli/`; revisit if scope expands.

3. **`xterm-headless` vs `node-pty` + custom buffer.** `xterm-headless` is the natural pair to xterm.js (same parser, same render), so screens match what the UI shows. `node-pty` would also let us drive the PTY with explicit geometry, sidestepping the script-geometry risk in §Risks. Tempting to use both: `node-pty` for PTY allocation + geometry, `xterm-headless` for screen rendering. Decide before Phase 1 starts.

4. **Should the CLI ship server-side audit metadata?** Today, the agent's bash tool audit-logs the command line. `bash deco proc send dev "Y\n"` ends up in the log as a string. Sufficient? Or should the daemon's stdin route audit-log every write with structured `{processName, bytesWritten, source}`? Leaning structured-on-daemon — bash command lines lose details over time.

5. **Local-mode discovery file format.** `~/.deco/sandboxes/<handle>/env` is a stub. Should it be a JSON, a `KEY=val` env file, or piped through the existing config in `~/.deco/services/`? Lean toward env file (`source`-able from a shell, trivial for the CLI to read).

6. **WS protocol subprotocol negotiation.** xterm.js doesn't ship a wire protocol; we define one. Use a simple subprotocol name (`deco.term.v1`) on the WS upgrade so future versions can co-exist. Worth doing in v1 to avoid wire breakage later.

7. **Snapshot cadence on the WS.** Outbound chunks fire on every emulator update. Periodic `{type:"snapshot",screen,cursor}` is for clients that connect mid-stream and need the current state. Cadence: on connect (immediate), then on demand via `{type:"refresh"}` from client. Don't push snapshots on a timer — wastes bandwidth.

8. **What to do about `exec.ts` and `bash.ts` (one-shot routes)?** They have the same hang potential — agent runs `bash apt-get install foo` and apt prompts. Two options:
   - Apply the same emulator + open-stdin model to one-shot exec. Means every exec call is fully interactive. Heavier but consistent.
   - Keep one-shots non-interactive (close stdin, accept that prompts cause failures fast instead of hanging). Lighter but inconsistent.

   Lean toward option 2 with the env-var pack defending most cases. If a one-shot exec actually needs to be interactive, the agent can promote it to a managed process via `deco proc start`. Document the asymmetry.

9. **`SPEC-daemon-bootstrap.md` interaction.** That spec moves config into a bootstrap channel. After it lands, this spec's routes still need `Authorization: Bearer <DAEMON_TOKEN>` enforcement. The two specs compose cleanly — bootstrap delivers the token, this spec uses it. Worth a cross-reference.

---

## Non-changes worth calling out

- `Broadcaster` and the existing SSE event stream stay. Process-control routes are *additional*, not replacements.
- `bash`/`exec` routes stay. The CLI runs on top of `bash`, not in place of it.
- `runner.ts` claim shape, `SandboxClaim` CRD: untouched.
- NetworkPolicy: untouched. Same trust boundary.
- Layer 1 env-var pack is the pre-existing defense and stays the *first* line. Phase 1+ is the *second* line for everything Layer 1 misses.
- Freestyle runner's bootstrap shape (`freestyle/runner.ts:230`): untouched. Phase 5 notes the integration but doesn't change freestyle's shape.
