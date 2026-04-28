#!/usr/bin/env bash
# Tear down the local kind cluster. Nothing outside kind is touched.
set -euo pipefail

CLUSTER_NAME="mesh-sandbox-dev"

log() { printf "\033[1;34m[down]\033[0m %s\n" "$*"; }

if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  log "deleting kind cluster ${CLUSTER_NAME}"
  kind delete cluster --name "${CLUSTER_NAME}"
else
  log "cluster ${CLUSTER_NAME} not found, nothing to do"
fi
