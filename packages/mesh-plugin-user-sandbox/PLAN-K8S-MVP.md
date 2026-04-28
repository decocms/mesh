# K8s Sandbox MVP

Supersedes the k8s sections of `PLAN.md`. Local-kind-first; staging follows
only after the kind loop is green. Narrower scope than PLAN.md, grounded in
the admin reference impl at `deco-cx/admin/clients/agent-sandbox/` and the
existing Docker runner.

## Goal

Ship `KubernetesSandboxRunner` behind `MESH_SANDBOX_RUNNER=kubernetes`. The
validation path is local kind → deco staging → deco prod canary. Docker stays
the dev / self-host runner. Freestyle keeps working until the k8s path is
validated in prod, then gets removed in a follow-up.

## Invariants (must hold across every stage)

1. **One daemon binary, all runners.** `image/daemon.mjs` + `image/daemon/*.mjs`
   is runner-agnostic. It binds `$DAEMON_PORT=9000`, authenticates via
   `DAEMON_TOKEN`, and exposes every runtime surface under `/_daemon/*`. K8s
   reuses the exact image Docker uses. No k8s-specific daemon fork — if we
   need something for k8s, we add it to the daemon and Docker benefits too.

2. **No `kubectl apply` or `kubectl <verb>` from an operator's hands.**
   Cluster state (operator, namespace, template, RBAC, HTTPRoute listener) is
   Helm/Terraform. Per-sandbox state (SandboxClaim, per-claim Service) is K8s
   API calls from mesh code via `@kubernetes/client-node`. `kubectl` may appear
   in CI smoke-test scripts; it does not appear in runbooks.

3. **Ref shape unchanged.** `projectRef = "agent:<orgId>:<virtualMcpId>:<branch>"`;
   composed via `composeSandboxRef()` in `server/runner/sandbox-ref.ts`. K8s
   runner uses this to derive a deterministic claim name.

## Decisions (locked before implementation)

1. **Per-user**, not per-org. `sandbox_runner_state` PK is
   `(user_id, project_ref, runner_kind)`; unchanged from Stage 0.

2. **Per-branch pods**, not git-worktrees. Each `(user, virtualMcp, branch)`
   gets its own claim → its own pod. Matches Docker and Freestyle.

3. **Single shared namespace for MVP**: `agent-sandbox-system`. All
   SandboxClaims + the single shared SandboxTemplate live here. This is the
   agent-sandbox operator's expected topology (claim must be in the same ns
   as its template) and matches `deco-cx/admin/hosting/kubernetes/common/envs/sandboxclaim.ts:29`.
   Tenancy is enforced at the mesh layer: claim names are
   `sha256(userId + ":" + projectRef).slice(0,16)`, unguessable from other
   users.

   **Deferred**: per-org namespaces, NetworkPolicy, ResourceQuota. See
   "Deferred hardening". The single-ns model bets on operator correctness;
   we accept that bet for MVP because admin already runs this way.

4. **No activator** in front of Ingress. Mesh already calls `runner.ensure`
   on every code-initiated request; that IS the activator. K8s also gets
   idle reap for free: `ensure()` refreshes `spec.lifecycle.shutdownTime`
   on every hit, and the operator deletes claims whose deadline has
   passed (see Stage 2.2). Next request after a reap just re-provisions.

5. **emptyDir workdir for MVP.** First-touch cost (clone + install) paid
   per recreate. Measure, then — only then — decide on PVC/EFS/snapshot.
   See "Deferred optimizations".

6. **Ingress via Istio Gateway API** on deco clusters. For local kind,
   preview URLs are served through `kubectl port-forward`, matching admin's
   off-cluster dev pattern at `sandboxclaim.ts:141`. No HTTPRoute locally.

7. **agent-sandbox CRDs**:
   - SandboxClaim: `extensions.agents.x-k8s.io/v1alpha1`, plural `sandboxclaims`.
   - Sandbox: `agents.x-k8s.io/v1alpha1`, plural `sandboxes`.
   - Pod name discovered via annotation `agents.x-k8s.io/pod-name` on the
     Sandbox resource.
   - Readiness: watch Sandbox, look for `status.conditions[?(@.type=="Ready")].status=="True"`.
   - `spec.lifecycle.shutdownPolicy: "Delete"` on claims so idle reap frees storage.

   These match the admin reference at `clients/agent-sandbox/types.ts`. Confirm
   against upstream `v0.4.x` during Stage 1 bring-up and pin in a constants file.

