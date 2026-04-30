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

now_iso()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
now_secs() { date -u +%s; }

log() {
  printf '[%s] [housekeeper] run=%s %s\n' "$(now_iso)" "$RUN_ID" "$*"
}

# Normalize ISO 8601 to a form busybox `date` (alpine) accepts —
# busybox rejects the `T` separator and trailing `Z`. Fractional seconds
# stripped too. Falls back to now() if `date -d` still rejects (resets
# the StuckReady age clock for that sweep — age_ms ≈ 0 in logs).
iso_to_secs() {
  norm=$(printf '%s' "$1" | tr 'T' ' ' | sed 's/\.[0-9]*Z$//; s/Z$//')
  date -u -d "$norm" +%s 2>/dev/null || now_secs
}

# JSONPath escapes dots in keys with a backslash.
jsonpath_for_annotation() {
  printf '%s' "$1" | sed 's/\./\\./g'
}

# Best-effort — a misconfigured Event API shouldn't block the reap.
emit_event() {
  claim="$1"; reason="$2"; action="$3"; msg="$4"
  ts=$(now_iso)
  kubectl create -f - <<YAML >/dev/null 2>&1 || true
apiVersion: v1
kind: Event
metadata:
  generateName: ${claim}-housekeeper-
  namespace: ${NS}
involvedObject:
  apiVersion: extensions.agents.x-k8s.io/v1alpha1
  kind: SandboxClaim
  name: ${claim}
  namespace: ${NS}
type: Normal
reason: ${reason}
action: ${action}
message: ${msg}
source:
  component: sandbox-housekeeper
firstTimestamp: ${ts}
lastTimestamp: ${ts}
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

# Echoes the ISO timestamp; preserves the existing stamp on repeats so
# consecutive-failure age accumulates across sweeps.
mark_probe_failure() {
  claim="$1"; detail="$2"
  jp=$(jsonpath_for_annotation "$PROBE_FAIL_ANNOT")
  existing=$(kubectl get sandboxclaim "$claim" -n "$NS" \
    -o jsonpath="{.metadata.annotations.${jp}}" 2>/dev/null || true)
  if [ -z "$existing" ]; then
    ts=$(now_iso)
    kubectl annotate sandboxclaim "$claim" -n "$NS" --overwrite \
      "${PROBE_FAIL_ANNOT}=${ts}" \
      "${PROBE_FAIL_DETAIL_ANNOT}=${detail}" >/dev/null 2>&1 || true
    echo "$ts"
  else
    echo "$existing"
  fi
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
trap 'rm -f "$CLAIMS_FILE" "$PODS_FILE"' EXIT

# Pipe-delimited so `read` can split without jq.
kubectl get sandboxclaims -n "$NS" -l "$CLAIM_SELECTOR" \
  -o jsonpath='{range .items[*]}{.metadata.name}|{.status.conditions[?(@.type=="Ready")].status}|{.status.conditions[?(@.type=="Ready")].reason}{"\n"}{end}' \
  > "$CLAIMS_FILE" 2>/dev/null || true

if ! [ -s "$CLAIMS_FILE" ]; then
  log "heartbeat ok claims=0 reaped=0 skipped=0"
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
      since=$(mark_probe_failure "$CLAIM" "$detail")
      since_s=$(iso_to_secs "$since")
      age_ms=$(( ($(now_secs) - since_s) * 1000 ))
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

log "heartbeat ok claims=$total reaped=$reaped skipped=$skipped"
