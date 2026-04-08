# MCP Mesh: Kubernetes High-Availability Report

> Comprehensive analysis from 5 parallel research tracks exploring maximum availability for the MCP Mesh control plane.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Assessment](#current-state-assessment)
3. [Pod-Level Resilience](#1-pod-level-resilience)
4. [Database Resilience](#2-database-resilience)
5. [NATS & Event Bus Resilience](#3-nats--event-bus-resilience)
6. [Networking & Traffic Management](#4-networking--traffic-management)
7. [Cluster & Infrastructure](#5-cluster--infrastructure)
8. [Bugs & Issues Found During Research](#bugs--issues-found)
9. [Prioritized Action Plan](#prioritized-action-plan)
10. [Cost Analysis](#cost-analysis)

---

## Executive Summary

MCP Mesh is an MCP control plane (Hono API + React SPA, Bun runtime) with three dependent services: **PostgreSQL** (state), **NATS with JetStream** (signaling + streaming), and optional sidecars (OTel collector, S3 sync). The current Helm chart has a solid foundation but several critical gaps for production HA:

**Top 5 findings:**
1. **No PodDisruptionBudget** -- `kubectl drain` or cluster autoscaler can evict all pods simultaneously
2. **Single NATS instance** -- one pod failure kills real-time event notification (polling fallback adds up to 5s latency)
3. **No Ingress template** -- no route-aware timeouts for SSE vs HTTP, no TLS automation
4. **Connection pooling gap** -- 3-6 replicas x 4 threads x 20 pool max = 240-480 PostgreSQL connections (default PG max is 100)
5. **Migration race condition** -- multiple pods running Kysely migrations simultaneously on startup; plugin migrations lack advisory locks

**One latent bug found:** `NatsNotifyStrategy.start()` has an `if (this.sub) return` guard that prevents re-subscription after NATS reconnect, silently breaking the notify path.

---

## Current State Assessment

### Architecture
```
                    Internet
                       |
              [No Ingress/Gateway]
                       |
                  ClusterIP:80
                       |
            +----------+----------+
            |    Deployment (1-6) |
            |   Bun/Hono :3000    |
            |   + OTel sidecar    |
            |   + S3 sync sidecar |
            +----------+----------+
                  |           |
           PostgreSQL      NATS (1 pod)
           (external)      JetStream
```

### What Already Works Well
- Rolling update with `maxSurge:1, maxUnavailable:0`
- TopologySpreadConstraints across zones (soft)
- HPA template (disabled by default, 3-6 replicas)
- Graceful shutdown sequence (mark 503 -> sleep 2s -> force close -> drain NATS/DB -> 55s hard timeout)
- Event bus hybrid architecture (PG for durability, NATS for signaling, polling as fallback)
- Pod heartbeat via NATS KV with 45s TTL
- Resilience tests with Toxiproxy (DB outage, DB latency, NATS outage, MCP latency)

### Critical Gaps
| Gap | Impact | Effort |
|-----|--------|--------|
| No PDB | All pods can be evicted simultaneously | Low (new template) |
| No pod anti-affinity | Pods can stack on one node/zone | Low (values change) |
| No startupProbe | 30s liveness initialDelay is a blunt instrument | Low (values change) |
| Single NATS pod | SPOF for real-time notifications | Medium (subchart config) |
| No Ingress template | No route-aware timeouts, no TLS | Medium (new template) |
| No NetworkPolicy | Unrestricted pod-to-pod traffic | Medium (new templates) |
| No connection pooling | Connection exhaustion at 3+ replicas | Medium (infra + config) |
| No PriorityClass | MCP Mesh can be preempted by any workload | Low (new template) |
| preStop hook missing | 2s internal sleep insufficient for endpoint propagation | Low (values change) |

---

## 1. Pod-Level Resilience

### 1.1 PodDisruptionBudget

Add `templates/pdb.yaml`:

```yaml
{{- if or .Values.autoscaling.enabled (gt (int .Values.replicaCount) 1) }}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "chart-deco-studio.fullname" . }}
  labels:
    {{- include "chart-deco-studio.labels" . | nindent 4 }}
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      {{- include "chart-deco-studio.selectorLabels" . | nindent 6 }}
{{- end }}
```

**Why `maxUnavailable: 1` over `minAvailable`:** With HPA range 3-6, `minAvailable: 2` could block node drains when HPA has scaled to 3 and one pod is already unavailable. `maxUnavailable: 1` is simpler and correct regardless of replica count.

### 1.2 Pod Anti-Affinity

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: chart-deco-studio
              app.kubernetes.io/instance: deco-studio
          topologyKey: kubernetes.io/hostname
      - weight: 50
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: chart-deco-studio
              app.kubernetes.io/instance: deco-studio
          topologyKey: topology.kubernetes.io/zone
```

**Why `preferred` over `required`:** If a zone goes down and remaining zones have fewer nodes than replicas, `required` leaves pods in Pending. `preferred` degrades gracefully.

### 1.3 Probes: Add startupProbe, Tighten Others

```yaml
startupProbe:
  httpGet:
    path: /health/live
    port: http
  periodSeconds: 2
  failureThreshold: 30    # Up to 60s to start
  timeoutSeconds: 3

livenessProbe:
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 0   # startupProbe handles startup
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: http
  initialDelaySeconds: 0
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2      # 10s to remove from endpoints (was 20s)
```

**Rationale:** Separating startup from liveness eliminates the 30s `initialDelaySeconds` hack. The readiness `failureThreshold` drops from 4 to 2 for faster DB-outage response.

### 1.4 Graceful Shutdown: preStop Hook

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sleep", "5"]
terminationGracePeriodSeconds: 65
```

The preStop hook runs before SIGTERM, giving kube-proxy and ingress controllers 5s to remove the pod from endpoints **before** the app starts shutting down. The app's internal timeout should increase from 55s to 58s (`apps/mesh/src/index.ts:161`).

### 1.5 PriorityClass

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: mcp-mesh-control-plane
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
```

MCP Mesh routes all MCP traffic -- it should be among the last workloads preempted under resource pressure.

### 1.6 Resource QoS

Current config (Burstable QoS) is **correct**:
- Memory limit = request (2Gi): prevents OOM impact on other pods
- No CPU limit: avoids CFS throttling on Bun's single-threaded event loop
- HPA scales out before sustained CPU becomes problematic

### 1.7 TopologySpreadConstraints: Harden for Production

```yaml
topologySpreadConstraints:
  # Zone: hard constraint
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio
  # Node: soft constraint
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio
```

**`DoNotSchedule` for zones** prevents all pods from stacking in one AZ during scale-up or node pressure. A Pending pod is visible and actionable; silent AZ concentration is not.

---

## 2. Database Resilience

### 2.1 PostgreSQL HA: Recommended Options

| Option | Failover Time | RPO | Ops Burden | Best For |
|--------|---------------|-----|------------|----------|
| **CloudNativePG** | 10-30s | ~5s (async WAL) | Low | Self-hosted K8s |
| **RDS Multi-AZ** | 60-120s | 0 (sync repl) | Lowest | AWS deployments |
| **Cloud SQL HA** | ~60s | 0 | Lowest | GCP deployments |
| **AlloyDB** | ~10s | 0 | Lowest | GCP, read-heavy |

**Recommendation:** Managed service (RDS/Cloud SQL) as default for least operational burden. CloudNativePG for self-hosted/on-prem. The Helm chart already supports both via `database.url`.

### 2.2 Connection Pooling (Critical)

**The problem:** With `NUM_THREADS: 4` and `DATABASE_POOL_MAX: 20`, each pod opens up to 80 PostgreSQL connections. At 3-6 replicas, that's **240-480 connections**. PostgreSQL default `max_connections` is 100.

**Solution:** PgBouncer as a standalone Deployment (not sidecar -- sidecar doesn't reduce total connection count with HPA).

- CloudNativePG has built-in PgBouncer pooler (`spec.pooler`)
- Use **transaction pooling mode** (Kysely doesn't use `SET`, prepared statements by name, or session-level features)
- Reduce `DATABASE_POOL_MAX` to 5-10 per thread when PgBouncer is in front
- The event bus's `pg_advisory_lock` and `FOR UPDATE SKIP LOCKED` work correctly through PgBouncer in transaction mode

### 2.3 Read Replicas

The codebase has clear read/write separation. Add `DATABASE_READ_URL` to the Helm chart:
- **Write paths:** Connection CRUD, event publishing, delivery claiming, thread creation
- **Read paths:** Connection listing, monitoring queries, registry browsing, virtual MCP tool listing
- Most reads tolerate 100-500ms replication lag. Event bus claiming must always hit primary.

### 2.4 Migration Safety

**Problem:** Migrations run at pod startup (`apps/mesh/src/settings/pipeline.ts:46-55`). Issues:
1. During rolling update, new pod runs DDL while old pod serves traffic against pre-migration schema
2. Plugin migrations (`apps/mesh/src/database/migrate.ts:149-213`) lack advisory locks -- two pods can race

**Solutions:**
- **Init container for migrations** (ensures migrations complete before pod joins Service)
- **Backward-compatible migrations only** (add nullable -> backfill -> NOT NULL in next release)
- **Advisory lock for plugin migrations:**
  ```typescript
  await sql`SELECT pg_advisory_lock(hashtext('plugin_migrations'))`.execute(db);
  try { /* run plugin migrations */ } finally {
    await sql`SELECT pg_advisory_unlock(hashtext('plugin_migrations'))`.execute(db);
  }
  ```

### 2.5 Database Circuit Breaker

Currently, when PostgreSQL is down, every request waits 30s (`connectionTimeoutMillis`) before failing. Add:
- Database-level circuit breaker (open after N consecutive failures, short-circuit for cooldown period)
- Transient error retry (codes `57P01`, `57P03`, `08006`, `40001`) with 100-500ms backoff, 2-3 attempts
- Reduce `idleTimeoutMillis` from 300s to 60s for faster stale connection recycling after failover

### 2.6 Backup & Recovery

| Scenario | RPO | RTO | Approach |
|----------|-----|-----|----------|
| Pod crash | 0 | 10-30s | K8s reschedule, HPA |
| PG failover (CNPG) | ~5s | 10-30s | Auto-promotion |
| PG failover (RDS) | 0 | 60-120s | DNS-based |
| AZ failure | ~5s | 2-5min | Cross-AZ replicas |
| Region failure | 5-60s | 15-60min | Cross-region backup restore |
| Data corruption | 0 | 5-15min | PITR from WAL |

---

## 3. NATS & Event Bus Resilience

### 3.1 NATS Clustering: 3-Node

```yaml
nats:
  enabled: true
  config:
    cluster:
      enabled: true
      replicas: 3
    jetstream:
      enabled: true
      memoryStore:
        enabled: true
        maxSize: 512Mi    # Reduced from 1Gi
      fileStore:
        enabled: true
        pvc:
          enabled: true
          size: 2Gi       # Reduced from 10Gi
  podTemplate:
    merge:
      spec:
        affinity:
          podAntiAffinity:
            requiredDuringSchedulingIgnoredDuringExecution:
              - labelSelector:
                  matchExpressions:
                    - key: app.kubernetes.io/name
                      operator: In
                      values: ["nats"]
                topologyKey: kubernetes.io/hostname
```

**Key points:**
- 3-node Raft quorum tolerates 1 node failure
- Pod anti-affinity ensures each NATS node on a different K8s node
- NATS routes auto-configured via headless service DNS
- JetStream streams should use R3 replication for durability

### 3.2 JetStream Storage: Right-Size

NATS is used for:
1. `mesh.events.notify` -- Core pub/sub (no JetStream needed)
2. NatsSSEBroadcast -- Core pub/sub for cross-pod SSE fan-out
3. NatsCancelBroadcast -- Core pub/sub for cancel signals
4. NatsStreamBuffer -- JetStream for decopilot streaming relay (ephemeral)
5. JobStream -- JetStream for automation job processing

**Recommendation:** Keep JetStream but reduce allocation. 512Mi memory + 2Gi file is sufficient for ephemeral streaming and job queues. The 10Gi file store was 5-10x overprovisioned.

### 3.3 NATS Client Tuning

Add to `createNatsConnectionProvider`:
```typescript
{
  reconnectTimeWait: 1000,
  reconnectJitter: 500,
  pingInterval: 20_000,       // Default 120s is too slow for dead detection
  maxPingOut: 3,
  name: "mesh-app",
}
```

### 3.4 Degraded Mode Analysis (NATS Down)

| Scenario | With NATS | Without NATS |
|----------|-----------|--------------|
| Same-pod event publish | Instant | Instant (PollingStrategy.notify is direct) |
| Cross-pod event publish | Instant | Up to 5s (next poll cycle) |
| Scheduled/cron events | Up to 5s (polling) | Up to 5s (identical) |

**The hybrid architecture is sound.** NATS down is a latency degradation (5s worst case for cross-pod), not a data loss event. Events are durable in PostgreSQL.

### 3.5 Future Enhancement: PG LISTEN/NOTIFY Fallback

Add a `PgNotifyStrategy` as a second fallback (zero-infrastructure, sub-second cross-pod notification using the existing PostgreSQL connection). This would make the composition: `compose(PollingStrategy, NatsNotifyStrategy, PgNotifyStrategy)` -- three layers of defense.

---

## 4. Networking & Traffic Management

### 4.1 Ingress Controller: Envoy-Based (Contour)

MCP uses SSE (Server-Sent Events) for long-lived connections. Envoy natively handles streaming without buffering. NGINX requires explicit `proxy_buffering off` annotations.

**Contour HTTPProxy example with route-aware timeouts:**

```yaml
apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: mcp-mesh
spec:
  virtualhost:
    fqdn: mesh.example.com
    tls:
      secretName: mesh-tls
  routes:
    # MCP proxy -- long-lived SSE
    - conditions:
        - prefix: /mcp
      services:
        - name: deco-studio
          port: 80
      timeoutPolicy:
        response: "0s"          # No response timeout for SSE
        idle: "300s"            # Kill truly idle connections after 5m
      retryPolicy:
        count: 0                # NEVER retry MCP -- tool calls have side effects
    # OAuth/auth
    - conditions:
        - prefix: /api/auth
      services:
        - name: deco-studio
          port: 80
      timeoutPolicy:
        response: "30s"
    # SPA / static assets
    - conditions:
        - prefix: /
      services:
        - name: deco-studio
          port: 80
      timeoutPolicy:
        response: "15s"
```

### 4.2 Critical: Never Retry `/mcp/*` Routes

MCP tool calls (`tools/call`) are **not idempotent**. A retried `EVENT_PUBLISH` creates duplicate events. Safe-to-retry endpoints:
- `GET /health/*`, `GET /api/auth/*`, `GET /` (SPA assets), `GET /api/v1/*` (REST reads)

### 4.3 TLS: Terminate at Ingress + cert-manager

```
Internet -> [TLS] -> Ingress (termination) -> [plaintext] -> ClusterIP -> Pod:3000
```

The Hono server doesn't handle TLS. cert-manager with Let's Encrypt automates certificate lifecycle.

### 4.4 Session Affinity: NOT Needed

The app stores sessions in PostgreSQL (Better Auth), not in-memory. NATS provides inter-pod communication. Session affinity would harm HPA scaling by creating uneven load distribution.

### 4.5 Network Policies

```yaml
# App pods: restrict to ingress controller + PostgreSQL + NATS + DNS + external HTTPS
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mcp-mesh-app
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: chart-deco-studio
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: nats
      ports:
        - port: 4222
    - to: # PostgreSQL
        - ipBlock: { cidr: 10.0.0.0/8 }
      ports:
        - port: 5432
    - to: # DNS
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - port: 53
          protocol: UDP
    - to: # External MCP servers, OAuth providers
        - ipBlock:
            cidr: 0.0.0.0/0
            except: ["169.254.169.254/32"]  # Block metadata service
      ports:
        - port: 443
        - port: 80
```

---

## 5. Cluster & Infrastructure

### 5.1 Multi-AZ: 3 AZs, 6 Nodes Minimum

- 2 nodes per AZ for N+1 redundancy per zone
- Separate node groups: **app** (compute-optimized for MCP proxy) and **data** (for NATS with JetStream persistence)
- NATS pods must run on on-demand instances (not spot)

### 5.2 Autoscaler: Karpenter Over Cluster Autoscaler

- Right-sized node provisioning (bypasses ASG, ~45-60s vs ~2-3min)
- Diversified instance pools for spot resilience
- NodePool with `consolidationPolicy: WhenEmptyOrUnderutilized`

**HPA Behavior tuning:**
```yaml
autoscaling:
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100           # Double capacity per step
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
```

### 5.3 Spot Instances

**App pods: Yes.** The app is stateless when backed by external PostgreSQL. Pod heartbeat (NATS KV, 45s TTL) already handles pod death detection. AWS gives 2-minute interruption notice > 65s termination grace period.

**NATS pods: No.** JetStream fileStore corruption risk on spot termination.

### 5.4 GitOps: ArgoCD + External Secrets Operator

- ArgoCD for Helm chart deployment (clear UI for render failures, diff views for subchart changes)
- External Secrets Operator (ESO) for secrets from AWS Secrets Manager / Vault
- The chart's `secret.secretName` already supports referencing external Secrets

### 5.5 Disaster Recovery: Active-Passive Warm Standby

**Target: RPO 1hr, RTO 15min**

| Layer | Strategy |
|-------|----------|
| PostgreSQL | Managed service with cross-region read replica, promotable in ~5min |
| NATS | Let it rebuild in DR cluster. Events are in PostgreSQL. Polling fallback covers the gap. |
| Kubernetes | Velero backups every 6hr. ArgoCD reconciles from Git. |

**Failover procedure:**
1. Promote PG read replica (5min)
2. ArgoCD activates standby cluster Application
3. Karpenter provisions nodes (~60s)
4. NATS boots, polling catches up from PG
5. DNS failover (Route53 health check)
6. **Total RTO: ~15 minutes**

### 5.6 Secret Rotation

**BETTER_AUTH_SECRET:** Session signing key. Rotation invalidates active sessions (users re-auth). Schedule during low-traffic windows. Better Auth does not natively support dual-key verification.

**ENCRYPTION_KEY:** Credential vault AES-256-GCM key. Requires a re-encryption Job:
```
bun run deco vault-rekey --old-key $OLD --new-key $NEW
```

### 5.7 Chaos Engineering: Chaos Mesh

Beyond existing Toxiproxy resilience tests, run in staging:
1. **AZ partition** -- validate pod spread and HPA scale in remaining AZs
2. **NATS kill** -- validate polling fallback delivers within 5s
3. **PG connection exhaustion** -- validate readiness probe fails and pod removed from endpoints
4. **DNS failure** -- validate NATS infinite reconnect and PG pool recovery
5. **Runaway autoscaling** -- validate HPA maxReplicas and Karpenter limits

### 5.8 Supply Chain Security

- **Pin sidecar images by digest** (current `s3Sync.image.tag: "latest"` is a risk)
- The deployment template already supports digest-based images (`image: "repo@sha256:..."`)
- Add Kyverno/OPA Gatekeeper policy for Sigstore/Cosign image verification

---

## Bugs & Issues Found

### Bug: NatsNotifyStrategy Re-subscription Failure

**File:** `apps/mesh/src/event-bus/nats-notify.ts:30`

The `start()` method has `if (this.sub) return` which prevents re-subscription after NATS reconnect. After a NATS connection loss and recovery, the old subscription object may be stale but non-null, silently breaking the notify path. All event delivery falls back to 5s polling.

**Fix:** Check if existing subscription is draining/closed before returning early, or unconditionally clean up and re-subscribe:
```typescript
if (this.sub) {
  try { this.sub.unsubscribe(); } catch { /* ignore */ }
  this.sub = null;
}
```

### Issue: Plugin Migration Race Condition

**File:** `apps/mesh/src/database/migrate.ts:149-213`

Plugin migrations directly query and insert into `plugin_migrations` without advisory locks. Two pods starting simultaneously can race. Kysely's built-in `kysely_migration_lock` only covers Kysely migrations, not plugin migrations.

### Issue: Connection Pool Sizing

With `NUM_THREADS: 4` and `DATABASE_POOL_MAX: 20`, each pod can open 80 PG connections. At 3-6 replicas, this exceeds PostgreSQL defaults and can cause connection exhaustion.

---

## Prioritized Action Plan

### Phase 1: Quick Wins (values.yaml + new templates, no code changes)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | Add PodDisruptionBudget template | 1hr | Prevents total pod eviction |
| 2 | Add pod anti-affinity to values.yaml | 30min | Prevents node co-location |
| 3 | Add startupProbe, tighten liveness/readiness | 30min | Faster failure detection |
| 4 | Add preStop hook, increase terminationGracePeriod to 65s | 30min | Zero-downtime deploys |
| 5 | Harden topologySpreadConstraints to DoNotSchedule | 15min | Prevents AZ concentration |
| 6 | Pin sidecar images by digest (s3Sync "latest" is a risk) | 15min | Supply chain security |
| 7 | Add HPA behavior policies (scaleUp/scaleDown) | 30min | Prevent scaling oscillation |

### Phase 2: Infrastructure (requires external services)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 8 | Enable 3-node NATS cluster | 2hr | Eliminates NATS SPOF |
| 9 | Deploy PgBouncer or use CloudNativePG pooler | 4hr | Prevents connection exhaustion |
| 10 | Add Ingress/HTTPProxy template with route-aware timeouts | 4hr | Proper SSE handling, TLS |
| 11 | Add NetworkPolicy templates | 2hr | Defense in depth |
| 12 | Set up External Secrets Operator | 4hr | Stop storing secrets in Helm values |
| 13 | Deploy cert-manager for TLS automation | 2hr | Automated certificate lifecycle |

### Phase 3: Application Code Changes

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 14 | Fix NatsNotifyStrategy re-subscription bug | 1hr | Prevents silent notify failure |
| 15 | Add advisory lock to plugin migrations | 1hr | Prevents migration race |
| 16 | Add init container for database migrations | 2hr | Safe rolling updates with DDL |
| 17 | Add database circuit breaker | 4hr | 30s -> sub-second failure response |
| 18 | Increase force-exit timeout from 55s to 58s | 15min | Align with 65s grace period |
| 19 | Add NATS client tuning (pingInterval, reconnectJitter) | 1hr | Faster dead connection detection |

### Phase 4: Advanced HA

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 20 | Deploy Karpenter with NodePool config | 1 day | Faster autoscaling, right-sized nodes |
| 21 | Set up ArgoCD + ApplicationSet for GitOps | 1 day | Reproducible deployments, DR standby |
| 22 | Add PG LISTEN/NOTIFY as fallback strategy | 2 days | Eliminate 5s polling gap |
| 23 | Implement DATABASE_READ_URL for read replicas | 2 days | Scale read-heavy workloads |
| 24 | Set up Chaos Mesh experiments | 2 days | Validate HA in staging |
| 25 | Add PriorityClass template | 1hr | Preemption protection |

---

## Cost Analysis

### Estimated Monthly (3-AZ, us-east-1)

| Component | Without Optimization | With Optimization |
|-----------|---------------------|-------------------|
| 3x c6i.xlarge baseline (on-demand) | $460 | $280 (1yr RI) |
| 3x c6i.xlarge burst (spot) | $460 | $140 (spot avg) |
| NATS 3x m6i.large (on-demand) | $210 | $210 |
| NATS PVCs (3x 10Gi gp3) | $7 | $2 (3x 2Gi) |
| RDS PostgreSQL db.r6g.large | $220 | $135 (1yr RI) |
| **Total** | **~$1,357** | **~$767** |

**Key savings levers:**
- Reserved Instances for baseline app + database (~40% savings)
- Spot instances for burst capacity (~70% savings)
- Right-size NATS JetStream storage (10Gi -> 2Gi)
- Right-size app resources after profiling actual usage
- OTel tail-based sampling to reduce trace storage costs
