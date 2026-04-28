# Local k8s sandbox (kind)

Scripted local bring-up for `KubernetesSandboxRunner`. One-command cluster +
agent-sandbox operator + mesh `SandboxTemplate`, loaded with the same
sandbox image the Docker runner uses.

This is **dev ergonomics only** — no Terraform. Prod/staging installs the
operator via the deco infrastructure repo, not these scripts. Helm is used
for upstream third-party stacks (Prometheus, Grafana, OpenTelemetry
Collector) since that's their canonical install path; mesh-owned manifests
(SandboxTemplate, agent-sandbox operator) stay raw `kubectl apply`.

The monitoring stack (kube-prometheus-stack + OTel collector daemonset +
sandbox dashboard) is deployed from values shared with prod — base values
live in [`../monitoring/`](../monitoring/), and `up.sh` layers the
kind-only overlay in [`monitoring/`](monitoring/) on top. See
[`../monitoring/README.md`](../monitoring/README.md) for the prod install.

## Prereqs

- [`docker`](https://docs.docker.com/engine/install/) — running
- [`kind`](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/)
- [`helm`](https://helm.sh/docs/intro/install/) — required only for the
  monitoring stack; skip with `MONITORING=0 ./up.sh` if not installed.

Pins:
- agent-sandbox operator: `v0.4.2` (matches prod; hardcoded in `up.sh`)
- kube-prometheus-stack: `65.5.1`
- opentelemetry-collector: `0.108.0`
- cluster name: `mesh-sandbox-dev`
- namespace: `agent-sandbox-system` (sandboxes), `monitoring` (Prom/Grafana/OTel)
- image tag: `mesh-sandbox:local`

## Usage

```bash
# bring everything up (idempotent)
./deploy/k8s-sandbox/local/up.sh

# rebuild + reload the sandbox image after editing image/
./deploy/k8s-sandbox/local/reload-image.sh

# tear the cluster down
./deploy/k8s-sandbox/local/down.sh
```

`up.sh` does, in order:

1. Creates the kind cluster (skipped if it exists)
2. Applies the agent-sandbox `v0.4.2` base manifest (namespace, CRDs, controller)
3. Applies the agent-sandbox `v0.4.2` extensions manifest (SandboxClaim, SandboxTemplate, …)
4. Waits for controller deployments to report `Available`
5. Builds the daemon bundle (`bun run --cwd packages/sandbox build`), then `packages/sandbox/image/Dockerfile` as `mesh-sandbox:local`
6. Loads the image into kind (required because the template pins `imagePullPolicy: Never`)
7. Applies `sandbox-template.yaml`
8. Installs `kube-prometheus-stack` (Prom + Grafana + the operator that
   discovers `ServiceMonitor`s) and the OTel Collector daemonset that
   scrapes per-node kubelet, enriches with tenant labels, and exposes
   `/metrics` for Prometheus. Skip with `MONITORING=0 ./up.sh`.

All `kubectl` calls pass `--context kind-mesh-sandbox-dev` so an ambient
`KUBECONFIG` can't accidentally hit a real cluster.

## Local Grafana

After `up.sh`:

```bash
kubectl --context kind-mesh-sandbox-dev port-forward \
  -n monitoring svc/kube-prometheus-stack-grafana 3001:80
# → http://localhost:3001  (admin / admin)
# → Dashboards → "Mesh Sandbox Overview"
```

Dashboard panels (per-org, per-sandbox-handle):

- Active sandboxes by org
- Egress rate by org
- CPU / memory by org
- Top 10 sandboxes by 1-hour egress
- Warm-pool overhead pod count (no owning org)

The pipeline:

```
kubelet (cAdvisor) ──► OTel collector daemonset
                        │  - kubeletstats receiver
                        │  - k8sattributes processor (reads pod labels:
                        │      mesh.decocms.com/{org-id,user-id,sandbox-handle,role}
                        │      → series labels: org_id, user_id, sandbox_handle, sandbox_role)
                        │  - prometheus exporter on :8889
                        ▼
                   PodMonitor → kube-prometheus-stack Prometheus → Grafana
```

Pod labels come from `SandboxClaim.spec.additionalPodMetadata.labels`,
populated in `KubernetesSandboxRunner.provision()` from the `tenant` field
on `EnsureOptions`. Verify they're landing:

```bash
kubectl --context kind-mesh-sandbox-dev \
  get pod -n agent-sandbox-system --show-labels | grep mesh.decocms.com
```

To iterate on dashboards/values without rebuilding the cluster:

```bash
MONITORING_ONLY=1 ./deploy/k8s-sandbox/local/down.sh
./deploy/k8s-sandbox/local/up.sh
```

### Production install

The same base values + dashboard ship to prod from this repo. See
[`../monitoring/README.md`](../monitoring/README.md) for the install
commands and the prod-overlay examples (remote-write, SSO, scoped
k8sattributes filter, ServiceMonitor for the in-cluster mesh Deployment).

## Smoke test

Stage 1 exit criterion from PLAN-K8S-MVP.md. Exercises
`KubernetesSandboxRunner` end-to-end against the live kind cluster:
ensure → exec → preview fetch → delete → recreate → ensure (warm) →
alive → delete.

```bash
bun run deploy/k8s-sandbox/local/smoke.ts
```

Exits 0 on success. Uses a unique sandbox id per invocation and cleans up
after itself, so repeated runs don't collide. Not in `bun test` — the
runner needs a real cluster and ~5s of pod lifecycle.

### Manual health check

If you want to test the template/daemon layer without the runner. Since
Stage 2.1 dropped the shared token from the template, the claim itself
has to carry one — any string works, just keep it consistent with the
curl call below.

```bash
CTX=kind-mesh-sandbox-dev
TOKEN="smoke-$(openssl rand -hex 16)"

cat <<EOF | kubectl --context "$CTX" apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: smoke-test
  namespace: agent-sandbox-system
spec:
  sandboxTemplateRef:
    name: mesh-sandbox
  env:
    - name: DAEMON_TOKEN
      value: "${TOKEN}"
  lifecycle:
    shutdownPolicy: Delete
EOF

kubectl --context "$CTX" wait \
  --for=jsonpath='{.status.conditions[?(@.type=="Ready")].status}'=True \
  -n agent-sandbox-system sandbox/smoke-test --timeout=180s

kubectl --context "$CTX" port-forward \
  -n agent-sandbox-system sandbox/smoke-test 9000:9000 &
PF_PID=$!
sleep 1

curl -sS -H "Authorization: Bearer ${TOKEN}" \
  http://127.0.0.1:9000/_daemon/health

kill $PF_PID
kubectl --context "$CTX" delete sandboxclaim/smoke-test -n agent-sandbox-system
```

## Notes

- `DAEMON_TOKEN` is injected per-claim as of Stage 2.1. The template
  doesn't carry a shared default; the runner generates a random token
  per claim and puts it in `SandboxClaim.spec.env`.
- `emptyDir` workdir means first-touch cost (clone + install) is paid on
  every pod recreate. That's deliberate for the MVP — see PLAN-K8S-MVP.md.
- Preview URLs are not ingress-terminated locally; the runner uses
  `PortForward` against the dev port (3000) when the runtime asks for one.
