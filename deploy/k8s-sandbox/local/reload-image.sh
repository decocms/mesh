#!/usr/bin/env bash
# Rebuild the sandbox image, reload it into kind, and evict any running
# sandbox pods so the operator recreates them against the new binary.
#
# The SandboxTemplate itself isn't re-applied here — for template changes
# re-run up.sh. This script is strictly for iterating on image contents.
set -euo pipefail

CLUSTER_NAME="studio-sandbox-dev"
IMAGE_TAG="mesh-sandbox:local"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SANDBOX_PKG="${REPO_ROOT}/packages/sandbox"
DOCKERFILE="${SANDBOX_PKG}/image/Dockerfile"
KCTX="kind-${CLUSTER_NAME}"

log() { printf "\033[1;34m[reload]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[reload]\033[0m %s\n" "$*" >&2; }

for cmd in kind kubectl docker bun; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    err "${cmd} not found on PATH — see README.md prereqs"
    exit 1
  fi
done

if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  err "cluster ${CLUSTER_NAME} does not exist — run ./up.sh first"
  exit 1
fi

log "rebuilding daemon bundle"
bun run --cwd "${SANDBOX_PKG}" build

log "rebuilding ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" -f "${DOCKERFILE}" "${SANDBOX_PKG}"

log "reloading ${IMAGE_TAG} into kind"
kind load docker-image "${IMAGE_TAG}" --name "${CLUSTER_NAME}"

# No Deployment to roll — sandbox pods are owned by Sandbox resources (owned
# by SandboxClaims). Deleting the pods lets the operator recreate them with
# the freshly loaded image while leaving claims intact.
log "evicting running sandbox pods"
kubectl --context "${KCTX}" delete pod \
  -n agent-sandbox-system \
  -l app.kubernetes.io/name=studio-sandbox \
  --ignore-not-found

log "done"
