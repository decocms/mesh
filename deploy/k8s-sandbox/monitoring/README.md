# Mesh sandbox monitoring stack

Per-org / per-sandbox cost-attribution metrics. Pipeline:

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

Pod labels are populated by `AgentSandboxRunner.provision()` from the
`tenant` field on `EnsureOptions` and surface on every sandbox pod via
`SandboxClaim.spec.additionalPodMetadata.labels`.

## Files

| File | What it is |
|---|---|
| `values-kube-prometheus-stack.yaml` | Base values — Prometheus + Grafana + the operator. Prod-safe defaults; no admin credentials, no host scrape configs. |
| `values-otel-collector.yaml` | Base values — OTel collector daemonset that scrapes kubelet → enriches with tenant labels → exposes `/metrics` for Prometheus. |
| `dashboards/sandbox-overview.json` | Grafana dashboard. Loaded via the `grafana_dashboard=1` ConfigMap label sidecar. |

Local kind layers a kind-only overlay on top of these — see
`../local/monitoring/`. Prod layers its own overlay (storage backend, auth,
remote-write, larger resources).

## Prod install

Versions track [`local/up.sh`][up.sh] — bump them together.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo update

# 1. kube-prometheus-stack (Prometheus + Grafana + operator)
helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --version 65.5.1 \
  -f deploy/k8s-sandbox/monitoring/values-kube-prometheus-stack.yaml \
  -f your-prod-overlay.yaml \
  --wait

# 2. OTel collector daemonset
helm upgrade --install otel-collector-sandbox \
  open-telemetry/opentelemetry-collector \
  --namespace monitoring \
  --version 0.108.0 \
  -f deploy/k8s-sandbox/monitoring/values-otel-collector.yaml \
  -f your-prod-overlay.yaml \
  --wait

# 3. Grafana dashboard ConfigMap (sidecar auto-imports it)
kubectl -n monitoring create configmap studio-sandbox-dashboard \
  --from-file=deploy/k8s-sandbox/monitoring/dashboards/sandbox-overview.json \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n monitoring label configmap studio-sandbox-dashboard grafana_dashboard=1 --overwrite
```

## Prod overlay examples

### kube-prometheus-stack

```yaml
# your-prod-overlay.yaml
grafana:
  admin:
    existingSecret: grafana-admin            # provision out of band
    userKey: admin-user
    passwordKey: admin-password
  grafana.ini:
    auth.generic_oauth: { ... }              # SSO

prometheus:
  prometheusSpec:
    retention: 15d                           # bump from base 7d
    resources:
      requests: { cpu: 500m, memory: 2Gi }
      limits:   { memory: 4Gi }
    # Stream long-term storage to Mimir / VictoriaMetrics / Cortex
    remoteWrite:
      - url: https://mimir.internal/api/v1/push
        # ...auth bits
    # In-cluster scrape of the mesh Deployment (replaces the local
    # host.docker.internal scrape).
    additionalScrapeConfigs:
      - job_name: mesh
        kubernetes_sd_configs:
          - role: endpoints
            namespaces: { names: [mesh] }
        relabel_configs:
          - source_labels: [__meta_kubernetes_service_label_app_kubernetes_io_name]
            regex: mesh
            action: keep
```

Or, cleaner: deploy a `ServiceMonitor` alongside the mesh chart and let the
operator pick it up via the
`serviceMonitorSelectorNilUsesHelmValues: false` knob already set in the
base values.

### OTel collector

```yaml
# your-prod-overlay.yaml
config:
  processors:
    k8sattributes:
      filter:
        # Scope label enrichment to the sandbox namespace once you're not
        # also debugging system pods.
        namespaces: [agent-sandbox-system]
```

## Verify

Confirm tenant labels are landing on sandbox pods:

```bash
kubectl get pod -n agent-sandbox-system --show-labels | grep studio.decocms.com
```

Confirm the collector's `/metrics` endpoint is being scraped: in the
Prometheus UI (or whatever queries your remote-write target),

```promql
sum by (org_id, sandbox_handle) (
  rate(container_cpu_usage_seconds_total{namespace="agent-sandbox-system"}[5m])
)
```

should return one series per `(org_id, sandbox_handle)` pair with active
sandboxes.

## Versioning

| Component | Pinned version | Where |
|---|---|---|
| `kube-prometheus-stack` | `65.5.1` | `local/up.sh` `KUBE_PROM_STACK_VERSION` |
| `opentelemetry-collector` | `0.108.0` | `local/up.sh` `OTEL_COLLECTOR_VERSION` |

Bumping these is fine, but verify the dashboard's PromQL queries still work
— kubeletstats metric names occasionally rename across OTel collector
contrib releases.

[up.sh]: ../local/up.sh
