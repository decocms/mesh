#!/usr/bin/env bash
# Tear down the local kind cluster. Nothing outside kind is touched.
#
# `MONITORING_ONLY=1 ./down.sh` removes just the helm-installed monitoring
# stack — useful for iterating on values files without rebuilding the
# cluster + operator. Re-run up.sh to reinstall.
set -euo pipefail

CLUSTER_NAME="studio-sandbox-dev"
KCTX="kind-${CLUSTER_NAME}"

log() { printf "\033[1;34m[down]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[down]\033[0m %s\n" "$*" >&2; }

for cmd in kind kubectl; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    err "${cmd} not found on PATH — see README.md prereqs"
    exit 1
  fi
done

if [[ "${MONITORING_ONLY:-0}" == "1" ]]; then
  if ! command -v helm >/dev/null 2>&1; then
    err "MONITORING_ONLY=1 requires helm; not found on PATH"
    exit 1
  fi
  if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
    log "cluster ${CLUSTER_NAME} not found, nothing to remove"
    exit 0
  fi
  log "uninstalling monitoring stack only"
  helm uninstall otel-collector-sandbox --namespace monitoring --kube-context "${KCTX}" >/dev/null 2>&1 || true
  helm uninstall kube-prometheus-stack --namespace monitoring --kube-context "${KCTX}" >/dev/null 2>&1 || true
  kubectl --context "${KCTX}" delete namespace monitoring --ignore-not-found
  exit 0
fi

if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  log "deleting kind cluster ${CLUSTER_NAME}"
  kind delete cluster --name "${CLUSTER_NAME}"
else
  log "cluster ${CLUSTER_NAME} not found, nothing to do"
fi
