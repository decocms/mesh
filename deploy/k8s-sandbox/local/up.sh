#!/usr/bin/env bash
# Bring up the local kind cluster used by KubernetesSandboxRunner.
#
# Idempotent: re-running re-applies the operator + template and reloads the
# sandbox image. Cluster creation is skipped if mesh-sandbox-dev already
# exists.
#
# Pins agent-sandbox to v0.4.2 (matches prod in
# decocms/infra_applications/provisioning/agent-sandbox-operator/eks-envs/).
# Bumping here means bumping prod too.
set -euo pipefail

CLUSTER_NAME="mesh-sandbox-dev"
OPERATOR_VERSION="v0.4.2"
IMAGE_TAG="mesh-sandbox:local"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SANDBOX_PKG="${REPO_ROOT}/packages/sandbox"
DOCKERFILE="${SANDBOX_PKG}/image/Dockerfile"

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

log "ready. smoke test: see README.md"
