# Spec: shift sandbox tenant config from K8s env to daemon protocol

Status: draft, iterating per-PR
Owner: pedrofrxncx
Scope: `packages/sandbox/daemon`, `packages/sandbox/server/runner/agent-sandbox`, `deploy/helm/sandbox-env`

## Revision: general-compute reframing (supersedes "tenant identity" framing below)

The sandbox is a **general-purpose compute environment** with a dev-server preview *feature* on top — not a preview-server with shell access as a side effect. That distinction reshapes three things that the original draft of this spec got wrong:

1. **Token delivery is independent of bootstrap.** `DAEMON_TOKEN` always comes from env (downward API in K8s, container env in Docker). Bearer enforcement on mutating routes is live the moment `:9000` binds — no chicken-and-egg with bootstrap. Bootstrap payloads carry tenant repo + runtime config only, not the token.

2. **Mutating routes that don't need orchestrator state work in `pending-bootstrap`.** Bash, file ops (read/write/edit/grep/glob), kill — all available pre-bootstrap with the bearer. Only routes that depend on tenant config (`exec/<scriptName>` for managed scripts, the dev-server proxy fallthrough) are gated on a configured tenant. A user can shell into a freshly-spawned warm pod and inspect it before any tenant claims it.

3. **Orchestrator failure is recoverable.** No more `failed` terminal phase. Clone/install errors → clear `bootstrap.json`, clear in-memory tenant config, broadcast the failure, return phase to `pending-bootstrap`. Mesh re-POSTs with a corrected payload; daemon accepts (no hash conflict because state was cleared). Pod-recreate is reserved for genuine corruption (bootstrap.json with bad hash on disk → file is deleted on read, daemon stays up). The bootstrap-timeout is removed — `pending-bootstrap` is a steady state, not a wedged state.

Phase order:
- `pending-bootstrap`: HTTP server up, bearer enforced, bash/fs/kill work. No orchestrator running. Default at boot when env carries no tenant signal.
- `bootstrapping`: tenant config set, orchestrator running (clone/install/dev-server start).
- `ready`: orchestrator complete, dev-server discovered.
- (No `failed` phase.)

`/health` exposes a `lastError: string | null` field surfacing the most recent orchestrator failure or invalid-bootstrap-on-disk reason. Mesh observes this for diagnostics; the daemon doesn't gate routes on it.

The sections below describe the original "tenant identity" framing. Where they conflict with the revision above, the revision wins. The original framing is preserved as historical context.

---

## Summary

Move per-tenant configuration (repo, runtime, env) out of `SandboxClaim.spec.env` and into a daemon-side bootstrap channel. The daemon becomes the configuration surface; `SandboxClaim.spec.env` carries only the boot envelope (`DAEMON_TOKEN`, `DAEMON_BOOT_ID`, `APP_ROOT`, `PROXY_PORT`, `CLAIM_NONCE`). Side effects: warm pools become viable (today blocked by per-claim tenant env), and per-tenant config can be pushed post-bootstrap without re-rolling pods.

## Why

Three problems with the current shape:

1. **Warm pool is forced off.** `runner.ts:912` hardcodes `warmpool: "none"` because the operator rejects custom env on warm pods (`client.ts:68-74`). Cold start is the only mode.
2. **DAEMON_TOKEN is unenforced.** `config.ts:14-21` validates the token's presence; no route handler checks it. Mesh sends `Authorization: Bearer <token>` (`daemon-client.ts:85, 144`) and the daemon ignores the header. The docstring at `runner.ts:546` ("the daemon enforces bearer auth on the mutating endpoints") is currently aspirational, not real. The actual security boundary is the NetworkPolicy + namespace RBAC.
3. **No channel for ongoing per-tenant config.** Anything that needs to change after pod start (new secret, env tweak, credential rotation) requires a re-roll because configuration only flows through `SandboxClaim.spec.env`.

## Goals

- Daemon owns its own bootstrap and ongoing configuration.
- `SandboxClaim.spec.env` carries no tenant material at steady state.
- Warm pool default behavior works.
- DAEMON_TOKEN enforcement on mutating routes matches the docstring.
- All bootstrap-affecting state transitions are atomic; concurrent bootstrap calls have well-defined outcomes.
- No operator fork. No CRD additions. No sidecars.

## Non-goals

- Replacing the NetworkPolicy with auth-only isolation. NetworkPolicy stays the boundary.
- Projected SA token + TokenReview hardening. Documented as the future direction; not in scope here.
- Touching the freestyle or docker runners' bootstrap path.

---

## Concurrency and atomicity

State that's mutated by bootstrap (in-memory phase, on-disk `bootstrap.json`, mesh state-store row) crosses async boundaries and is reachable from concurrent callers. This section defines the atomicity rules; later sections reference it.

### Daemon-side: single bootstrap mutex

A process-wide async mutex (`bootstrapMutex`) wraps the entire critical section for any operation that observes or transitions phase, or reads/writes `bootstrap.json`:

