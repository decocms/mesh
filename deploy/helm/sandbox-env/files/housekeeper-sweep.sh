#!/bin/sh
# sandbox-housekeeper sweep — invoked once per CronJob run.
#
# Inputs (env, set by the CronJob spec):
#   NS                     namespace to scan (always agent-sandbox-system today).
#   TTL_MS                 idle TTL in ms — claims with idleMs >= this are reaped.
#   STUCK_TTL_MS           consecutive probe failures older than this trigger a
#                          StuckReady reap (catches wedged daemons that present
#                          TCP but don't reply meaningfully).
#   PROBE_TIMEOUT_SEC      curl --max-time per probe and per re-probe.
#   CLAIM_SELECTOR         label selector for studio claims (mirrors mesh's
#                          buildClaim labels in runner.ts).
#   POD_SELECTOR           label selector for claimed sandbox pods.
#   RUN_ID                 cronjob pod name (downward API).
#
# Output: structured stdout (one event per line, key=value).
# Side effects: kubectl annotate / delete on claims and httproutes; create on
# Events. Probe failures escalate to reap only after STUCK_TTL_MS; transient
# failures skip the claim, leaving idle accounting untouched.

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

# GNU date `-d` parses ISO 8601 timestamps. bitnami/kubectl ships GNU
# coreutils so this works; if a future image swaps to busybox date the
# fallback returns now() and the StuckReady age starts fresh.
iso_to_secs() {
  date -u -d "$1" +%s 2>/dev/null || now_secs
}

# JSONPath escapes dots in label/annotation keys with a backslash. Escape
# once so callers can pass the raw key.
jsonpath_for_annotation() {
  printf '%s' "$1" | sed 's/\./\\./g'
}

# Emit a Kubernetes Event referencing the SandboxClaim. Best-effort: failures
# are swallowed so a misconfigured Event API doesn't block the reap.
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

# Probe http://<podIP>:9000/_decopilot_vm/idle. Echoes one of:
#   <digits>          → idleMs reported by the daemon (success).
#   __unreachable__   → connect/timeout (network or pod down).
#   __not_found__     → HTTP 404 (endpoint absent — daemon image drift).
#   __server_error__  → HTTP 5xx (daemon error).
#   __bad_shape__     → HTTP 200 but body has no parseable idleMs.
#
# Distinguishing these in logs lets ops tell "cluster-wide NetworkPolicy
# regression" (lots of __unreachable__) from "daemon shape drift" (lots of
# __not_found__ or __bad_shape__) without needing a debugger.
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

# Stamp first-failed-at on the claim. If already stamped, preserves the
# original timestamp so consecutive-failure age accumulates across sweeps.
# Echoes the (possibly preserved) ISO timestamp.
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

reap_claim() {
  claim="$1"; reason="$2"; detail="$3"
  log "reap claim=$claim reason=$reason detail=\"$detail\""
  # Annotate first so kube-audit retains *why* this claim disappeared.
  # Best-effort breadcrumbs — survives only as long as the claim object,
  # which is why we also emit a Kubernetes Event below.
  kubectl annotate sandboxclaim "$claim" -n "$NS" --overwrite \
    "studio.decocms.com/reap-reason=${reason}" \
    "studio.decocms.com/reap-detail=${detail}" \
    "studio.decocms.com/reap-at=$(now_iso)" \
    "studio.decocms.com/reap-run=${RUN_ID}" >/dev/null 2>&1 || true
  emit_event "$claim" "SandboxReaped" "Reap" "housekeeper: $reason ($detail)"
  # Route deletion first so traffic stops resolving to the pod before it
  # enters termination (avoids 502s during the SIGTERM drain window).
  # Selector matches LABEL_KEYS.sandboxHandle in mesh runner.ts:1570.
  kubectl delete httproute -n "$NS" \
    -l "studio.decocms.com/sandbox-handle=${claim}" \
    --ignore-not-found >/dev/null 2>&1 || true
  kubectl delete sandboxclaim "$claim" -n "$NS" \
    --ignore-not-found >/dev/null 2>&1 || true
}

# === main ===
log "starting (ttl=${TTL_MS}ms stuck_ttl=${STUCK_TTL_MS}ms probe_timeout=${PROBE_TIMEOUT_SEC}s)"

