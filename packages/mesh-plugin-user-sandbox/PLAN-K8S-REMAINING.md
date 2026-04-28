# K8s Sandbox — Remaining Work

Supersedes `PLAN-K8S-MVP.md` for forward planning. The MVP plan's Stage 0
and most of Stage 1 have landed; this plan reflects what's actually left
plus the gaps the MVP plan hand-waved.

Upstream baseline: `kubernetes-sigs/agent-sandbox v0.4.2` (pinned in
`deploy/k8s-sandbox/local/up.sh`). API groups:
`agents.x-k8s.io/v1alpha1` (Sandbox, SandboxWarmPool) and
`extensions.agents.x-k8s.io/v1alpha1` (SandboxClaim, SandboxTemplate).

## What's already landed

From `PLAN-K8S-MVP.md` Stages 0–1 and partial Stage 2:

- `SandboxRunner` interface with kind widened to `"docker" | "freestyle" | "kubernetes"`.
- `server/runner/k8s/` — `runner.ts` (812 lines), `client.ts` + tests (924 lines),
  `constants.ts` pinned to v1alpha1.
- `deploy/k8s-sandbox/local/` — `up.sh` / `down.sh` / `reload-image.sh`,
  `sandbox-template.yaml`, `smoke.ts` exit criterion.
- Per-claim `DAEMON_TOKEN` via `SandboxClaim.spec.env` (no shared token in
  the template).
- Claim-side idle reap via `spec.lifecycle.shutdownTime` refreshed on
  every `ensure()`; operator GCs on expiry.
- `MESH_SANDBOX_RUNNER=kubernetes` dispatch wired through
  `apps/mesh/src/sandbox/lifecycle.ts`.

Everything below is what the MVP plan punted on, misspec'd, or genuinely
needs to happen before staging/prod.

---

## Stage 2 — blockers for staging rollout

Each item is independently mergeable. All of these must land before
Stage 3; none are optional.

### 2.1 NetworkPolicy — P0, not "deferred hardening"

**Rationale.** The workload is arbitrary user code. Without egress
restriction a sandbox pod can reach:

- IMDSv2 at `169.254.169.254` — on EKS, the node's IAM role is a
  cluster-takeover primitive.
- In-cluster services in other namespaces — mesh's Postgres, NATS, any
  internal admin surface.
- Kubelet, metrics server, CoreDNS (beyond the DNS we want it to use).

The MVP plan calls this "deferred … do this when audit asks." That was
wrong. Ship this with Stage 3, not after an incident.

**Shape.**

- One `NetworkPolicy` in `agent-sandbox-system` selecting pods labeled
  `app.kubernetes.io/name: mesh-sandbox`:
  - Ingress: allow from mesh replica pods (label selector) on port 9000
    (daemon), and from the Istio gateway namespace on port 3000 (dev
    server).
  - Egress: deny-all, then allow:
    - DNS to CoreDNS (`kube-system`, UDP/TCP 53).
    - Public internet on 443/80 (for `bun install`, git clones, etc.)
      — but block RFC1918 + `169.254.0.0/16` + `fd00::/8` + `fe80::/10`.
      Expressed as `to: - ipBlock: 0.0.0.0/0, except: [169.254.0.0/16,
      10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10]`.
    - Mesh API for daemon callbacks (by label, port 8000) — **only if**
      we keep any callback channel. If daemon is pure pull, skip.
- Verify IMDS block with a smoke test: exec `curl -s --max-time 2
  http://169.254.169.254/latest/meta-data/iam/security-credentials/`
  from inside a sandbox and assert non-zero exit.

**Not sufficient alone.** Also set `hostNetwork: false` (default),
`dnsPolicy: ClusterFirst`, and on EKS enforce IMDSv2 hop-limit=1 at the
node level so even an egress miss can't land creds. The hop-limit
change is infra-repo work; note it on the Terraform PR.

### 2.2 Credentials flow to the sandbox — P0