```
acquire bootstrapMutex
  validate schemaVersion, daemonToken (cheap field-level checks)
  if phase == failed: return 409 { phase: "failed" }
  payloadHash := sha256(canonicalize(payload))
  if persistedHash exists:
    if payloadHash ≠ persistedHash: return 409 { phase: <current>, reason: "conflict" }
    if phase == bootstrapping: return 200 { phase: "bootstrapping", bootId, hash }  // idempotent
    if phase == ready:         return 200 { phase: "ready", bootId, hash }           // idempotent
  else:
    if phase ≠ pending-bootstrap: return 409 { phase: <current> }  // defense-in-depth
    write {schemaVersion, hash, payload} → /home/sandbox/.daemon/bootstrap.json (atomic, see below)
    set in-memory Config
    transition phase: pending-bootstrap → bootstrapping
release bootstrapMutex
start orchestrator (outside the mutex)
return 200 { phase: "bootstrapping", bootId, hash }
```

The mutex serializes inter-request callers, intra-process callers (e.g. orchestrator status updates that flip phase), and the on-boot rehydration path. The orchestrator itself runs *outside* the mutex — long-running I/O must not hold it; only the brief phase-flip on completion or failure re-acquires.

`canonicalize(payload)` is a deterministic stable-sorted JSON encoding: recursive sort by key, no whitespace, `undefined` and missing keys treated identically, env-map sorted by key. The hash is stored alongside the payload on disk so the daemon doesn't recompute on every comparison and so a hash-vs-payload mismatch is detectable on read.

### Daemon-side: atomic file persistence

`/home/sandbox/.daemon/bootstrap.json` is written via `write-temp-then-rename`:

1. Write canonical bytes to `bootstrap.json.tmp` with mode `0600`, owner = daemon UID.
2. `fsync` the file descriptor.
3. `rename(bootstrap.json.tmp, bootstrap.json)` — atomic on POSIX.
4. `fsync` the parent directory.

On boot, the daemon (synchronously, before binding `:9000`):
- Deletes any leftover `bootstrap.json.tmp` (interrupted prior write).
- If `bootstrap.json` is absent → `phase = pending-bootstrap`.
- If present and parses cleanly with a known `schemaVersion` and a hash that matches `sha256(canonicalize(payload))` → hydrate `Config` from it, transition to `phase = bootstrapping`, kick off orchestrator.
- If parse fails, `schemaVersion` is unknown, or hash doesn't match payload → `phase = failed`. `:9000` still binds so mesh observes the failure rather than getting connection-refused indefinitely.

This means `phase` as exposed via `/health` is always post-rehydration — there is no observable "loading" sub-phase from a client's perspective.

### Daemon-side: phase transitions are atomic with their side effects

Every phase transition is paired with the side effect that justifies it, under the mutex:

- `pending-bootstrap → bootstrapping`: paired with persist + `setConfig` (above).
- `bootstrapping → ready`: orchestrator's "dev-server discovered" callback re-acquires `bootstrapMutex` to flip phase.
- `bootstrapping → failed`: orchestrator failure callback same lock pattern.
- Boot-time hydration: pre-bind, before any caller can observe phase.

A phase observed via `/health` is always consistent with what's on disk and the in-memory `Config`.

### Mesh-side: claim-creation serializes provision

`composeClaimName` (`runner.ts:137`) is deterministic from tenant identity. `kubectl create` on the same name from two mesh replicas results in exactly one success and one `AlreadyExists` 409. The losing replica falls into `adopt`/`rehydrate`. This is the first concurrency layer.

The second layer is the daemon mutex: both replicas may still try to bootstrap a freshly-created claim. Identical payloads → both 200; different payloads → first 200, others 409 (and the losing peer must refresh its state-store view and retry).

### Mesh-side: state-store row updates are transactional

The state-store row (`PersistedK8sState`) holds `token`, `ensureOpts`, `bootstrappedAt` (new), `bootstrapHash` (new). All updates go through single-statement upserts:

- `provision` writes `{ token, ensureOpts }` before the bootstrap call.
- `provision` writes `{ bootstrappedAt, bootstrapHash }` after the bootstrap call returns 200.
- `rehydrate` reads the row in one statement; never composes from two reads.

Crash between the two writes is recoverable: `rehydrate` sees `ensureOpts` set + `bootstrappedAt` null → re-bootstrap using the persisted token.

### Tests for this section

- Unit: concurrent identical bootstrap POSTs (10 in parallel) → all 200, daemon writes file once.
- Unit: concurrent differing bootstrap POSTs → exactly one 200, others 409.
- Unit: SIGKILL the daemon mid-write → restart finds either old file or new file, never partial; `bootstrap.json.tmp` is cleaned up on boot.
- Unit: `bootstrap.json` with unknown `schemaVersion` → `phase = failed`, `:9000` still binds.
- Unit: `bootstrap.json` with hash that doesn't match payload → `phase = failed`.
- Unit: `canonicalize` is deterministic — same payload with shuffled key order produces identical bytes.
- Integration: two mesh replicas race `provision` on same tenant → exactly one `bootstrappedAt` timestamp set, the other ends up adopting.

---

## Phase 0 — Token enforcement on the daemon

