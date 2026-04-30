#!/bin/sh
# sandbox-housekeeper sweep — one CronJob run.
#
# Env (set by the CronJob spec):
#   NS, TTL_MS, STUCK_TTL_MS, PROBE_TIMEOUT_SEC,
#   CLAIM_SELECTOR, POD_SELECTOR, RUN_ID.

set -eu

: "${NS:?must be set}"
: "${TTL_MS:?must be set}"
: "${STUCK_TTL_MS:?must be set}"
: "${PROBE_TIMEOUT_SEC:?must be set}"
: "${CLAIM_SELECTOR:?must be set}"
: "${POD_SELECTOR:?must be set}"
: "${RUN_ID:?must be set}"

PROBE_FAIL_ANNOT="studio.decocms.com/probe-fail-since"
PROBE_FAIL_DETAIL_ANNOT="studio.decocms.com/probe-fail-detail"
DAEMON_PORT=9000
IDLE_PATH="/_decopilot_vm/idle"

now_iso()   { date -u +%Y-%m-%dT%H:%M:%SZ; }
now_micro() { date -u +%Y-%m-%dT%H:%M:%S.000000Z; }
now_secs()  { date -u +%s; }

log() {
  printf '[%s] [housekeeper] run=%s %s\n' "$(now_iso)" "$RUN_ID" "$*"
}

# JSONPath escapes dots in keys with a backslash.
jsonpath_for_annotation() {
  printf '%s' "$1" | sed 's/\./\\./g'
}

# Best-effort — a misconfigured Event API shouldn't block the reap.
# events.k8s.io/v1 is the current API; the legacy v1 Events API is
# deprecated. `kubectl get events` and `kubectl describe sandboxclaim`
# aggregate from both, so consumers see these unchanged.
emit_event() {
  claim="$1"; reason="$2"; action="$3"; msg="$4"
  ts=$(now_micro)
  kubectl create -f - <<YAML >/dev/null 2>&1 || true
apiVersion: events.k8s.io/v1
kind: Event
metadata:
  generateName: ${claim}-housekeeper-
  namespace: ${NS}
eventTime: ${ts}
type: Normal
reason: ${reason}
action: ${action}
note: ${msg}
reportingController: sandbox-housekeeper
reportingInstance: ${RUN_ID}
regarding:
  apiVersion: extensions.agents.x-k8s.io/v1alpha1
  kind: SandboxClaim
  name: ${claim}
  namespace: ${NS}
YAML
}

# Probe /_decopilot_vm/idle. Echoes one of:
#   <digits>          idleMs (success)
#   __unreachable__   connect/timeout
#   __not_found__     HTTP 404
#   __server_error__  HTTP 5xx
#   __bad_shape__     HTTP 200 but no parseable idleMs
probe_daemon() {
  ip="$1"
  body=$(mktemp)
  if ! code=$(curl -s -o "$body" \
                --max-time "$PROBE_TIMEOUT_SEC" \
                --retry 1 --retry-all-errors --retry-delay 1 \
                -w '%{http_code}' \
                "http://${ip}:${DAEMON_PORT}${IDLE_PATH}" 2>/dev/null); then
    rm -f "$body"
    echo "__unreachable__"
    return
  fi
  case "$code" in
    2*)
      idle=$(sed -n 's/.*"idleMs"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$body")
      rm -f "$body"
      case "$idle" in
        ''|*[!0-9]*) echo "__bad_shape__" ;;
        *)           echo "$idle" ;;
      esac
      ;;
    404) rm -f "$body"; echo "__not_found__" ;;
    5*)  rm -f "$body"; echo "__server_error__" ;;
    *)   rm -f "$body"; echo "__bad_shape__" ;;
  esac
}

# Echoes the failure-since marker as epoch seconds. Stored as a plain
# integer (not ISO) so age math is bulletproof — no busybox `date -d`
# parsing path that could silently fall back and reset the clock. Humans
# can decode with `date -d @<epoch>`.
#
# Preserves the existing stamp on repeats so consecutive-failure age
# accumulates across sweeps. If a previous-version sweep wrote an ISO
# string, the non-numeric value is rewritten as a fresh failure (resets
# the clock once during upgrade — conservative).
mark_probe_failure() {
  claim="$1"; detail="$2"
  jp=$(jsonpath_for_annotation "$PROBE_FAIL_ANNOT")
  existing=$(kubectl get sandboxclaim "$claim" -n "$NS" \
    -o jsonpath="{.metadata.annotations.${jp}}" 2>/dev/null || true)
  case "$existing" in
    ''|*[!0-9]*)
      secs=$(now_secs)
      kubectl annotate sandboxclaim "$claim" -n "$NS" --overwrite \
        "${PROBE_FAIL_ANNOT}=${secs}" \
        "${PROBE_FAIL_DETAIL_ANNOT}=${detail}" >/dev/null 2>&1 || true
      echo "$secs"
      ;;
    *)
      echo "$existing"
      ;;
  esac
}

