#!/usr/bin/env bash
# Rebuild the sandbox image, reload it into kind, and evict any running
# sandbox pods so the operator recreates them against the new binary.
#
# The SandboxTemplate itself isn't re-applied here — for template changes
# re-run up.sh. This script is strictly for iterating on image contents.
set -euo pipefail

CLUSTER_NAME="mesh-sandbox-dev"
IMAGE_TAG="mesh-sandbox:local"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
IMAGE_CONTEXT="${REPO_ROOT}/packages/mesh-plugin-user-sandbox/image"
KCTX="kind-${CLUSTER_NAME}"

log() { printf "\033[1;34m[reload]\033[0m %s\n" "$*"; }

if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  echo "cluster ${CLUSTER_NAME} does not exist — run ./up.sh first" >&2
  exit 1
fi

log "rebuilding ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" "${IMAGE_CONTEXT}"

log "reloading ${IMAGE_TAG} into kind"
kind load docker-image "${IMAGE_TAG}" --name "${CLUSTER_NAME}"

# No Deployment to roll — sandbox pods are owned by Sandbox resources (owned
# by SandboxClaims). Deleting the pods lets the operator recreate them with
# the freshly loaded image while leaving claims intact.
log "evicting running sandbox pods"
kubectl --context "${KCTX}" delete pod \
  -n agent-sandbox-system \
  -l app.kubernetes.io/name=mesh-sandbox \
  --ignore-not-found

log "done"