The MVP plan has one table cell: "credentials go as pod env at
provision, not runtime copy." That's not a design. Docker runner passes
git tokens and project env at container create; k8s must do the
equivalent and the plan doesn't say how.

**Decision.** Per-claim Secret, referenced by the claim's `spec.env`
via `valueFrom.secretKeyRef`. Not injected into the template (template
is shared; secrets are per-sandbox).

**Open question: the SandboxClaim CRD.** As of v0.4.2 the claim's
`spec.env` accepts literal `{name, value}` only — see
`deploy/k8s-sandbox/local/sandbox-template.yaml` and the README note.
That's why `DAEMON_TOKEN` ships as plaintext in the claim today. For
git tokens that's not acceptable.

Two paths:

1. **Template-side `envFrom: secretRef`** with a predictable name like
   `<claimName>-creds`. Mesh creates the Secret before creating the
   claim. Needs template support for parameterized secret names — check
   v0.4.2 CRD schema; may need a template-per-tenant-class or an
   upstream patch.
2. **Operator-side env-merge from Secret** via an annotation on the
   claim like `mesh.decocms.com/creds-secret: <name>`, read by a tiny
   mesh-side mutating webhook that rewrites the pod spec. Heavier; only
   if path (1) isn't achievable.

Path (1) first. If upstream CRD blocks it, open an issue and fall back
to the plaintext-in-claim model for tokens scoped tight enough that
leakage is survivable (short-lived GitHub installation tokens, not PATs).

**OwnerReferences.** The per-claim Secret's `ownerReferences` point at
the SandboxClaim. When the operator reaps the claim on `shutdownTime`,
the Secret is GC'd automatically. Same pattern applies to every
auxiliary resource mesh creates (see 2.4).

### 2.3 Concurrent `ensure()` across mesh replicas — P0

Two replicas hit `ensure()` for the same `(user, projectRef)`
simultaneously; both GET → 404 → POST → one 201, one 409. Current
runner.ts doesn't handle this (grepped: no 409 retry).

**Fix.** In `createSandboxClaim`, catch `StatusError` with `code === 409`,
re-GET the claim, and proceed as if we'd seen it on the first GET.
Idempotent by construction because the claim name is deterministic
(`mesh-sb-<16-hex>`).

Applies the same way to the per-claim Secret (2.2), Service, and
HTTPRoute (2.4).

### 2.4 HTTPRoute + per-claim Service GC — P0 (for Stage 3)

Stage 3 creates per-claim `Service` + `HTTPRoute` on `ensure()` and
deletes on `runner.delete()`. But `runner.delete()` is not the only
teardown path: the operator reaps the claim on idle expiry without
touching the Service/HTTPRoute. Orphan accumulation over days.

**Fix.** Set `ownerReferences` on the Service and HTTPRoute pointing at
the SandboxClaim. K8s GC chains: claim deleted → Service + HTTPRoute
deleted. Mesh's `delete()` becomes "delete the claim; everything else
follows."

Verify with a smoke test that creates → waits for idle reap (set
`idleTtlMs` to 30s for the test) → asserts Service/HTTPRoute are gone.

Upstream is aware per-claim Services are a scale issue — the project
README mentions "exploration of efficient traffic routing without
per-sandbox Services." Track it; migrate when upstream ships.

### 2.5 Pod-ready vs daemon-ready — P0

The Sandbox CR's `Ready` condition means scheduler + kubelet probes
green. The daemon binds 9000 a few seconds later. Runner must gate on
`probeDaemonHealth` after `waitForSandboxReady`, with its own timeout
and retry.

Grep `runner.ts` for the current gating — if there's no
`probeDaemonHealth` call between Ready and first proxy, add it with a
30s budget and exponential backoff (200ms → 2s). Classify a timeout
here as distinct from a claim-never-ready failure so we can alert
differently.

### 2.6 Observability — P0 for staging debug