The daemon must validate `Authorization: Bearer <DAEMON_TOKEN>` on mutating routes. Today the token is loaded into config and never checked.

### Changes

- Add `requireToken(req, config.daemonToken)` middleware in `packages/sandbox/daemon/entry.ts`.
- Apply to all `/_decopilot_vm/*` routes **except** the explicitly unauth'd set:
  - `GET /health` — used by mesh's `waitForDaemonReady` and lifecycle probes.
  - `GET /_decopilot_vm/idle` — kubelet-style probe, no secrets.
  - `GET /_decopilot_vm/events` — studio UI consumes SSE cross-origin from the preview hostname (see `runner.ts:540-549`).
  - `GET /_decopilot_vm/scripts` — same, studio UI cross-origin read.
  - `POST /_decopilot_vm/bootstrap` — phase-gated only, not auth-gated; see Phase 1.
  - `OPTIONS /_decopilot_vm/*` — CORS preflight, already handled at `entry.ts:160-169`.
- Mutating routes (`read/write/edit/grep/glob/bash/exec/kill`) return 401 on missing or wrong bearer.
- The wildcard preview proxy (`proxy.ts`) is unaffected — it doesn't pass through `/_decopilot_vm/*` and is intentionally open.
- **Defensive `Authorization` strip in `daemon/proxy.ts`**: the proxy currently strips `accept-encoding` and `host` (`proxy.ts:19-24`) but forwards `Authorization` to the user dev server. Today this is moot because mesh's `proxyDaemonRequest` is only called for `/_decopilot_vm/*` paths (`vm-events.ts:386`, `vm-tools/index.ts:43`). One-line addition to delete `Authorization` in `proxy.ts` closes the regression vector if `proxyDaemonRequest` is ever extended to wildcard paths. Land this with Phase 0.

### Trust model note

The unauth'd `events`/`scripts` GETs are safe because:
- They expose setup state (script names, log replay), not secrets.
- The preview hostname is the secret (Vercel-style), enforced by 16-char hash in `composeClaimName` (`runner.ts:137`).

### Tests

- E2E: unauthenticated POST to each mutating route returns 401.
- E2E: GET `/_decopilot_vm/events` and `/_decopilot_vm/scripts` work without auth (regression guard for studio UI).
- E2E: `/health` works without auth.
- E2E (positive header tolerance): GET `/health`, `/_decopilot_vm/events`, `/_decopilot_vm/scripts`, and POST `/_decopilot_vm/bootstrap` all succeed when an arbitrary `Authorization` header is attached. Regression guard: mesh attaches the bearer to all paths today; daemon must not 400/401 on a header it doesn't require.
- E2E: `daemon/proxy.ts` strips `Authorization` from the request seen by the dev server.

### Coupling with Phase 1

Phase 0 in isolation enforces a token that is only injected via env. Phase 1 in isolation adds a bootstrap channel with no auth on it. Either order leaves a window where the daemon's auth posture is incoherent. **Ship Phase 0 + Phase 1 in the same daemon image release** — either as one PR or as two PRs that land back-to-back before any image bump.

---

## Phase 1 — Daemon bootstrap state machine

Daemon comes up able to serve `/health` even when no tenant config is present. Tenant config arrives via a new bootstrap route. All transitions and persistence follow the rules in **Concurrency and atomicity** above.

### State machine

```
pending-bootstrap → bootstrapping → ready
                                  ↘ failed
```

- `pending-bootstrap`: HTTP server listening, no orchestrator running, mutating routes return 503 with phase info.
- `bootstrapping`: orchestrator running (clone/install/dev-server start).
- `ready`: orchestrator complete, dev-server discovered.
- `failed`: terminal, requires pod recreate (driven by mesh — see Phase 2).

### Wiring `failed`

`orchestrator.ts:43-114` today catches non-zero clone/install exits and sets `state.done = true; state.running = false` — the daemon process keeps running with no signal to mesh that setup is wedged. Phase 1 must propagate these to `phase = failed`:

