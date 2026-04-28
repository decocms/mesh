# Local k8s sandbox (kind)

Scripted local bring-up for `AgentSandboxRunner`. One-command cluster +
agent-sandbox chart install (operator + CRDs + `SandboxTemplate` + RBAC +
NetworkPolicy), loaded with the same sandbox image the Docker runner uses.

This is **dev ergonomics only** — no Terraform. Prod/staging consumes the
agent-sandbox Helm chart published to `oci://ghcr.io/decocms/studio/charts/agent-sandbox`,
typically as a separate ArgoCD Application. Locally, `up.sh` installs from
the in-tree chart at `deploy/helm/agent-sandbox/` so chart edits are
testable without publishing.

The monitoring stack (kube-prometheus-stack + OTel collector daemonset +
sandbox dashboard) is deployed from values shared with prod — base values
live in [`../monitoring/`](../monitoring/), and `up.sh` layers the
kind-only overlay in [`monitoring/`](monitoring/) on top. See
[`../monitoring/README.md`](../monitoring/README.md) for the prod install.

## Prereqs

- [`docker`](https://docs.docker.com/engine/install/) — running
- [`kind`](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/)
- [`helm`](https://helm.sh/docs/intro/install/) — required (chart install
  + monitoring stack)

Pins:
- agent-sandbox operator: `v0.4.2` (chart `appVersion`; bumped via
  `deploy/helm/agent-sandbox/vendor.sh`)
- kube-prometheus-stack: `65.5.1`
- opentelemetry-collector: `0.108.0`
- cluster name: `studio-sandbox-dev`
- namespace: `agent-sandbox-system` (sandboxes), `monitoring` (Prom/Grafana/OTel)
- image tag: `studio-sandbox:local`

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
2. Builds the daemon bundle (`bun run --cwd packages/sandbox build`), then
   `packages/sandbox/image/Dockerfile` as `studio-sandbox:local`
3. Loads the image into kind (required because the template pins
   `imagePullPolicy: Never`)
4. `helm upgrade --install agent-sandbox deploy/helm/agent-sandbox/ -f
   deploy/helm/agent-sandbox/examples/values-kind.yaml` — installs
   namespace + CRDs + operator + RBAC + SandboxTemplate + NetworkPolicy
5. Installs `kube-prometheus-stack` (Prom + Grafana + the operator that
   discovers `ServiceMonitor`s) and the OTel Collector daemonset that
   scrapes per-node kubelet, enriches with tenant labels, and exposes
   `/metrics` for Prometheus. Skip with `MONITORING=0 ./up.sh`.

All `kubectl` calls pass `--context kind-studio-sandbox-dev` so an ambient
`KUBECONFIG` can't accidentally hit a real cluster.

## Local Grafana

After `up.sh`:

```bash
kubectl --context kind-studio-sandbox-dev port-forward \
  -n monitoring svc/kube-prometheus-stack-grafana 3001:80
# → http://localhost:3001  (admin / admin)
# → Dashboards → "Studio Sandbox Overview"
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
                        │      studio.decocms.com/{org-id,user-id,sandbox-handle,role}
                        │      → series labels: org_id, user_id, sandbox_handle, sandbox_role)
                        │  - prometheus exporter on :8889
                        ▼
                   PodMonitor → kube-prometheus-stack Prometheus → Grafana
```

Pod labels come from `SandboxClaim.spec.additionalPodMetadata.labels`,
populated in `AgentSandboxRunner.provision()` from the `tenant` field
on `EnsureOptions`. Verify they're landing:

```bash
kubectl --context kind-studio-sandbox-dev \
  get pod -n agent-sandbox-system --show-labels | grep studio.decocms.com
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

End-to-end smoke test for `AgentSandboxRunner` against the live kind cluster:
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
CTX=kind-studio-sandbox-dev
TOKEN="smoke-$(openssl rand -hex 16)"

cat <<EOF | kubectl --context "$CTX" apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: smoke-test
  namespace: agent-sandbox-system
spec:
  sandboxTemplateRef:
    name: studio-sandbox
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
  every pod recreate. That's a deliberate MVP choice — persistent
  workdir is a future hardening pass.
- Preview URLs are not ingress-terminated locally; the runner uses
  `PortForward` against the dev port (3000) when the runtime asks for one.