When `waitForSandboxReady` times out in Stage 3, the only signals today
are the claim's status conditions. That's not enough to triage
("ImagePullBackOff"? "Insufficient CPU"? "Init container crash"?).

**Must expose:**

1. Events API read on timeout: `kubectl get events --field-selector
   involvedObject.name=<claim>,involvedObject.kind=Sandbox`, last 10,
   included in the error surface.
2. Pod logs fallback: if the daemon itself never comes up, mesh should
   be able to fetch `pods/log` for the sandbox pod and include the last
   N lines in the failure response. RBAC needs `get` on `pods/log`
   (Stage 3.1 addition).
3. Runner-emitted OTEL spans for `ensure`, `waitForSandboxReady`,
   `probeDaemonHealth`, `delete`. Labels: `runner_kind=kubernetes`,
   `claim_name`, `namespace`. Flows into the existing mesh tracer.

Upstream-exposed operator metrics per
`agent-sandbox.sigs.k8s.io/docs/sandbox/metrics/` are currently
client-side SDK metrics only; no operator Prometheus endpoint
documented. Don't depend on them.

### 2.7 Multi-arch image build CI — P0 for staging

Local builds on M-series laptops produce arm64; EKS node pools are
typically amd64. Shipping to GHCR needs `docker buildx build --platform
linux/amd64,linux/arm64 --push`.

**Shape.** GitHub Actions workflow on push to main:

- Path filter: `packages/mesh-plugin-user-sandbox/image/**`.
- `docker/setup-qemu-action` + `docker/setup-buildx-action`.
- Push `ghcr.io/decocms/mesh-sandbox:sha-<short>` and `:latest`.
- Sign with cosign keyless (sigstore/cosign-installer) — the
  SandboxTemplate's image reference can stay unsigned for MVP; signing
  unlocks future `verify-image` admission.

Coordinate the tag bump in infra repo's `values-staging.yaml` on each
rollout — do **not** use `:latest` in staging.

### 2.8 Preview URL authorization — P0 decision, P1 implementation

Today's plan: `<claim>.sandboxes-stg.decocms.com` → HTTPRoute →
ClusterIP Service → pod:3000. No auth. Anyone with the hostname hits
the dev server. Hostname is unguessable (16-char hash of
`userId:projectRef`), but that's secrecy-through-obscurity — anyone
the user shares the preview with also shares with the world
indefinitely.

**Decision for MVP.** Accept unguessable-hostname as the only gate for
*staging*. Document it. Preview URLs are for the sandbox owner's own
iframe inside mesh; users don't share them externally.

**Before prod canary.** Terminate previews on an auth proxy (mesh's
own gateway, or Istio AuthorizationPolicy with JWT from mesh session
cookie). Scope: only the session that owns the sandbox, or session
members of the same org. This is the right boundary for a multi-tenant
product.

Track the upgrade as its own doc under `apps/mesh/src/sandbox/` before
prod flip.

### 2.9 `emptyDir` sizeLimit — P1

