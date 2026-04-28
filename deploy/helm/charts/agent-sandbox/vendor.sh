#!/usr/bin/env bash
# Re-vendor kubernetes-sigs/agent-sandbox release assets into this subchart.
#
# Upstream ships raw multi-doc YAML (manifest.yaml + extensions.yaml), not a
# Helm chart. We split by kind: CustomResourceDefinition docs land in crds/,
# everything else in templates/ so Helm treats CRDs with its install-only
# lifecycle (see README.md for the upgrade caveat).
#
# Usage: ./vendor.sh [vX.Y.Z]   (default v0.4.2 — must match appVersion)
set -euo pipefail

UPSTREAM_VERSION="${1:-v0.4.2}"
REPO="kubernetes-sigs/agent-sandbox"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRDS_FILE="${SCRIPT_DIR}/crds/agent-sandbox-crds.yaml"
TMPL_FILE="${SCRIPT_DIR}/templates/agent-sandbox-manifest.yaml"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

log() { printf "\033[1;34m[vendor]\033[0m %s\n" "$*"; }

log "fetching ${REPO}@${UPSTREAM_VERSION}"
curl -fsSLo "${WORK}/manifest.yaml" \
  "https://github.com/${REPO}/releases/download/${UPSTREAM_VERSION}/manifest.yaml"
curl -fsSLo "${WORK}/extensions.yaml" \
  "https://github.com/${REPO}/releases/download/${UPSTREAM_VERSION}/extensions.yaml"

# Split each multi-doc YAML by `---` boundaries, classify each doc by kind.
# awk is portable (no yq dependency) and good enough for manifests that only
# need a kind: line scanned.
split_docs() {
  local src="$1" crds_out="$2" other_out="$3"
  awk -v crds="${crds_out}" -v other="${other_out}" '
    function flush(   isCrd, i, out) {
      if (n == 0) return
      isCrd = 0
      for (i = 1; i <= n; i++) {
        if (buf[i] ~ /^kind:[[:space:]]*CustomResourceDefinition[[:space:]]*$/) {
          isCrd = 1
          break
        }
      }
      out = isCrd ? crds : other
      for (i = 1; i <= n; i++) print buf[i] >> out
      print "---" >> out
      n = 0
    }
    /^---[[:space:]]*$/ { flush(); next }
    { buf[++n] = $0 }
    END { flush() }
  ' "${src}"
}

log "splitting CRDs from non-CRDs"
: > "${WORK}/crds.yaml"
: > "${WORK}/other.yaml"
split_docs "${WORK}/manifest.yaml"   "${WORK}/crds.yaml" "${WORK}/other.yaml"
split_docs "${WORK}/extensions.yaml" "${WORK}/crds.yaml" "${WORK}/other.yaml"

# Strip trailing empty doc separator so `helm template` doesn't warn.
sed -i.bak -e '$d' "${WORK}/crds.yaml"  && rm "${WORK}/crds.yaml.bak"
sed -i.bak -e '$d' "${WORK}/other.yaml" && rm "${WORK}/other.yaml.bak"

mkdir -p "$(dirname "${CRDS_FILE}")" "$(dirname "${TMPL_FILE}")"

HEADER_CRDS="# Vendored from ${REPO} ${UPSTREAM_VERSION} via vendor.sh.
# Do not edit by hand — re-run vendor.sh to refresh.
# Contains: CustomResourceDefinition docs only.
"

HEADER_TMPL="# Vendored from ${REPO} ${UPSTREAM_VERSION} via vendor.sh.
# Do not edit by hand — re-run vendor.sh to refresh.
# Contains: controller Deployments, RBAC, Namespace, Service, ServiceAccount.
"

printf "%s" "${HEADER_CRDS}" > "${CRDS_FILE}"
cat "${WORK}/crds.yaml" >> "${CRDS_FILE}"

printf "%s" "${HEADER_TMPL}" > "${TMPL_FILE}"
cat "${WORK}/other.yaml" >> "${TMPL_FILE}"

log "wrote $(wc -l <"${CRDS_FILE}") lines -> ${CRDS_FILE}"
log "wrote $(wc -l <"${TMPL_FILE}") lines -> ${TMPL_FILE}"
log "done. Remember to update appVersion in Chart.yaml if the version changed."