clear_probe_failure() {
  claim="$1"
  kubectl annotate sandboxclaim "$claim" -n "$NS" \
    "${PROBE_FAIL_ANNOT}-" \
    "${PROBE_FAIL_DETAIL_ANNOT}-" >/dev/null 2>&1 || true
}

# Shared prelude for both reap paths.
mark_for_reap() {
  claim="$1"; reason="$2"; detail="$3"; action="$4"
  kubectl annotate sandboxclaim "$claim" -n "$NS" --overwrite \
    "studio.decocms.com/reap-reason=${reason}" \
    "studio.decocms.com/reap-detail=${detail}" \
    "studio.decocms.com/reap-at=$(now_iso)" \
    "studio.decocms.com/reap-run=${RUN_ID}" >/dev/null 2>&1 || true
  emit_event "$claim" "SandboxReaped" "$action" "housekeeper: $reason ($detail)"
  # Delete HTTPRoute first so traffic stops resolving to the pod before
  # SIGTERM lands — avoids 502s during the drain window.
  kubectl delete httproute -n "$NS" \
    -l "studio.decocms.com/sandbox-handle=${claim}" \
    --ignore-not-found >/dev/null 2>&1 || true
}

# Graceful path: operator drains the pod via shutdownTime. Used for Idle
# and StuckReady where the operator is still functional.
request_shutdown() {
  claim="$1"; reason="$2"; detail="$3"
  log "shutdown claim=$claim reason=$reason detail=\"$detail\""
  mark_for_reap "$claim" "$reason" "$detail" "Shutdown"
  ts=$(now_iso)
  kubectl patch sandboxclaim "$claim" -n "$NS" --type=merge \
    -p "{\"spec\":{\"lifecycle\":{\"shutdownPolicy\":\"Delete\",\"shutdownTime\":\"${ts}\"}}}" \
    >/dev/null 2>&1 || true
}

# ReconcilerError path: operator has given up, so shutdownTime is unhonored.
force_delete_claim() {
  claim="$1"; reason="$2"; detail="$3"
  log "delete claim=$claim reason=$reason detail=\"$detail\""
  mark_for_reap "$claim" "$reason" "$detail" "Delete"
  kubectl delete sandboxclaim "$claim" -n "$NS" \
    --ignore-not-found >/dev/null 2>&1 || true
}

# === main ===
log "starting (ttl=${TTL_MS}ms stuck_ttl=${STUCK_TTL_MS}ms probe_timeout=${PROBE_TIMEOUT_SEC}s)"

CLAIMS_FILE=$(mktemp)
PODS_FILE=$(mktemp)
ROUTES_FILE=$(mktemp)
trap 'rm -f "$CLAIMS_FILE" "$PODS_FILE" "$ROUTES_FILE"' EXIT

# Pipe-delimited so `read` can split without jq.
kubectl get sandboxclaims -n "$NS" -l "$CLAIM_SELECTOR" \
  -o jsonpath='{range .items[*]}{.metadata.name}|{.status.conditions[?(@.type=="Ready")].status}|{.status.conditions[?(@.type=="Ready")].reason}{"\n"}{end}' \
  > "$CLAIMS_FILE" 2>/dev/null || true