A `dd if=/dev/zero of=/tmp/fill` fills the node's ephemeral storage
and evicts neighbors. Set `sizeLimit: 10Gi` (or tuned) on any emptyDir
volume in the template. Currently the template doesn't mount emptyDir
on `/app` (image's own writable layer is used, ephemeral to pod), but
if that changes — set the limit.

Also set `ephemeral-storage` requests + limits on the container itself
so scheduler places it sensibly. Default ephemeral on most EKS AMIs is
the root volume; an unbounded sandbox can starve kubelet.

### 2.11 OSS Helm packaging — P0 for self-hosters

**Rationale.** Per `feedback_no_freestyle_mesh_must_be_oss`, both runners
stay first-class and OSS self-hosters need a viable k8s path. Today
`deploy/helm/Chart.yaml` (`chart-deco-studio` v0.6.2) has NATS + OTEL
collector as dependencies but no k8s sandbox components. A self-hoster
choosing `MESH_SANDBOX_RUNNER=kubernetes` has to install agent-sandbox
operator + SandboxTemplate + NetworkPolicy by hand.

**Upstream constraint.** `kubernetes-sigs/agent-sandbox` v0.4.2 does NOT
publish a Helm chart. Release assets are `manifest.yaml` and
`extensions.yaml` only. So we can't list it under `dependencies:` in
`Chart.yaml` pointing at an upstream Helm repo.

**Decision.** Local subchart at `deploy/helm/charts/agent-sandbox/`,
vendored from the upstream release YAML pinned to v0.4.2. Parent
chart references it with `repository: "file://./charts/agent-sandbox"`
and `condition: sandbox.kubernetes.enabled` so non-k8s self-hosters
aren't forced to install it.

**Parent chart additions:**

- `templates/sandbox-template.yaml` — prod-ceiling `SandboxTemplate`
  (mirrors `deploy/k8s-sandbox/local/sandbox-template.yaml` with
  configurable image ref, resources, securityContext).
- `templates/sandbox-network-policy.yaml` — the policy from 2.1,
  templated with `{{ .Release.Namespace }}`.
- `templates/sandbox-warm-pool.yaml` — `SandboxWarmPool` skeleton
  (disabled by default via `sandbox.kubernetes.warmPool.enabled`); one
  value knob to set pool size. Ships disabled; self-hosters who hit
  cold-start pain can flip it.
- `values.yaml` additions under a new `sandbox.kubernetes` key:
  ```yaml
  sandbox:
    kubernetes:
      enabled: false
      image:
        repository: ghcr.io/decocms/mesh-sandbox
        tag: latest
        pullPolicy: IfNotPresent
      resources:
        requests: { cpu: 500m, memory: 1Gi }
        limits: { cpu: 2, memory: 4Gi, ephemeral-storage: 10Gi }
      networkPolicy:
        enabled: true
      warmPool:
        enabled: false
        size: 0
  ```

**Version bumps.** When upstream releases vNext, a maintainer runs a
small script (`deploy/helm/charts/agent-sandbox/vendor.sh`) that
fetches the new release assets and overwrites the vendored YAML. Ship
the script; automation is future work.

**Upstream contribution path.** Getting a proper Helm chart into
`kubernetes-sigs/agent-sandbox` upstream would delete our subchart
eventually. Open an issue linking to our subchart as prior art; not
blocking.

### 2.10 Template upgrade path — P1

When we publish `mesh-sandbox:sha-<new>` and update the
SandboxTemplate, existing claims keep the old image until they idle-
reap and get re-provisioned. That's acceptable for daemon-only
changes; it's *not* acceptable for security patches.

**Mechanism for forced roll.** Mesh-side admin tool that lists all
claims in `agent-sandbox-system`, deletes each one; operator reaps;
next `ensure()` from the user re-creates against the new template.
Wired as a mesh tool gated on admin role, not a scheduled job. Users
lose their unsaved state — acceptable cost, rare event.

**Note on the Docker runner.** Same problem, same answer: bump image,
next `docker run` picks it up. No new surface.

---

## Stage 3 — staging rollout

After every Stage 2 item is merged. Cluster is `deco-mcp-mesh-stg`
(EKS).

### 3.1 Infra work (Terraform + Helm, in infra repo)

All items here live in `decocms/infra_applications/provisioning/` or
similar — none ship from this repo.

1. **Operator install.** Helm, pinned to v0.4.2 (match local).
   Parent chart includes the upstream operator as a dependency;
   upstream ships `manifest.yaml` + `extensions.yaml` so the parent
   chart may just wrap kubectl-apply via a Job, or we vendor the YAML.
   Verify whether v0.4.x publishes a proper Helm chart — if not, file
   upstream and either wrap or vendor for now.
2. **Namespace.** `agent-sandbox-system`. Created by the operator
   manifest.
3. **SandboxTemplate.** Ported from `deploy/k8s-sandbox/local/
   sandbox-template.yaml` with prod ceilings:
   - `resources.requests: {cpu: 500m, memory: 1Gi}`.
   - `resources.limits: {cpu: 2, memory: 4Gi, ephemeral-storage: 10Gi}`.
   - `imagePullPolicy: IfNotPresent`.
   - Image: `ghcr.io/decocms/mesh-sandbox:<sha>` (Stage 2.7 pipeline).
   - `automountServiceAccountToken: false` — already set locally.
   - `securityContext` — already hardened locally; mirror.
4. **Gateway listener.** One new listener on the existing
   `istio-gateway-api-default` Gateway for
   `*.sandboxes-stg.decocms.com` with a cert from `decocms-ca-issuer`.
   Wildcard DNS record (`*.sandboxes-stg.decocms.com → ALB/NLB`) in
   the same Terraform module.
5. **Mesh ServiceAccount RBAC.** One Role + RoleBinding in
   `agent-sandbox-system`:
   - `sandboxclaims` (`extensions.agents.x-k8s.io`):
     `create/get/list/watch/delete/patch`.
   - `sandboxes` + `pods` + `pods/log` + `events`:
     `get/list/watch`.
   - `services`: `create/get/update/delete`.
   - `httproutes` (`gateway.networking.k8s.io`):
     `create/get/update/delete`.
   - `secrets`: `create/get/update/delete` (per-claim creds — 2.2).
6. **NetworkPolicy.** Applied via Helm from 2.1.
7. **Karpenter provisioner.** Tainted `mesh-sandbox=true:NoSchedule`.
   Add matching toleration + `nodeSelector` on the **SandboxTemplate
   pod spec** (not mesh pods). User code lands only on that pool.
8. **EKS node hop-limit=1** for IMDSv2 (2.1).

### 3.2 Mesh-side changes

- `KubernetesSandboxRunner` detects `KUBERNETES_SERVICE_HOST` and
  switches to in-cluster kubeconfig: skip port-forward; `daemonUrl =
  http://<podIP>:9000`. Env override: `K8S_RUNNER_MODE=in-cluster|
  port-forward` (auto by default).
- Per-claim Service + HTTPRoute create on `ensure()`, with
  `ownerReferences` → SandboxClaim (Stage 2.4).
- Events + pod-logs fallback on `waitForSandboxReady` timeout
  (Stage 2.6).

### 3.3 Validation

Flip `deco-mcp-mesh-stg` to `MESH_SANDBOX_RUNNER=kubernetes`, then:

1. Internal smoke: ≥20 real thread spawns across ≥3 virtualMcp/branch
   pairs.
2. Exercise every path — `VM_START`, bash tool first-exec, preview
   iframe, HMR, `VM_STOP`, idle reap + rehydrate, Service+HTTPRoute
   cleanup after reap.
3. Latency vs Docker baseline: cold ≤ 2×, warm ≤ 1.2×. Error rate
   ≤ Docker.
4. Chaos: kill a random sandbox pod mid-request; verify next
   `ensure()` reprovisions. Delete a mesh replica holding a
   port-forward (if any leaked); verify no dangling forwards.
5. Soak: 2 weeks without intervention before prod canary.

---

## Stage 4 — prod canary + Freestyle removal

1. Enable `kubernetes` for one internal org in prod. Same infra shape
   as staging.
2. Soak 2 weeks with real traffic.
3. Flip default `MESH_SANDBOX_RUNNER=kubernetes` for all orgs.
4. Freestyle runner removal happens in its own PR after the flip. Per
   the `feedback_no_freestyle_mesh_must_be_oss` memory, freestyle stays
   a supported option for self-hosters even post-flip. What "removal"
   means in practice: drop freestyle as an available runner on
   deco-hosted staging/prod; leave the code and
   `MESH_SANDBOX_RUNNER=freestyle` path working for self-hosters.
   Revisit with the user before any code deletion.

---

## Stage 5 — state migration for existing rows

After the default flip in Stage 4.3, existing `sandbox_runner_state`
rows have `runner_kind IN ("docker", "freestyle")`. Current dispatch
uses the recorded kind for `VM_DELETE` — so old sandboxes keep going
to their old runner forever unless we migrate.

**Options:**

1. **Let them drain.** Old rows age out via idle TTL; new `ensure()`
   calls create new rows against `kubernetes`. Simple; leaves
   long-lived freestyle sandboxes alive for some users indefinitely.
2. **Force-migrate.** On `ensure()`, if the recorded `runner_kind`
   differs from the env-active kind and the row belongs to a
   deco-hosted org, delete the old sandbox (via its recorded runner)
   and re-provision on kubernetes. Users lose in-flight state.
3. **Hybrid.** Drain by default; offer a "move to k8s" tool for users
   who want it; hard-migrate after N days.

Recommend (3). Write it as an admin tool + scheduled drain, not a
synchronous check on every ensure (that would add a round trip to
every request).

---

## Explicit non-goals for this plan

- **Snapshots.** Upstream requires gVisor on GKE Autopilot
  (`agent-sandbox.sigs.k8s.io/docs/sandbox/snapshots/`). We're on EKS.
  Either migrate the sandbox pool to GKE (huge scope) or build our own
  CSI-VolumeSnapshot + restore flow. Not in the critical path. Measure
  cold-start pain in Stage 3 before taking this on.
- **SandboxWarmPool.** Upstream CRD exists. Useful if Stage 3 cold-
  start is the dominant latency. Defer until measurement.
- **Per-org namespaces + ResourceQuota.** Still deferred, but the
  rationale is different from the MVP plan: NetworkPolicy (2.1) covers
  the tenancy boundary that matters. Quotas become relevant when one
  user's `for i in {1..10000}; do ensure; done` starts hurting the
  cluster — which isn't a tenancy break, it's rate-limiting. Handle at
  the mesh layer (per-user concurrent sandbox cap) before it's a K8s
  problem.
- **gVisor for sandbox isolation.** Different concern from snapshots.
  Worth it on a shared node pool; less critical with dedicated pool +
  NetworkPolicy. Re-evaluate after Stage 3.
- **Cross-user sandbox sharing.** Needs PK migration + per-exec
  credential injection; already scoped out in the memory
  (`project_thread_sandbox_ref`).

---

## Open questions (need answers before Stage 3 PR)

1. **CRD support for `envFrom: secretRef` in SandboxClaim spec.**
   Confirm against v0.4.2 schema. If missing, Stage 2.2 path (1) needs
   upstream work; fall back to (2) or patch upstream.
2. **Operator Helm chart vs raw manifests.** Does v0.4.x ship a Helm
   chart? If not, decide: vendor YAML, or wrap `kubectl apply` in a
   Helm post-install Job.
3. **Preview URL auth before prod.** Istio AuthorizationPolicy with
   JWT from mesh session, vs a dedicated auth proxy pod per sandbox,
   vs mesh-side reverse proxy. Infra preference?
4. **GHCR org.** `ghcr.io/decocms/mesh-sandbox` vs `ghcr.io/deco-cx/
   mesh-sandbox`. Today's pinned image name in the template is
   `mesh-sandbox:local` — prod registry name TBD with infra.

---

## Rollout sequence

1. Stage 2.1–2.10 land on main, each as its own PR. Default env stays
   `docker` everywhere.
2. Infra PR (Stage 3.1) lands in decocms/infra_applications.
3. Mesh Stage 3.2 lands on main behind the existing env flag.
4. Staging flipped to `kubernetes`. 2-week soak.
5. Prod canary (Stage 4.1) for one internal org. 2-week soak.
6. Default flipped (Stage 4.3). Migration tool (Stage 5) lands in
   parallel.
7. Freestyle removal from deco-hosted — follow-up PR, revisit with
   user first.

Docker stays forever — dev + self-host path.
