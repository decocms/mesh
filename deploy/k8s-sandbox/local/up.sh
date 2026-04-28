#!/usr/bin/env bash
# Bring up the local kind cluster used by AgentSandboxRunner.
#
# Idempotent: re-running re-applies the operator + template and reloads the
# sandbox image. Cluster creation is skipped if studio-sandbox-dev already
# exists.
#
# Pins agent-sandbox to v0.4.2 (matches prod in
# decocms/infra_applications/provisioning/agent-sandbox-operator/eks-envs/).
# Bumping here means bumping prod too.
set -euo pipefail

CLUSTER_NAME="studio-sandbox-dev"
OPERATOR_VERSION="v0.4.2"
IMAGE_TAG="mesh-sandbox:local"

# Monitoring stack pins. Bumping these is fine but verify the dashboard
# queries still work (kubeletstats metric names occasionally rename across
# OTel collector contrib releases).
KUBE_PROM_STACK_VERSION="65.5.1"
OTEL_COLLECTOR_VERSION="0.108.0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SANDBOX_PKG="${REPO_ROOT}/packages/sandbox"
DOCKERFILE="${SANDBOX_PKG}/image/Dockerfile"
# Shared (prod-safe) monitoring values live one level up; this script layers
# the kind-only overlay in local/monitoring/ on top.
MONITORING_DIR="${SCRIPT_DIR}/../monitoring"

MANIFEST_URL="https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${OPERATOR_VERSION}/manifest.yaml"
EXTENSIONS_URL="https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${OPERATOR_VERSION}/extensions.yaml"

log() { printf "\033[1;34m[up]\033[0m %s\n" "$*"; }

# 1. kind cluster
if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  log "cluster ${CLUSTER_NAME} already exists, skipping create"
else
  log "creating kind cluster ${CLUSTER_NAME}"
  kind create cluster --name "${CLUSTER_NAME}"
fi

# kubectl commands target kind's context explicitly so an ambient KUBECONFIG
# pointing at a real cluster can't accidentally install the operator there.
KCTX="kind-${CLUSTER_NAME}"

# 2. agent-sandbox operator (creates namespace + CRDs + controller deployment)
log "applying agent-sandbox ${OPERATOR_VERSION} base manifest"
kubectl --context "${KCTX}" apply -f "${MANIFEST_URL}"

# 3. agent-sandbox extensions CRDs (SandboxClaim, SandboxTemplate, …)
log "applying agent-sandbox ${OPERATOR_VERSION} extensions"
kubectl --context "${KCTX}" apply -f "${EXTENSIONS_URL}"

# 4. wait for controller(s) to be Available before applying our template
log "waiting for agent-sandbox controller(s) to become Available"
kubectl --context "${KCTX}" wait \
  --for=condition=Available deployment \
  -n agent-sandbox-system --all --timeout=180s

# 5. build the sandbox image (same Dockerfile the Docker runner uses).
# The Dockerfile copies `daemon/dist/daemon.js` from the build context, so
# the daemon bundle has to be produced first and the build context has to
# be the sandbox package root (not image/).
log "building daemon bundle"
bun run --cwd "${SANDBOX_PKG}" build

log "building ${IMAGE_TAG} from ${SANDBOX_PKG}"
docker build -t "${IMAGE_TAG}" -f "${DOCKERFILE}" "${SANDBOX_PKG}"

# 6. load into kind so imagePullPolicy: Never resolves
log "loading ${IMAGE_TAG} into kind cluster ${CLUSTER_NAME}"
kind load docker-image "${IMAGE_TAG}" --name "${CLUSTER_NAME}"

# 7. mesh SandboxTemplate (shared by every SandboxClaim)
log "applying SandboxTemplate"
kubectl --context "${KCTX}" apply -f "${SCRIPT_DIR}/sandbox-template.yaml"

# 8. monitoring stack: kube-prometheus-stack (Prom + Grafana + the operator
# whose CRDs the OTel collector's ServiceMonitor depends on) followed by
# the OTel daemonset that scrapes kubelet → enriches with tenant labels →
# exposes /metrics for Prometheus to scrape.
#
# Helm enters the local stack only for these third-party charts; SandboxTemplate
# and operator stay raw kubectl. Skip via `MONITORING=0 ./up.sh` if you want
# the cluster without dashboards.
if [[ "${MONITORING:-1}" == "1" ]]; then
  if ! command -v helm >/dev/null 2>&1; then
    log "helm not installed; skipping monitoring stack (set MONITORING=0 to silence)"
  else
    log "adding helm repos"
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
    helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts >/dev/null 2>&1 || true
    helm repo update >/dev/null

    log "installing kube-prometheus-stack ${KUBE_PROM_STACK_VERSION}"
    helm upgrade --install kube-prometheus-stack \
      prometheus-community/kube-prometheus-stack \
      --kube-context "${KCTX}" \
      --namespace monitoring --create-namespace \
      --version "${KUBE_PROM_STACK_VERSION}" \
      -f "${MONITORING_DIR}/values-kube-prometheus-stack.yaml" \
      -f "${SCRIPT_DIR}/monitoring/values-kube-prometheus-stack.local.yaml" \
      --wait --timeout 5m

    log "installing opentelemetry-collector ${OTEL_COLLECTOR_VERSION} (daemonset)"
    helm upgrade --install otel-collector-sandbox \
      open-telemetry/opentelemetry-collector \
      --kube-context "${KCTX}" \
      --namespace monitoring \
      --version "${OTEL_COLLECTOR_VERSION}" \
      -f "${MONITORING_DIR}/values-otel-collector.yaml" \
      -f "${SCRIPT_DIR}/monitoring/values-otel-collector.local.yaml" \
      --wait --timeout 3m

    log "applying sandbox dashboard ConfigMap"
    # `--dry-run | apply` so re-runs replace the ConfigMap idempotently.
    kubectl --context "${KCTX}" -n monitoring create configmap studio-sandbox-dashboard \
      --from-file="${MONITORING_DIR}/dashboards/sandbox-overview.json" \
      --dry-run=client -o yaml | \
      kubectl --context "${KCTX}" apply -f -
    kubectl --context "${KCTX}" -n monitoring label configmap studio-sandbox-dashboard \
      grafana_dashboard=1 --overwrite >/dev/null

    log "monitoring ready: kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3001:80"
    log "  → http://localhost:3001 (admin / admin) → Dashboards → 'Studio Sandbox Overview'"
  fi
fi

log "ready. smoke test: see README.md"