# Selector-mismatch detector: most common operator misconfiguration after
# enabling the housekeeper is forgetting to set STUDIO_ENV on mesh, so the
# scoped selector matches zero claims even though studio is happily creating
# them. A silent `claims=0` heartbeat hides this — log loudly when the
# unscoped query disagrees.
if ! [ -s "$CLAIMS_FILE" ]; then
  unscoped=$(kubectl get sandboxclaims -n "$NS" \
    -l "app.kubernetes.io/managed-by=studio,app.kubernetes.io/name=studio-sandbox" \
    -o name 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  if [ "${unscoped:-0}" -gt 0 ]; then
    log "WARN selector matched zero claims but ${unscoped} studio-managed claim(s) exist in ${NS} — verify STUDIO_ENV is set on the mesh deployment and matches the chart's envName (current selector: ${CLAIM_SELECTOR})"
  fi
  log "heartbeat ok claims=0 reaped=0 skipped=0 orphan_routes=0"
  exit 0
fi

kubectl get pods -n "$NS" -l "$POD_SELECTOR" \
  -o jsonpath='{range .items[*]}{.metadata.labels.studio\.decocms\.com/sandbox-handle}|{.status.podIP}{"\n"}{end}' \
  > "$PODS_FILE" 2>/dev/null || true

total=0
reaped=0
skipped=0

# Redirect (not pipe) so the loop stays in the parent shell — pipe-into-
# while subshells the body and counter mutations would be lost.
while IFS='|' read -r CLAIM READY REASON; do
  [ -z "$CLAIM" ] && continue
  total=$((total + 1))

  if [ "$READY" = "False" ] && [ "$REASON" = "ReconcilerError" ]; then
    force_delete_claim "$CLAIM" "ReconcilerError" "operator failed to reconcile"
    reaped=$((reaped + 1))
    continue
  fi

  if [ "$READY" != "True" ]; then
    log "skip claim=$CLAIM reason=not-ready ready=${READY:-<none>} status_reason=${REASON:-<none>}"
    skipped=$((skipped + 1))
    continue
  fi

  POD_IP=$(awk -F'|' -v h="$CLAIM" '$1==h && $2!="" { print $2; exit }' "$PODS_FILE")
  if [ -z "$POD_IP" ]; then
    log "skip claim=$CLAIM reason=no-pod-ip"
    skipped=$((skipped + 1))
    continue
  fi

  RESULT=$(probe_daemon "$POD_IP")
  case "$RESULT" in
    __unreachable__|__not_found__|__server_error__|__bad_shape__)
      detail="$RESULT"
      since_secs=$(mark_probe_failure "$CLAIM" "$detail")
      age_ms=$(( ($(now_secs) - since_secs) * 1000 ))
      if [ "$age_ms" -ge "$STUCK_TTL_MS" ]; then
        request_shutdown "$CLAIM" "StuckReady" "probe failing for ${age_ms}ms (last detail: $detail)"
        reaped=$((reaped + 1))
      else
        log "skip claim=$CLAIM reason=probe-failed detail=$detail age_ms=$age_ms"
        skipped=$((skipped + 1))
      fi
      ;;
    *)
      IDLE_MS="$RESULT"
      clear_probe_failure "$CLAIM"
      if [ "$IDLE_MS" -lt "$TTL_MS" ]; then
        log "keep claim=$CLAIM idle_ms=$IDLE_MS remaining_ms=$((TTL_MS - IDLE_MS))"
        continue
      fi
      # Re-probe right before reap to narrow (not eliminate) the
      # activity-during-decide race. An in-flight request arriving after
      # this second probe still gets connection-reset.
      RESULT2=$(probe_daemon "$POD_IP")
      case "$RESULT2" in
        __*)
          # Conservative: next sweep picks it up via the probe-failure
          # path with its own StuckReady escalation.
          log "abort-reap claim=$CLAIM reason=re-probe-failed first_idle_ms=$IDLE_MS detail=$RESULT2"
          skipped=$((skipped + 1))
          ;;
        *)
          if [ "$RESULT2" -lt "$TTL_MS" ]; then
            log "abort-reap claim=$CLAIM reason=activity-during-decide first_idle_ms=$IDLE_MS reprobe_idle_ms=$RESULT2"
            skipped=$((skipped + 1))
          else
            request_shutdown "$CLAIM" "Idle" "idle_ms=$IDLE_MS reprobe_idle_ms=$RESULT2 ttl_ms=$TTL_MS"
            reaped=$((reaped + 1))
          fi
          ;;
      esac
      ;;
  esac
done < "$CLAIMS_FILE"

# === orphan HTTPRoute GC ===
# Routes whose backing claim is gone. Reachable when a runner stop() raced
# with pod death and the per-claim HTTPRoute teardown didn't land — the
# runner code path swallows the failure ("garbage-collection sweep will
# clean it up") and this is that sweep. Reuses CLAIM_SELECTOR because mesh
# stamps the same managed-by/name/env labels on routes (runner.ts).
#
# Limited to routes with a sandbox-handle label so a hand-managed route
# accidentally tagged with managed-by=studio doesn't get nuked.
orphan_routes=0
kubectl get httproutes -n "$NS" -l "$CLAIM_SELECTOR" \
  -o jsonpath='{range .items[*]}{.metadata.name}|{.metadata.labels.studio\.decocms\.com/sandbox-handle}{"\n"}{end}' \
  > "$ROUTES_FILE" 2>/dev/null || true

while IFS='|' read -r ROUTE_NAME ROUTE_HANDLE; do
  [ -z "$ROUTE_NAME" ] && continue
  [ -z "$ROUTE_HANDLE" ] && continue
  # Live-claim membership test against col 1 of CLAIMS_FILE.
  if awk -F'|' -v h="$ROUTE_HANDLE" '$1==h { exit 0 } END { exit 1 }' \
       "$CLAIMS_FILE"; then
    continue
  fi
  log "orphan-route-gc route=$ROUTE_NAME handle=$ROUTE_HANDLE"
  kubectl delete httproute "$ROUTE_NAME" -n "$NS" \
    --ignore-not-found >/dev/null 2>&1 || true
  orphan_routes=$((orphan_routes + 1))
done < "$ROUTES_FILE"

log "heartbeat ok claims=$total reaped=$reaped skipped=$skipped orphan_routes=$orphan_routes"