CLAIMS_FILE=$(mktemp)
PODS_FILE=$(mktemp)
trap 'rm -f "$CLAIMS_FILE" "$PODS_FILE"' EXIT

# Single API call returns name + Ready + reason for every studio claim.
# Pipe-delimited so `read` can split without jq (which isn't guaranteed in
# the bitnami/kubectl image).
kubectl get sandboxclaims -n "$NS" -l "$CLAIM_SELECTOR" \
  -o jsonpath='{range .items[*]}{.metadata.name}|{.status.conditions[?(@.type=="Ready")].status}|{.status.conditions[?(@.type=="Ready")].reason}{"\n"}{end}' \
  > "$CLAIMS_FILE" 2>/dev/null || true

if ! [ -s "$CLAIMS_FILE" ]; then
  log "heartbeat ok claims=0 reaped=0 skipped=0"
  exit 0
fi

# Pod IPs in one call, keyed by sandbox-handle. mesh's runner.ts stamps
# studio.decocms.com/sandbox-handle and studio.decocms.com/role=claimed
# on every claimed pod via additionalPodMetadata.
kubectl get pods -n "$NS" -l "$POD_SELECTOR" \
  -o jsonpath='{range .items[*]}{.metadata.labels.studio\.decocms\.com/sandbox-handle}|{.status.podIP}{"\n"}{end}' \
  > "$PODS_FILE" 2>/dev/null || true

total=0
reaped=0
skipped=0

# Read from a redirected file (NOT a pipe-into-while). Pipe-into-while
# runs the loop in a subshell so set -eu and counter mutations don't
# propagate; the redirect form keeps the loop in the parent shell.
while IFS='|' read -r CLAIM READY REASON; do
  [ -z "$CLAIM" ] && continue
  total=$((total + 1))

  # Operator-side liveness: claim is broken, no point probing.
  if [ "$READY" = "False" ] && [ "$REASON" = "ReconcilerError" ]; then
    reap_claim "$CLAIM" "ReconcilerError" "operator failed to reconcile"
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
        reap_claim "$CLAIM" "StuckReady" "probe failing for ${age_ms}ms (last detail: $detail)"
        reaped=$((reaped + 1))
      else
        log "skip claim=$CLAIM reason=probe-failed detail=$detail age_ms=$age_ms"
        skipped=$((skipped + 1))
      fi
      ;;
    *)
      # Probe succeeded — RESULT is digits. Clear any prior failure mark.
      IDLE_MS="$RESULT"
      clear_probe_failure "$CLAIM"
      if [ "$IDLE_MS" -lt "$TTL_MS" ]; then
        log "keep claim=$CLAIM idle_ms=$IDLE_MS remaining_ms=$((TTL_MS - IDLE_MS))"
        continue
      fi
      # Re-probe right before delete to close the race window between
      # "decided to reap" and "delete completes". If a request hit the
      # daemon in the gap, idleMs resets and we abort the reap. This
      # narrows but does not eliminate the race; an in-flight request
      # arriving after the second probe still gets connection-reset.
      RESULT2=$(probe_daemon "$POD_IP")
      case "$RESULT2" in
        __*)
          # Re-probe failed where the first one succeeded. Conservative:
          # don't reap from this branch — next sweep will pick it up via
          # the probe-failure path (which has its own StuckReady escalation).
          log "abort-reap claim=$CLAIM reason=re-probe-failed first_idle_ms=$IDLE_MS detail=$RESULT2"
          skipped=$((skipped + 1))
          ;;
        *)
          if [ "$RESULT2" -lt "$TTL_MS" ]; then
            log "abort-reap claim=$CLAIM reason=activity-during-decide first_idle_ms=$IDLE_MS reprobe_idle_ms=$RESULT2"
            skipped=$((skipped + 1))
          else
            reap_claim "$CLAIM" "Idle" "idle_ms=$IDLE_MS reprobe_idle_ms=$RESULT2 ttl_ms=$TTL_MS"
            reaped=$((reaped + 1))
          fi
          ;;
      esac
      ;;
  esac
done < "$CLAIMS_FILE"

log "heartbeat ok claims=$total reaped=$reaped skipped=$skipped"
