#!/usr/bin/env bash
# Bring up the local kind cluster used by AgentSandboxRunner.
#
# Idempotent: re-running re-installs the agent-sandbox chart and reloads the
# sandbox image. Cluster creation is skipped if studio-sandbox-dev already
# exists.
#
# What this installs:
#   - kind cluster `studio-sandbox-dev`
#   - agent-sandbox Helm chart (deploy/helm/agent-sandbox/) → operator,
#     CRDs, SandboxTemplate, RBAC, NetworkPolicy in `agent-sandbox-system`
#   - (optional) kube-prometheus-stack + OTel collector when MONITORING=1
#
# What this does NOT install:
#   - the studio chart itself. The script ends with a kind cluster that an
#     external mesh process (or a separately-installed chart-deco-studio)
#     can talk to.
#
# Pins agent-sandbox chart appVersion to v0.4.2 (matches prod in
# decocms/infra_applications/provisioning/agent-sandbox-operator/eks-envs/).
# Bumping here means bumping prod too.
set -euo pipefail

CLUSTER_NAME="studio-sandbox-dev"
IMAGE_TAG="studio-sandbox:local"

# Monitoring stack pins. Bumping these is fine but verify the dashboard
# queries still work (kubeletstats metric names occasionally rename across
# OTel collector contrib releases).
KUBE_PROM_STACK_VERSION="65.5.1"
OTEL_COLLECTOR_VERSION="0.108.0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SANDBOX_PKG="${REPO_ROOT}/packages/sandbox"
DOCKERFILE="${SANDBOX_PKG}/image/Dockerfile"
AGENT_SANDBOX_CHART="${REPO_ROOT}/deploy/helm/agent-sandbox"
AGENT_SANDBOX_VALUES="${AGENT_SANDBOX_CHART}/examples/values-kind.yaml"
# Shared (prod-safe) monitoring values live one level up; this script layers
# the kind-only overlay in local/monitoring/ on top.
MONITORING_DIR="${SCRIPT_DIR}/../monitoring"

log() { printf "\033[1;34m[up]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[up]\033[0m %s\n" "$*" >&2; }

# Required tools.
for cmd in kind kubectl docker bun helm; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    err "${cmd} not found on PATH — see README.md prereqs"
    exit 1
  fi
done

# Track whether *we* created the cluster on this invocation. If so and the
# rest of bring-up fails, we tear it down so re-runs aren't fighting a
# half-installed cluster. Pre-existing clusters are left alone.
CREATED_CLUSTER=0
on_failure() {
  if [[ ${CREATED_CLUSTER} -eq 1 ]]; then
    err "bring-up failed — deleting partial cluster ${CLUSTER_NAME}"
    kind delete cluster --name "${CLUSTER_NAME}" >/dev/null 2>&1 || true
  else
    err "bring-up failed — leaving pre-existing cluster ${CLUSTER_NAME} intact"
  fi
}
trap on_failure ERR

# 1. kind cluster
if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  log "cluster ${CLUSTER_NAME} already exists, skipping create"
else
  log "creating kind cluster ${CLUSTER_NAME}"
  kind create cluster --name "${CLUSTER_NAME}"
  CREATED_CLUSTER=1
fi

# kubectl/helm commands target kind's context explicitly so an ambient
# KUBECONFIG pointing at a real cluster can't accidentally install the
# operator there.
KCTX="kind-${CLUSTER_NAME}"

# 2. build the sandbox image (same Dockerfile the Docker runner uses).
# The Dockerfile copies `daemon/dist/daemon.js` from the build context, so
# the daemon bundle has to be produced first and the build context has to
# be the sandbox package root (not image/).
log "building daemon bundle"
bun run --cwd "${SANDBOX_PKG}" build

log "building ${IMAGE_TAG} from ${SANDBOX_PKG}"
docker build -t "${IMAGE_TAG}" -f "${DOCKERFILE}" "${SANDBOX_PKG}"

# 3. load into kind so imagePullPolicy: Never resolves
log "loading ${IMAGE_TAG} into kind cluster ${CLUSTER_NAME}"
kind load docker-image "${IMAGE_TAG}" --name "${CLUSTER_NAME}"

# 4. install the agent-sandbox chart. CRDs ship under chart `crds/` and
# Helm install-applies them on first run; subsequent upgrades require a
# manual `kubectl apply` of crds/agent-sandbox-crds.yaml (Helm CRD lifecycle
# is install-only). For local dev that's typically not an issue — re-run
# down.sh + up.sh to reset.
log "installing agent-sandbox chart"
helm upgrade --install agent-sandbox "${AGENT_SANDBOX_CHART}" \
  --kube-context "${KCTX}" \
  --namespace agent-sandbox-system --create-namespace \
  -f "${AGENT_SANDBOX_VALUES}" \
  --wait --timeout 3m

# 5. monitoring stack: kube-prometheus-stack (Prom + Grafana + the operator
# whose CRDs the OTel collector's ServiceMonitor depends on) followed by
# the OTel daemonset that scrapes kubelet → enriches with tenant labels →
# exposes /metrics for Prometheus to scrape.
#
# Skip via `MONITORING=0 ./up.sh` if you want the cluster without dashboards.
if [[ "${MONITORING:-1}" == "1" ]]; then
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

# Bring-up succeeded — drop the failure trap so a non-zero exit from any
# follow-up command (none expected today) doesn't tear down the cluster.
trap - ERR

log "ready. smoke test: see README.md"