8. **Image registry**: GHCR public (`ghcr.io/<org>/mesh-sandbox:<sha>`).
   Matches the existing deco pattern (`ghcr.io/decocms/mcps/bun`,
   `ghcr.io/deco-cx/deco`) — anonymous pulls, no `imagePullSecret`, no IRSA.
   Self-hosters can pull the same image. **Confirm with infra before Stage 3.**

## Stage 0 — landed

Shipped on `wip/sandbox-no-claude`. Multi-runner interface, Freestyle as a
first-class `SandboxRunner`, k8s purely additive against this seam.

### Interface (`server/runner/types.ts`)

```ts
interface SandboxRunner {
  readonly kind: "docker" | "freestyle";  // widen for k8s

  ensure(id, opts): Promise<Sandbox>;
  exec(handle, input): Promise<ExecOutput>;
  delete(handle): Promise<void>;
  alive(handle): Promise<boolean>;

  getPreviewUrl(handle): Promise<string | null>;
  proxyDaemonRequest(handle, path, init): Promise<Response>;
}
```

`resolveDevPort`/`resolveDaemonPort` are Docker-only. `sweepOrphans` is
Docker-only (mesh process owns `--rm` containers; Freestyle/K8s sandboxes
are independently managed). K8s idle reap is claim-side: `ensure()` bumps
`spec.lifecycle.shutdownTime` on every hit and the operator deletes claims
whose deadline has passed — see Stage 2.

### Identity (`server/runner/sandbox-ref.ts`)

`composeSandboxRef({ orgId, virtualMcpId, branch })` → `agent:<o>:<v>:<b>`.
K8s runner takes this plus `userId` and derives:

```ts
const claimName = `mesh-sb-${sha256(userId + ":" + projectRef).slice(0, 16)}`;
```

### Per-kind dispatch (`apps/mesh/src/sandbox/lifecycle.ts`)

- `getSharedRunner(ctx)`: env-active runner via `resolveRunnerKindFromEnv()`.
- `getRunnerByKind(ctx, kind)`: lazy-creates per-kind singletons. `VM_DELETE`
  uses this so teardown follows the entry's recorded `runnerKind`.
- `asDockerRunner`: narrows for Docker-only ingress.

---

## Stage 1 — local kind iteration

**Objective**: prove the `SandboxClaim → pod → daemon /health → /_daemon/bash
→ /_daemon/dev/start → preview URL` loop end-to-end, against a real k8s API,
before touching any deco infrastructure. All mesh-side k8s code is written
and tested here.

### 1.1 Cluster bring-up (Helm-only, scripted)

`deploy/k8s-sandbox/local/` contains:

- `Taskfile.yml` or `Makefile` with `up` / `down` / `reload-image` targets.
  These targets call `kind`, `helm`, and `kind load docker-image`. They do
  not call `kubectl apply` on any manifest.
- `values-local.yaml` — Helm values for the parent chart, pinning image =
  `mesh-sandbox:local`, `imagePullPolicy: Never`.