- Clone exit code ≠ 0 (`orchestrator.ts:46-54`) → `phase = failed`.
- Install exit code ≠ 0 (`orchestrator.ts:87-96`) → `phase = failed`.
- The `catch (e)` block at `orchestrator.ts:106-114` → `phase = failed`.
- Bootstrap-timeout (Open Q #2) → `phase = failed`.
- `bootstrap.json` parse error, unknown `schemaVersion`, or hash mismatch on boot → `phase = failed`.

Once `failed`, all subsequent `POST /_decopilot_vm/bootstrap` calls return 409 with `{ phase: "failed" }`. **The daemon never self-recovers from `failed`.** Recovery is delete-the-claim-and-re-provision, driven by mesh's `rehydrate` flow (Phase 2).

### Boot path changes (`packages/sandbox/daemon/entry.ts`)

Today `entry.ts` calls `loadConfig(process.env)` synchronously and constructs `Broadcaster`/`ProcessManager`/`SetupOrchestrator` eagerly with `Config` injected. This must invert:

- HTTP server starts first, with bootstrap and health routes wired against a "no-config" state.
- Before binding `:9000`, the daemon attempts to rehydrate from `/home/sandbox/.daemon/bootstrap.json` (see Concurrency section).
- `Config` becomes a settable atomic exposed via `getConfig(): Promise<Config>` + `setConfig(c: Config)`, both gated behind `bootstrapMutex`. The Promise resolves once `setConfig` fires (post-bootstrap or post-hydration). Most call sites await `getConfig()` once at module init and then hold a sync reference.
- `loadConfig` becomes optional: if env carries `DAEMON_TOKEN` + repo info, daemon enters `ready` directly (preserves back-compat for the env-driven path during the migration window). Env-driven path skips file rehydration. If env is empty, attempt file rehydration; if neither, enter `pending-bootstrap`.

This is a real refactor of the boot path, not a flag. Plan for ~150-300 lines touched in `entry.ts` + a new `daemon/state.ts`.

### New route: `POST /_decopilot_vm/bootstrap`

**Phase-gated only, not auth-gated.** The route runs through `bootstrapMutex` per the Concurrency section.

**Payload**:
```ts
{
  schemaVersion: 1;          // bumped on incompatible payload changes
  daemonToken: string;       // ≥ 32 chars
  runtime: "node" | "bun" | "deno";
  cloneUrl?: string;
  repoName?: string;
  branch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  devPort?: number;
  appRoot?: string;          // defaults to /app
  env?: Record<string, string>;  // tenant env passed to the dev process
}
```

**Validation order** (all under the mutex):
1. `schemaVersion` known? If not, `400`.
2. `daemonToken` ≥ 32 chars? If not, `400`.
3. Phase guard + idempotency check (Concurrency section).

**Response shape**: `{ phase, bootId, hash }`. `bootId` lets mesh detect "I'm now talking to a different daemon than the one I bootstrapped" without an extra `/health` round-trip. `hash` lets mesh confirm an idempotent 200 saw the payload it just sent (not a stale identical one from a prior generation).

### Trust model

**NetworkPolicy is the boundary.** The bootstrap route is unauthenticated by design — only mesh pods can reach `:9000` (`deploy/helm/sandbox-env/templates/networkpolicy.yaml`); inside that boundary the daemon trusts whoever first delivers a valid payload. The daemon is single-tenant; multi-tenancy is mesh's job.

After bootstrap, the bearer token (delivered in the payload, then enforced by `requireToken` on every mutating route) is the runtime auth. Pre-bootstrap there is no token to enforce — that's the chicken-and-egg the bootstrap channel exists to resolve.

Threat surface:
1. **DoS** — anyone with network reach to `:9000` can poison the daemon with a junk-but-well-formed payload, wedging the pod until recreate. NetworkPolicy is the only mitigation.
2. **Bootstrap-time hijack** — if NetworkPolicy is misconfigured and a non-mesh peer reaches `:9000` before mesh does, that peer's `daemonToken` becomes the daemon's auth secret. Same mitigation: NetworkPolicy.

A NetworkPolicy CI test (Phase 2) is the regression guard. Document in the route handler that "NetworkPolicy is the trust boundary" so a future contributor doesn't think they can relax the netpol without also adding bootstrap-time auth.

Future hardening (out of scope): projected SA token + TokenReview against the K8s API. With a SA token, bootstrap becomes "prove you're the specific mesh pod assigned to this tenant," at which point NetworkPolicy is defense in depth instead of the sole boundary.

### Persistence

After successful bootstrap, daemon writes `{ schemaVersion, hash, payload }` to `/home/sandbox/.daemon/bootstrap.json` using the atomic write protocol in the Concurrency section. File mode `0600`, owner = daemon UID.

**Why `/home/sandbox` and not `/app`**: `/app` is the workdir emptyDir (`sandbox-template.yaml:126-128`), where user code and `.git` live. Writing daemon state there shows up in `git status`, can collide with user files, and gets blown away by `rm -rf` style cleanups.

**`/home/sandbox` substrate differs by chart values**:
- With `readOnlyRootFilesystem: true` (production), it's a dedicated emptyDir (`sandbox-template.yaml:118-120, 132-134`) with its own 2Gi sizeLimit.
- With `readOnlyRootFilesystem: false` (dev/Kind), there's no separate mount — `/home/sandbox` lives on the container's writable layer, sharing whatever ephemeral-storage budget the pod has.

Either way, persistence is **pod-scoped, not container-scoped**: writes survive daemon process restarts and kubelet container restarts within the same pod, but a pod recreate (operator idle-TTL, eviction, node drain) wipes the state. That's intentional — pod recreate is the operator's reset signal.

To make Phase 1 deterministic across environments, the chart should make `/home/sandbox` an unconditional emptyDir (lift it out of the `readOnlyRootFilesystem` guard). Track as a Phase 1 chart change.

**Daemon process restart inside the same pod** (orchestrator crash, daemon restart): re-read the file on boot pre-`:9000`-bind, transition to `bootstrapping`, resume orchestrator. The orchestrator's `setup/resume.ts` already handles "git already cloned" via `fs.existsSync(.git)`.

### Health endpoint changes

`GET /health` adds a `phase` field:
```ts
{
  ready: boolean;
  bootId: string;
  setup: { running: boolean; done: boolean };
  phase: "pending-bootstrap" | "bootstrapping" | "ready" | "failed";
}
```

`phase` is read post-rehydration (file load happens before `:9000` binds). Mesh and the lifecycle watcher consume it to distinguish "daemon is up but not configured" from "daemon is up and running."

### Tests

- Unit: state machine transitions; idempotency (same payload twice); conflict (different payload); phase guard.
- Unit: concurrent bootstrap calls (covered in Concurrency section).
- Unit: `bootstrap.json` round-trip — write on success, read on restart, atomic rename, tmp-file cleanup on boot.
- Unit: `bootstrap.json` file mode is `0600`, owner = daemon UID.
- Unit: `bootstrap.json` with unknown `schemaVersion` → `phase = failed`.
- Unit: `bootstrap.json` with hash-payload mismatch → `phase = failed`.
- Unit: clone non-zero exit → `phase = failed`; install non-zero exit → `phase = failed`; orchestrator throw → `phase = failed`.
- Unit: subsequent `POST /_decopilot_vm/bootstrap` after `phase = failed` returns `409` with `{ phase: "failed" }` regardless of payload or bearer.
- Unit: bootstrap-timeout (no POST within configured window) → `phase = failed`.
- E2E: bootstrap-then-restart-pod-then-rehydrate resumes a half-cloned repo.
- E2E: env-only path (no bootstrap call) still works — back-compat.
- E2E: `/health.phase` reports correctly through each transition.

### Git config moves into the daemon (was in chart)

Today `sandbox-template.yaml:92-97` injects `GIT_CONFIG_COUNT/KEY_0/VALUE_0` to set `safe.directory '*'`, gated on `readOnlyRootFilesystem`. This is a workaround for git's "dubious ownership" check on the chowned emptyDir, and it's pod-level config the daemon should own.

Three options were considered:

(a) **Pre-clone `git config --global safe.directory '*'` in `entry.ts`** before `runBootSetup()`. Equivalent to today's chart env, but daemon-owned and writable on both rootfs modes (vs current `--system --add` at `identity.ts:7` which writes to `/etc/gitconfig` and silently fails on read-only rootfs).

(b) **Post-clone `git config --global` inside `setup/identity.ts`** (current placement, after `clone.ts:14`). Works only if a fresh clone into a `root:1000`-owned emptyDir doesn't itself trigger the dubious-ownership check.

(c) **Per-invocation `-c safe.directory=*` flag on every `git` command the daemon issues**, starting with `clone.ts:14`. No global config mutation, no lifecycle ordering concerns. Slightly more code (a thin `git()` wrapper) but each call is self-contained. **Default to this.**

Rationale for (c): no global state mutation means no order-of-operations dependency between `entry.ts` and the orchestrator, no fight with read-only rootfs, no chart coupling. The wrapper is ~5 lines.

`user.name`/`user.email` stay in `setup/identity.ts` — they're per-tenant, set after bootstrap delivers the values, and only meaningful when there's a repo.

Verify `HOME` is set in the env the orchestrator passes to spawned children.

> **Empirical verification (informational, not gating)**: run a Kind-based test that clones into a `root:1000`-owned emptyDir without any `safe.directory` flag and observes whether git complains. If the bare clone succeeds, option (b) is sufficient as a fallback. Option (c) is correct regardless.

---

## Phase 2 — Mesh runner switches to bootstrap

Runner-side changes in `packages/sandbox/server/runner/agent-sandbox/runner.ts`. Concurrent provision attempts on the same tenant resolve via deterministic claim names (one mesh replica wins claim-create) and the daemon mutex (one bootstrap call wins). See Concurrency section.

### `buildClaim` / `buildEnvMap`

- Stop populating `spec.env`. Drop `warmpool: "none"` (let CRD default apply).
- Tenant labels stay on `additionalPodMetadata.labels` — those drive cAdvisor/kubelet metric attribution.
- The `RESERVED_ENV_KEYS` set + `buildEnvMap` logic moves verbatim into a new bootstrap-payload builder, which also stamps `schemaVersion`.

### `provision`

Sequencing today: `createSandboxClaim → waitForSandboxReady → openForwarder → waitForDaemonReady`.

After Phase 1, `/health` works pre-bootstrap. Two distinct waits:

1. `waitForDaemonHttp(daemonUrl)` — `/health` responds with `200`. Proves the daemon process is listening.
2. `waitForDaemonReady(daemonUrl)` — `/health.phase === "ready"`. Proves orchestrator finished.

New sequence:
```
createSandboxClaim
  → persist {token, ensureOpts}                    // tx 1
  → waitForSandboxReady
  → openForwarder
  → waitForDaemonHttp
  → daemonBootstrap(payload)
  → persist {bootstrappedAt, bootstrapHash}        // tx 2
  → waitForDaemonReady
```

A crash between tx 1 and tx 2 leaves the row with `ensureOpts` set + `bootstrappedAt` null. `rehydrate` recognizes this as "in-progress provision" and re-bootstraps using the persisted token.

### `rehydrate` — `phase` decision matrix

`openAndProbeDaemon` (`runner.ts:1209`) inspects `/health.phase`:

| `/health.phase`     | Action                                                                 |
|---------------------|------------------------------------------------------------------------|
| `pending-bootstrap` | re-issue bootstrap from persisted `{token, ensureOpts}`                |
| `bootstrapping`     | wait for `ready` (no bootstrap call; the in-flight one will finish)    |
| `ready`             | proceed normally                                                       |
| `failed`            | **delete `SandboxClaim`, clear state-store row, recurse to `provision`** |

The `failed` row is a first-class rule, not a fallback. Without it, a wedged pod sits indefinitely until the operator's idle-TTL evicts it; with it, the next `ensure()` self-heals.

The re-bootstrap payload is composed from **two persisted fields** on the state-store row:

- `state.token` (`PersistedK8sState.token` at `runner.ts:248-249`) — daemon token mesh originally generated at `provision` (`runner.ts:926`).
- `state.ensureOpts` (`runner.ts:253-260`) — `cloneUrl`, `repoName`, `branch`, runtime, env, etc.

Treat as fatal if either is missing on the row — falls through to recreate, same as today's null-opts case.

### `adopt`

Same probe + decision matrix as `rehydrate` for `pending-bootstrap` (re-bootstrap) and `failed` (delete-and-recreate). Drop `readClaimDaemonToken` (`runner.ts:1554-1561`) — token is no longer in the claim.

The legacy adopt path (claim exists but state-store is empty) loses the ability to recover the token from `spec.env`. Today this is the back-compat path for "mesh restart with state-store wipe." After Phase 2, adopt of a legacy claim provisioned pre-bootstrap won't work; treat as `null` and let the next `ensure()` recreate.

### Concurrent mesh replicas racing the same tenant

Handled at two layers:

1. **Claim-creation level**: `composeClaimName` is deterministic. K8s `create` returns 201 to one replica, 409 (`AlreadyExists`) to others. The 409 replicas fall into `adopt`/`rehydrate`.
2. **Bootstrap level**: a winner that hasn't finished bootstrapping may have peers reaching `daemonBootstrap()` against the same daemon. The daemon mutex accepts the first payload; identical-from-state-store payloads from peers return 200; different payloads return 409 (which the losing peer treats as "another mesh replica got there with a newer state-store snapshot" — re-read the row, retry).

### Mesh dies mid-provision

If mesh creates the `SandboxClaim`, the daemon comes up in `pending-bootstrap`, and mesh crashes before `daemonBootstrap()` lands, the daemon hangs in `pending-bootstrap` until the bootstrap-timeout flips it to `failed`. The next `ensure()`:

- Reads state-store row: has `ensureOpts` + `token`, missing `bootstrappedAt`.
- `rehydrate` probes `/health.phase`:
  - `pending-bootstrap` (timeout hasn't fired): re-issue bootstrap. State-store gets `bootstrappedAt` on success.
  - `failed` (timeout fired): delete claim, clear state-store row, recurse to `provision`.

Set the timeout tight enough that a wedged pod doesn't burn warm-pool capacity for long, loose enough that a slow mesh bootstrap call doesn't get killed mid-flight.

### Lifecycle watcher

Add `bootstrapping` phase between `warming-daemon` and `ready` in `lifecycle-watcher.ts`. Driven by `/health.phase`. Reuses the existing `phaseRank` ordering at `lifecycle-watcher.ts:401-416`.

### Migration window

Phase 1 keeps the env-driven path working, so we can roll the daemon image first, then mesh second, with no flag day. During the window:

- New daemon image + old mesh: env path works.
- New daemon + new mesh: bootstrap path works.
- Old daemon + new mesh: mesh tries to bootstrap, daemon 404s. **Don't roll mesh first.**

**Warm-pool image staleness during the daemon image bump**: warm pools may be holding pods built from the old daemon image. Recommended approach is **drain on rollout**: scale `warmPool.size` to 0 before the daemon image bump, restore after. Since warm pool is currently disabled (`warmpool: "none"`), the brief outage is moot. The alternative (tolerate the soak — accept that some new mesh provisions hit old daemons that 404, falling into `failed` → recreate) is self-healing but wasteful.

Track drain-on-rollout as a deploy-runbook item.

### Operator behavior to verify before Phase 2 lands

One assumption needs empirical confirmation against agent-sandbox v0.4.2:

**Warm-pool default**: `warmpool: undefined` in the claim resolves to the CRD's default of `"default"`. If the CRD default is `"none"`, dropping the explicit `"none"` changes nothing and warm pool stays cold-only.

How to verify: spin up a `SandboxClaim` against v0.4.2 with no `spec.warmpool` field, no `spec.env`, and a populated `SandboxWarmPool`. Assert the pod was claimed from the warm pool (warm-pool replicas decrement, no fresh image pull).

### Tests

- Unit: `buildClaim` produces empty `spec.env`.
- Unit: bootstrap payload round-trips through `buildEnvMap` shape, includes `schemaVersion`.
- Unit: re-bootstrap payload composes `state.token` + `state.ensureOpts`.
- Unit: `provision` partial commit (mesh crashes after tx 1, before tx 2) → next `rehydrate` re-bootstraps successfully.
- Integration: rehydrate with `phase=pending-bootstrap` re-bootstraps.
- Integration: rehydrate with `phase=failed` deletes claim, clears state-store row, recreates, succeeds.
- Integration: legacy claim (no `ensureOpts` on state-store row) returns null from adopt.
- Integration: two mesh replicas race `provision` on the same tenant → exactly one set `bootstrappedAt`, one ends up adopting.

---

## Phase 3 — Drop env-injection path entirely

After Phase 2 has soaked. **Cutover criteria** (must all hold over a contiguous 7-day window):

- ≥ 99.9% of provisions completed with bootstrap `outcome=success`.
- Zero `outcome=validation_error` events.
- `outcome=timeout` ≤ 0.01% of provisions, and every timeout traces to a known mesh-side stall, not a daemon-side bug.
- Zero `outcome=conflict` events that don't trace to a known concurrent-provision race.

Without all five, the env path stays. The PR removing it cites the dashboard.

### Daemon

- `loadConfig` removes the env-driven path; bootstrap is the only entry.
- Env vars retired: `DAEMON_TOKEN`, `CLONE_URL`, `REPO_NAME`, `BRANCH`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, `PACKAGE_MANAGER`, `RUNTIME`, `DEV_PORT`, `APP_ROOT`, `PROXY_PORT`.
- Env vars retained: `DAEMON_BOOT_ID` (production attribution — mesh injects a UUID per-container so `/health.bootId` matches what mesh recorded; dev/test still auto-generates via `entry.ts:31-32`).

### Mesh runner

- `RESERVED_ENV_KEYS` (`runner.ts:110-123`) deleted.
- `buildEnvMap` deleted; payload builder is the only path.

### Helm chart (`deploy/helm/sandbox-env/templates/sandbox-template.yaml`)

The current `env:` block (lines 81-98) gets trimmed.

**Note**: `DAEMON_PORT=9000` and `WORKDIR=/app` in the chart are **already inert today** — daemon reads `PROXY_PORT` (`config.ts:58`) and `APP_ROOT` (`config.ts:63`). They've been dead env vars since `config.ts` was written. Removal is functionally a no-op; just removes confusion. (Note: `housekeeper-sweep.sh:17` defines a shell variable `DAEMON_PORT=9000`, unrelated.)

After cleanup: pod spec carries image + resources + security context + volumes only.

### Helm chart `warmPool`

`warmPool.enabled` default behavior is documented as supported. `warmPool.size` becomes the live tunable.

---

## Phase 4 — Ongoing tenant config push

Once bootstrap lands, the same channel covers post-bootstrap config changes. The `daemonEnv`/`devEnv` split below is decided in Phase 1 (so it's reflected in the bootstrap payload schema) and implemented in Phase 4.

### Two distinct env maps

The daemon maintains two in-memory maps:

- `tenantEnv: Map<string, string>` — passed to dev-process spawn (`autoStartDev`'s child env). Populated from bootstrap `payload.env` and `POST /_decopilot_vm/env`'s `devEnv`.
- `daemonEnv: Map<string, string>` — used by the daemon's own outgoing-HTTP layer (e.g. mesh-issued credentials for talking to mesh APIs). **Never passed to children.** Populated from `POST /_decopilot_vm/env`'s `daemonEnv`. Phase 1's bootstrap schema does not include `daemonEnv`; if Phase 4 surfaces a need to bootstrap it from the start, the schema bumps to `schemaVersion: 2` and adds `payload.daemonEnv`.

Dev-process spawn always computes child env from `tenantEnv` only — `daemonEnv` keys never leak via env, file, or argv.

### `POST /_decopilot_vm/env`

Auth required (now-enforced bearer). Body:
```ts
{
  schemaVersion: 1;
  devEnv?: Record<string, string>;       // merged into tenantEnv
  daemonEnv?: Record<string, string>;    // merged into daemonEnv
}
```

Semantics:
- Merges into the appropriate map under `bootstrapMutex` (env updates and bootstrap calls serialize against each other).
- Persists merged state to `/home/sandbox/.daemon/env.json` via the same atomic write protocol as `bootstrap.json`. File mode `0600`, owner = daemon UID.
- Broadcasts an `env-changed` SSE event listing the union of changed keys (values omitted from the event payload).

### Dev-server reload

Most dev servers (Vite, Next, Astro, etc.) inherit env at process spawn and won't pick up changes from a signal. They have to be respawned.

`POST /_decopilot_vm/restart-dev`:
- Sends SIGTERM to the dev-process tree (`processManager.kill`).
- Waits for exit.
- Calls `autoStartDev` with the merged `tenantEnv`.

This means env-changed = full process restart, not a hot reload. Document on the route handler.

This is what unblocks per-tenant Secret injection without touching the operator: K8s Secrets stay shared/template-level; per-tenant material flows through the daemon.

---

## Risks and what to verify before merging Phase 2

### Bootstrap race vs Sandbox `Ready=True`

`isSandboxReady` (`runner.ts:1546-1551`) reads `status.conditions[Ready=True]` — that's the operator's condition, **not a kubelet readiness probe** (the chart has no `readinessProbe`). The operator's condition can be set before the daemon's HTTP server is bound to `:9000`.

Mitigation: `waitForDaemonHttp` (new, thin) gates between `waitForSandboxReady` and `daemonBootstrap`. Don't conflate it with `waitForDaemonReady` (phase=ready).

### Orchestrator resume semantics

`setup/resume.ts` is just `fs.existsSync(.git)`. `setup/orchestrator.ts:30-115` re-runs idempotently when `.git` already exists. Add a focused test: bootstrap-then-restart-pod-then-rehydrate correctly resumes a half-cloned repo (e.g. clone interrupted between `git clone` and `npm install`).

### Operator default for `warmpool`

See Phase 2's "Operator behavior to verify."

### Dev-server header propagation

Today's `daemon/proxy.ts:19-24` strips `accept-encoding` and `host` but forwards `Authorization` to the user dev server — which would leak the bearer if mesh attached one. Verified: mesh's `proxyDaemonRequest` is only called for `/_decopilot_vm/*` paths (`vm-events.ts:386`, `vm-tools/index.ts:43`); `proxyPreviewRequest` (`runner.ts:551`) doesn't go through it. No leak today, no leak after these phases. Phase 0 adds a defensive `Authorization` strip in `proxy.ts` to close the regression vector if `proxyDaemonRequest` is ever extended to wildcard paths.

### NetworkPolicy regression guard

The trust model leans on NetworkPolicy as the boundary. Code comments rot. Add an integration test in CI:

1. Spin up a Kind cluster with the chart applied.
2. Schedule a non-mesh pod (e.g. `curl` with a non-mesh ServiceAccount) in the sandbox namespace.
3. Assert that pod cannot reach `:9000` on any sandbox pod.

Run on every PR that touches `deploy/helm/sandbox-env/templates/networkpolicy.yaml` or the chart's pod selector labels. The netpol is the *only* thing keeping a non-mesh peer from hijacking the bootstrap window — regression here is a security regression.

### Hardening path

Document in code that NetworkPolicy is the intentional trust boundary for Phase 1, and that future hardening is projected SA token + TokenReview, not a baked secret.

---

## Suggested PR sequence

1. **Phase 0 + Phase 1 bundled** (single daemon image release).
   - Token enforcement on mutating routes.
   - `Authorization` strip in `proxy.ts`.
   - Bootstrap state machine + back-compat env path.
   - Bootstrap mutex + atomic file persistence.
   - Git-config option (c) — per-invocation flag.
   - Daemon image release with warm-pool drain.
2. **Phase 2** — mesh runner switches to bootstrap. NetworkPolicy CI test added. No warm-pool changes yet; just exercise the new path on cold provisions.
3. **Soak window** — watch `bootstrap_outcome` metric. Cutover criteria in Phase 3.
4. **Phase 3** — drop env path, flip warmpool default, document warm pool as supported.
5. **Phase 4** — ongoing config push; payload schema is committed in Phase 1, implementation in Phase 4.

---

## Non-changes worth calling out

- No operator fork. No CRD additions. Stays aligned with `decocms/infra_applications/eks-envs` "vendor v0.4.2 verbatim" stance.
- No sidecars.
- `additionalPodMetadata.labels` keeps doing what it does today (tenant attribution for metrics). `additionalPodMetadata.annotations` is unused as a config channel.
- NetworkPolicy unchanged.
- Freestyle and docker runners unchanged. Freestyle's daemon already enforces bearer auth at `freestyle/runner.ts:230`; docker injects via `-e` flags.

---

## Open questions

1. **Bootstrap response shape**: ~~should it return the full computed `Config`?~~ **Decided**: `{ phase: "bootstrapping" | "ready", bootId: string, hash: string }`. `bootId` lets mesh detect post-recreate identity changes; `hash` lets mesh confirm an idempotent 200 saw the payload it just sent (not a stale identical one from a prior generation).
2. **Bootstrap timeout**: how long does the daemon wait between entering `pending-bootstrap` and giving up? Suggested 5 minutes — beyond that, the pod is wedged and should be recreated. Surface as a daemon config (env, since it's a daemon-process-level concern, not tenant).
3. **`bootstrap_outcome` metric attributes**: `outcome ∈ {success, conflict, validation_error, timeout}`, plus `tenant_org_id`/`tenant_user_id` from `additionalPodMetadata.labels`. Cardinality risk on per-tenant attrs — bounded by active sandboxes, probably fine.
4. **`failed` phase recovery**: ~~Should `failed` accept a re-bootstrap call?~~ **Decided**: no — always pod recreate, driven by mesh's `rehydrate`. Daemon never self-recovers.
5. **`bootstrap.json` schema migration**: ~~Tolerate unknown `schemaVersion`?~~ **Decided**: no — unknown version → `phase = failed`. Old payloads may have different security semantics; not worth the forward-compat tax.
