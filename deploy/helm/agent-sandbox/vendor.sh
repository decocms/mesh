#!/usr/bin/env bash
# Re-vendor kubernetes-sigs/agent-sandbox release assets into this subchart.
#
# Upstream ships raw multi-doc YAML (manifest.yaml + extensions.yaml), not a
# Helm chart. We split by kind: CustomResourceDefinition docs land in crds/,
# everything else in templates/ so Helm treats CRDs with its install-only
# lifecycle (see README.md for the upgrade caveat).
#
# Integrity: every supported upstream version is paired with a sha256 in
# KNOWN_CHECKSUMS below. The script refuses to write outputs unless every
# downloaded asset matches its pinned digest — this is the only line of
# defense against a swapped GitHub release asset (compromised maintainer
# account, credential theft, etc.). To bump:
#   1. Run: ./vendor.sh vX.Y.Z   — it will fail with "no pinned checksum"
#   2. Compute sha256: shasum -a 256 manifest.yaml extensions.yaml
#   3. Verify the values out-of-band (release notes, signatures if any).
#   4. Add the entry to KNOWN_CHECKSUMS, commit, re-run.
#
# Usage: ./vendor.sh [vX.Y.Z]   (default v0.4.2 — must match appVersion)
set -euo pipefail

UPSTREAM_VERSION="${1:-v0.4.2}"
REPO="kubernetes-sigs/agent-sandbox"

# Pinned sha256 digests for `${VERSION}:${ASSET}`. Keep entries sorted by
# version. Verify externally before adding a new row — anything past this
# table is implicitly trusted.
declare -A KNOWN_CHECKSUMS=(
  ["v0.4.2:manifest.yaml"]="93cb43a90b9093c84a7529a7dbeca409fcd944746df00b52e8a2781c237c6e18"
  ["v0.4.2:extensions.yaml"]="6ddcd6ce2d78714a5815d4c4304df858a075e0ed8fee971966b31af548c011bb"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRDS_FILE="${SCRIPT_DIR}/crds/agent-sandbox-crds.yaml"
TMPL_FILE="${SCRIPT_DIR}/templates/agent-sandbox-manifest.yaml"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

log() { printf "\033[1;34m[vendor]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[vendor]\033[0m %s\n" "$*" >&2; }

# Refuse to overwrite locally-modified outputs without warning. The vendor
# script regenerates files in-place; an in-progress local edit would be
# silently obliterated.
if ! git -C "${SCRIPT_DIR}" diff --quiet -- crds templates 2>/dev/null \
   || ! git -C "${SCRIPT_DIR}" diff --cached --quiet -- crds templates 2>/dev/null; then
  err "uncommitted changes under crds/ or templates/ — commit or stash before re-vendoring"
  exit 1
fi

verify_checksum() {
  local file="$1" expected="$2" actual
  actual="$(shasum -a 256 "${file}" | awk '{print $1}')"
  if [ "${actual}" != "${expected}" ]; then
    err "checksum mismatch for $(basename "${file}")"
    err "  expected: ${expected}"
    err "  actual:   ${actual}"
    err "  the upstream release asset has changed since this checksum was pinned;"
    err "  verify the new digest out-of-band before updating KNOWN_CHECKSUMS"
    exit 1
  fi
}

require_checksum() {
  local key="$1"
  if [ -z "${KNOWN_CHECKSUMS[$key]:-}" ]; then
    err "no pinned checksum for ${key}"
    err "  to bump: download the asset manually, compute shasum -a 256, verify"
    err "  against upstream release notes, then add a row to KNOWN_CHECKSUMS"
    exit 1
  fi
  printf "%s" "${KNOWN_CHECKSUMS[$key]}"
}

log "fetching ${REPO}@${UPSTREAM_VERSION}"
MANIFEST_SHA="$(require_checksum "${UPSTREAM_VERSION}:manifest.yaml")"
EXTENSIONS_SHA="$(require_checksum "${UPSTREAM_VERSION}:extensions.yaml")"

curl -fsSLo "${WORK}/manifest.yaml" \
  "https://github.com/${REPO}/releases/download/${UPSTREAM_VERSION}/manifest.yaml"
curl -fsSLo "${WORK}/extensions.yaml" \
  "https://github.com/${REPO}/releases/download/${UPSTREAM_VERSION}/extensions.yaml"

verify_checksum "${WORK}/manifest.yaml"   "${MANIFEST_SHA}"
verify_checksum "${WORK}/extensions.yaml" "${EXTENSIONS_SHA}"
log "checksums verified"

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
log "done. Remember to:"
log "  - update appVersion in Chart.yaml if the version changed"
log "  - bump KNOWN_CHECKSUMS in this script when bumping ${UPSTREAM_VERSION}"
log "  - bump version in Chart.yaml so .github/workflows/release-agent-sandbox-chart.yaml"
log "    publishes a new OCI artifact"
log "  - DO NOT track agent-sandbox-*.tgz in git (it's gitignored — the"
log "    unpacked tree is the source of truth; the published ghcr.io OCI"
log "    artifact is the consumer-facing build)"