- A parent Helm chart (`chart/`) that lists the upstream agent-sandbox
  operator as a dependency (pinned to whatever upstream ships as
  `v0.4.x`) and contributes:
  - Namespace `agent-sandbox-system` (likely created by the upstream chart
    already; dependency).
  - A single `SandboxTemplate` resource matching the mesh sandbox image
    (ports 9000 daemon + 3000 dev, `runAsNonRoot: true`, UID 1000 —
    matches the Dockerfile's `USER sandbox`).

`up` target flow:
1. `kind create cluster --name mesh-sandbox-dev` (idempotent: skip if exists).
2. `docker build -t mesh-sandbox:local packages/mesh-plugin-user-sandbox/image`
   (same image Docker runner uses).
3. `kind load docker-image mesh-sandbox:local --name mesh-sandbox-dev`.
4. `helm upgrade --install mesh-sandbox ./deploy/k8s-sandbox/local/chart
   -f ./deploy/k8s-sandbox/local/values-local.yaml --wait`.

`down` is `kind delete cluster --name mesh-sandbox-dev`. `reload-image` is
step 2 + step 3 + `kubectl rollout restart` (the one exception to rule #2 —
it's a dev ergonomics script, not a runbook step).

### 1.2 agent-sandbox client (port from admin)

`packages/mesh-plugin-user-sandbox/server/runner/kube-client.ts`. Direct port
of `deco-cx/admin/clients/agent-sandbox/kubernetes.ts` and `types.ts`, but:

- Uses `@kubernetes/client-node` (Node) not deno k8s deps.
- Constants file pins `K8S_CONSTANTS` from admin's `types.ts`.
- Exports: `createSandboxClaim`, `deleteSandboxClaim`, `getSandboxClaim`,
  `waitForSandboxReady`. Same signatures, same watch-for-Ready semantics.

This lives in the shared package (not `apps/mesh`) because it has no
heavy SDK — `@kubernetes/client-node` is already a reasonable dep for
sandbox-adjacent code, and keeping it in the package makes the runner
class co-locate with its HTTP client.

### 1.3 `KubernetesSandboxRunner`

**File**: `apps/mesh/src/sandbox/kubernetes-runner.ts`. Same rationale as
`freestyle-runner.ts`: heavy cluster-side state, keeps the shared package
lean. `kind: "kubernetes"`.

**Claim identity**:
```ts
const CLAIM_NAMESPACE = "agent-sandbox-system";
const claimName = `mesh-sb-${sha256(userId + ":" + projectRef).slice(0, 16)}`;
```

**Method mapping**:

- `ensure(id, opts)`:
  1. Look up existing SandboxClaim by name. If `Ready`, rehydrate
     `daemonUrl` from state and short-circuit.
  2. If missing, create the SandboxClaim (references the shared
     `SandboxTemplate`). Wait for `Ready` via `waitForSandboxReady`
     (watch-based, timeout 180s — same as admin).
  3. Read pod IP from the `agents.x-k8s.io/pod-name` annotation.
  4. **Local path**: spawn `kubectl port-forward` on an ephemeral port,
     set `daemonUrl = http://127.0.0.1:<ephemeral>`. Port-forward lifetime
     = runner process lifetime (shutdown hook kills subprocess). Matches
     admin's `deploySandbox` pattern.
  5. **In-cluster path** (Stage 3): `daemonUrl = http://<podIP>:9000`
     directly (mesh replicas live in the same cluster).
  6. Call `probeDaemonHealth(daemonUrl)` (already exists in `daemon-client.ts`).
  7. `bootstrapRepo` via `proxyDaemonRequest` — same code path as Docker.
  8. Persist to `sandbox_runner_state` with `runner_kind="kubernetes"`.
  9. Fire-and-forget `/_daemon/dev/start` — same as Docker.
  10. Return `{ handle: claimName, workdir: "/app", previewUrl: ... }`.

- `exec(handle, input)`: `daemonBash(daemonUrl, token, input)` — identical
  to Docker. The daemon is the daemon.

- `proxyDaemonRequest(handle, path, init)`: `proxyDaemonRequest(daemonUrl,
  token, path, init)` — identical to Docker.

- `delete(handle)`: delete SandboxClaim (operator GCs pod). Remove state row.
  Kill local port-forward if running.

- `alive(handle)`: read Sandbox resource, check Ready condition.

- `getPreviewUrl(handle)`:
  - **Local**: `http://127.0.0.1:<port-forwarded-dev-port>/`. Port-forward
    for 3000 is separate from the daemon port-forward.
  - **In-cluster**: `https://<claimName>.sandboxes.decocms.com/` (Stage 3).

**Daemon token**: the SandboxTemplate's pod spec must include
`DAEMON_TOKEN` as an env var. Two options:
- (a) Hard-code a token per template (all pods share one token — bad, one
  leak compromises every sandbox).
- (b) Template omits the token; operator ignores it; mesh creates a K8s
  Secret per claim (named after the claim), and the template references
  the Secret by a convention like `$(CLAIM_NAME)-token`.

Option (b) is the right answer. Spec'd out in Stage 2.

**What's different from Docker, summarized**:

| Concern | Docker | Kubernetes |
|--|--|--|
| Pod/container create | `docker run` | K8s API: create `SandboxClaim` |
| Daemon URL | `http://127.0.0.1:<host-port>` (published port) | Local: `kubectl port-forward`. Cluster: `http://<podIP>:9000` |
| Repo bootstrap | `proxyDaemonRequest("/_daemon/repo/init")` | **identical** |
| `exec` | `daemonBash(url, token, input)` | **identical** |
| Preview URL | `http://<handle>.sandboxes.localhost:7070/` | Local: port-forward. Cluster: `https://<claim>.sandboxes.decocms.com/` |
| Teardown | `docker stop` | K8s API: delete `SandboxClaim` |
| File copy | `docker cp` (used nowhere in-runner) | N/A — credentials go as pod env at provision, not runtime copy |
| Orphan sweep | mesh boot/shutdown (`--rm` containers) | Operator-side: `spec.lifecycle.shutdownTime` refreshed on each `ensure()`; operator reaps on expiry |

### 1.4 Wire-up (4 file edits)

- `server/runner/types.ts:79` — `readonly kind: "docker" | "freestyle" | "kubernetes"`.
- `server/runner/index.ts:50` — `export type RunnerKind = "docker" | "freestyle" | "kubernetes"`.
- `server/runner/index.ts:91` — `resolveRunnerKindFromEnv()`: accept
  `"kubernetes"` in the explicit-value branch.
- `apps/mesh/src/sandbox/lifecycle.ts:25` — add `case "kubernetes"` that
  dynamic-imports `./kubernetes-runner` and returns
  `new KubernetesSandboxRunner({ stateStore })`.

### 1.5 Tests

- `kube-client.test.ts` — mock `@kubernetes/client-node` (same pattern
  admin uses), verify claim payload shape, Ready watch termination, 404
  handling on delete.
- `kubernetes-runner.test.ts` — mock the kube client, mock daemon
  transport; verify `ensure` short-circuits on Ready claim, creates on
  missing claim, propagates `bootstrapRepo` errors correctly.
- **Integration smoke test** (not in CI by default): `deploy/k8s-sandbox/local/smoke.ts`
  runs against the live kind cluster via `bun test`. Exercises: ensure →
  exec → preview fetch → delete → recreate (cold) → ensure (warm) →
  alive → delete. Blocks Stage 2 landing.

### 1.6 Stage 1 exit criteria

- `bun test packages/mesh-plugin-user-sandbox apps/mesh/src/sandbox` green.
- `deploy/k8s-sandbox/local/smoke.ts` green against kind.
- `MESH_SANDBOX_RUNNER=kubernetes bun run --cwd=apps/mesh dev` boots mesh
  locally, a real `VM_START` call from the studio UI lands a pod in kind
  and the preview iframe renders.
- No existing Docker or Freestyle test regresses.

**Commits on this stage**:
1. `feat(sandbox): add kubernetes client + CRD constants (port from admin)`
2. `feat(sandbox): add KubernetesSandboxRunner behind MESH_SANDBOX_RUNNER=kubernetes`
3. `chore(sandbox): add deploy/k8s-sandbox/local kind bring-up chart`

---

## Stage 2 — hardening (still local-ish; optional pre-staging work)

Only after Stage 1 is green. Each item is independently deferrable.

1. **Per-claim daemon token**: mesh creates a K8s `Secret` named
   `<claimName>-token` with a random token at claim-provision time. The
   SandboxTemplate references it via `envFrom` / `valueFrom.secretKeyRef`.
   Mesh reads the token back into `sandbox_runner_state` after
   `waitForSandboxReady`. Matches the per-container token model Docker
   already has.

2. **Claim-side TTL for idle reap**: every `ensure()` hit patches
   `spec.lifecycle.shutdownTime = now + idleTtlMs` (default 1h). With
   `shutdownPolicy: Delete`, the operator GCs the claim (and pod) once
   wall clock passes the deadline. No mesh-side loop, no cron, no leader
   election — the operator is already reconciling every claim.

   The two drift directions that would have motivated a reconcile loop
   self-heal on next access:
   - State row exists, claim gone → `rehydrate()` gets 404, deletes the
     row, fresh-provisions.
   - Claim exists, no row → `adopt()` either rebuilds a record or deletes
     the orphan and reprovisions.

   Neither case needs a background sweep.

3. **Image-build CI** pushing `ghcr.io/<org>/mesh-sandbox:<sha>` on every
   merge to main. Tag scheme TBD — likely `sha-<short>` + `latest`.

**Commits**: one per item, independently mergeable.

---

## Stage 3 — staging rollout on EKS (`deco-mcp-mesh-stg`)

Deco-cx infrastructure work; mesh code is unchanged from Stage 1/2.

### 3.1 Cluster prereqs (Terraform / Helm; no `kubectl`)

1. **Install agent-sandbox operator** into staging via the same Helm chart
   used locally, parameterized with `values-staging.yaml`.
2. **Namespace**: `agent-sandbox-system` (shared with local). Created by
   the operator's upstream chart.
3. **SandboxTemplate** pointing at `ghcr.io/<org>/mesh-sandbox:<sha>`,
   `imagePullPolicy: IfNotPresent`, resources matching prod shape
   (`requests: {cpu: 250m, memory: 512Mi}`, `limits: {cpu: 2, memory: 4Gi}`),
   securityContext hardened (`runAsNonRoot: true`, drop `ALL`, seccomp
   `RuntimeDefault`, `automountServiceAccountToken: false`).
4. **Ingress**: one new listener on the existing `istio-gateway-api-default`
   Gateway for `*.sandboxes-stg.decocms.com` with a cert from
   `decocms-ca-issuer`. Added to Terraform alongside the existing
   `studio-stg` listener.
5. **Per-claim routing**: mesh creates `Service` (ClusterIP, selector on
   the pod's agent-sandbox label) + `HTTPRoute` (host
   `<claimName>.sandboxes-stg.decocms.com` → Service port 3000) at
   `ensure()` time; deletes them at `delete()` time. These are the only
   runtime-created resources besides the SandboxClaim itself.
6. **Mesh RBAC**: the mesh ServiceAccount gets, via Terraform:
   - `create/get/list/watch/delete` on `sandboxclaims` in `agent-sandbox-system`,
   - `get/list/watch` on `sandboxes` + `pods`,
   - `create/get/update/delete` on `services` + `httproutes` + `secrets`
     in `agent-sandbox-system`.
7. **Dedicated node pool**: karpenter provisioner tainted
   `mesh-sandbox=true:NoSchedule` so user code doesn't land on system
   nodes. Mesh replicas don't tolerate.

### 3.2 Mesh-side changes

- `KubernetesSandboxRunner` gains an in-cluster mode: detects
  `KUBERNETES_SERVICE_HOST` env var, uses in-cluster kubeconfig, skips
  port-forward, sets `daemonUrl = http://<podIP>:9000`. Flag:
  `K8S_RUNNER_MODE=in-cluster|port-forward`; auto-detected by default.
- Per-claim Service + HTTPRoute CRUD added to `ensure`/`delete`.

### 3.3 Validation

1. Flip `deco-mcp-mesh-stg` env to `MESH_SANDBOX_RUNNER=kubernetes`.
2. Run ≥20 real thread spawns across ≥3 different virtualMcp/branch pairs.
3. Exercise: `VM_START`, bash tool first-exec, preview iframe load, dev
   server HMR, `VM_STOP`, idle reap + rehydrate.
4. Compare latencies against Docker baseline. Targets: cold-start within
   2× Docker; warm within 20%. Error-rate parity with Docker or better.

Only then do we pick what (if anything) from the Deferred Optimizations
list lands.

---

## Deferred hardening (only if/when justified by measurement or incident)

- **Per-org namespaces** + `NetworkPolicy` (deny-all default, allow mesh
  + istio ingress) + `ResourceQuota`. Switches tenancy from mesh-claim-name
  hashing to K8s primitives. Requires cloning SandboxTemplate per ns, or a
  template-copying admission controller. Do this when (a) audit team asks,
  or (b) a CVE in the operator lets one pod touch another's.
- **PVC-per-branch**, **EFS shared cache**, **VolumeSnapshot per commit**,
  **warm pod pool**. Each addresses cold-start latency. Pick based on
  Stage 3 measurements.
- **gVisor**. Stronger isolation, measurable `bun install` overhead.
- **Cross-user sandbox sharing inside org**. PK migration + per-exec
  credential injection. Justify by measured multi-user-org cost.

---

## Non-goals for this MVP (explicit)

- Firecracker, Kata, or any microVM runtime.
- PVC / VolumeSnapshot storage model.
- gVisor.
- Per-exec git credential injection (GIT_ASKPASS callback to mesh).
- Warm pool.
- Cross-user sandbox sharing.
- Freestyle removal (happens after k8s prod canary, in its own PR).
- `bunx decocms` local-fallback (separate plan).

---

## Rollout

1. Stage 0 lands on main (done). Docker/Freestyle keep working.
2. Stage 1 lands on main behind `MESH_SANDBOX_RUNNER=kubernetes`. Default
   env stays `docker` everywhere. Kind is devex-only.
3. Stage 2 items land independently as needed for Stage 3.
4. Stage 3 infra applied via Terraform/Helm. Stage 3 runner mode (in-cluster
   detection + HTTPRoute) lands on main.
5. Staging flipped to `kubernetes`. Validate for 2 weeks.
6. Prod canary for a single internal org. Validate for 2 weeks.
7. Default flipped to `kubernetes` for all orgs. Freestyle removed in a
   follow-up PR.

Docker runner stays forever — it's the dev / self-host path.
