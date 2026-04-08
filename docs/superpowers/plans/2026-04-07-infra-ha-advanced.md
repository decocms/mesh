# Infrastructure & Advanced HA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document and configure the external infrastructure needed for production HA: External Secrets Operator, cert-manager, Karpenter NodePool, and production values overlay.

**Architecture:** This plan produces documentation and example configuration files. Unlike the Helm chart and app code plans, most of these items are cluster-level resources deployed outside the Helm chart. The deliverables are: a production values overlay, infrastructure setup docs, and example manifests in `deploy/`.

**Tech Stack:** Kubernetes, Karpenter, ArgoCD, External Secrets Operator, cert-manager, Velero

**Note:** This plan is for documentation and configuration. It does NOT modify application code or the core Helm chart templates (those are covered by the other two plans).

---

### Task 1: Create Production Values Overlay

**Files:**
- Create: `deploy/helm/values-production.yaml`

This file serves as a reference for production deployments with all HA features enabled.

- [ ] **Step 1: Create the production values overlay**

Create `deploy/helm/values-production.yaml`:

```yaml
# Production values overlay for MCP Mesh HA deployment.
# Usage: helm install mesh deploy/helm/ -f deploy/helm/values-production.yaml
#
# Prerequisites:
#   - PostgreSQL (RDS/CloudNativePG) with DATABASE_URL in secret
#   - External Secrets Operator for secret management
#   - cert-manager for TLS certificates
#   - CNI with NetworkPolicy support (Calico/Cilium)
#   - 3+ AZ cluster with 6+ nodes

replicaCount: 3

image:
  pullPolicy: IfNotPresent
  command:
    - bun
    - run
    - deco
    - --no-local-mode
    - --num-threads
    - "4"

# --- Autoscaling ---
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 6
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60

# --- Database ---
database:
  engine: postgresql
  # URL provided via secret.secretName (External Secrets Operator)

# --- Persistence ---
persistence:
  enabled: true
  accessMode: ReadWriteOnce
  storageClass: "gp3"
  size: 10Gi

# --- Probes ---
startupProbe:
  httpGet:
    path: /health/live
    port: http
  periodSeconds: 2
  failureThreshold: 30
  timeoutSeconds: 3

livenessProbe:
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 0
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
  failureThreshold: 2

# --- Shutdown ---
terminationGracePeriodSeconds: 65
lifecycle:
  preStop:
    exec:
      command: ["sleep", "5"]

# --- Scheduling ---
nodeSelector: {}

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: chart-deco-studio
          topologyKey: kubernetes.io/hostname

topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio

# --- Priority ---
priorityClass:
  enabled: true
  name: "mcp-mesh-control-plane"
  value: 1000000
  preemptionPolicy: PreemptLowerPriority

# --- Secret ---
secret:
  secretName: "mesh-production-secrets"  # Managed by External Secrets Operator

# --- Ingress ---
ingress:
  enabled: true
  className: "nginx"
  annotations:
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: mesh.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: mesh-tls
      hosts:
        - mesh.example.com

# --- Network Policy ---
networkPolicy:
  enabled: true
  ingressNamespace: "ingress-nginx"
  databaseCIDR: "10.0.0.0/8"

# --- NATS ---
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
        maxSize: 512Mi
      fileStore:
        enabled: true
        pvc:
          enabled: true
          size: 2Gi
          storageClassName: ""
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

# --- ConfigMap ---
configMap:
  meshConfig:
    NODE_ENV: "production"
    PORT: "3000"
    HOST: "0.0.0.0"
    BETTER_AUTH_URL: "https://mesh.example.com"
    BASE_URL: "https://mesh.example.com"
    DATA_DIR: "/app/data"
    DATABASE_POOL_MAX: "10"
    DECO_AI_GATEWAY_ENABLED: "false"

# --- OTel ---
otel:
  enabled: true
  protocol: "http/protobuf"
  service: "mcp-mesh"
  collector:
    enabled: true
    image:
      repository: otel/opentelemetry-collector-contrib
      tag: "0.115.1"
      pullPolicy: IfNotPresent

# --- S3 Sync ---
s3Sync:
  enabled: false
  image:
    repository: amazon/aws-cli
    tag: "2.22.35"
```

- [ ] **Step 2: Validate production overlay renders**

Run: `helm template mesh-prod deploy/helm/ -f deploy/helm/values-production.yaml --set database.url=postgresql://x | head -20`

Expected: Rendered manifests without errors.

- [ ] **Step 3: Commit**

```bash
git add deploy/helm/values-production.yaml
git commit -m "feat(helm): add production values overlay with full HA configuration"
```

---

### Task 2: Create Infrastructure Setup Guide

**Files:**
- Create: `deploy/infrastructure/README.md`
- Create: `deploy/infrastructure/external-secret.yaml`
- Create: `deploy/infrastructure/cert-issuer.yaml`
- Create: `deploy/infrastructure/karpenter-nodepool.yaml`

- [ ] **Step 1: Create the infrastructure directory**

Run: `mkdir -p deploy/infrastructure`

- [ ] **Step 2: Create External Secrets example**

Create `deploy/infrastructure/external-secret.yaml`:

```yaml
# External Secrets Operator: sync secrets from AWS Secrets Manager.
# Prerequisites:
#   - External Secrets Operator installed (helm install external-secrets external-secrets/external-secrets)
#   - ClusterSecretStore configured for AWS Secrets Manager
#   - Secrets created in AWS Secrets Manager at the referenced paths
#
# Usage: kubectl apply -f deploy/infrastructure/external-secret.yaml -n mesh-production
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: mesh-production-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: mesh-production-secrets  # Must match secret.secretName in values-production.yaml
    creationPolicy: Owner
  data:
    - secretKey: BETTER_AUTH_SECRET
      remoteRef:
        key: mesh/production/auth
        property: secret
    - secretKey: ENCRYPTION_KEY
      remoteRef:
        key: mesh/production/encryption
        property: key
    - secretKey: DATABASE_URL
      remoteRef:
        key: mesh/production/database
        property: url
```

- [ ] **Step 3: Create cert-manager ClusterIssuer example**

Create `deploy/infrastructure/cert-issuer.yaml`:

```yaml
# cert-manager ClusterIssuer for Let's Encrypt TLS certificates.
# Prerequisites:
#   - cert-manager installed (helm install cert-manager jetstack/cert-manager --set crds.enabled=true)
#
# Usage: kubectl apply -f deploy/infrastructure/cert-issuer.yaml
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com  # CHANGE THIS
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

- [ ] **Step 4: Create Karpenter NodePool example**

Create `deploy/infrastructure/karpenter-nodepool.yaml`:

```yaml
# Karpenter NodePool for MCP Mesh workloads.
# Prerequisites:
#   - Karpenter installed and configured with EC2NodeClass
#
# Usage: kubectl apply -f deploy/infrastructure/karpenter-nodepool.yaml
---
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: mesh-app
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand", "spot"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["5"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  limits:
    cpu: "64"
    memory: "128Gi"
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 60s
---
# NATS nodes must not use spot instances (JetStream fileStore corruption risk)
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: mesh-data
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["m", "r"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["5"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
      taints:
        - key: workload-type
          value: data
          effect: NoSchedule
  limits:
    cpu: "16"
    memory: "64Gi"
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 300s
```

- [ ] **Step 5: Create the README**

Create `deploy/infrastructure/README.md`:

```markdown
# Infrastructure Setup for MCP Mesh HA

This directory contains example manifests for the external infrastructure
components needed for a production HA deployment of MCP Mesh.

## Prerequisites

1. **Kubernetes cluster** with 3+ AZs and 6+ nodes
2. **PostgreSQL** — RDS Multi-AZ, Cloud SQL HA, or CloudNativePG
3. **External Secrets Operator** — for secret management
4. **cert-manager** — for TLS certificate automation
5. **Ingress controller** — NGINX Ingress or Envoy-based (Contour)
6. **CNI with NetworkPolicy** — Calico or Cilium

## Setup Order

1. Install infrastructure operators:
   - External Secrets Operator
   - cert-manager
   - Karpenter (optional, replaces Cluster Autoscaler)

2. Apply infrastructure manifests:
   ```bash
   kubectl apply -f deploy/infrastructure/cert-issuer.yaml
   kubectl apply -f deploy/infrastructure/external-secret.yaml -n mesh-production
   # kubectl apply -f deploy/infrastructure/karpenter-nodepool.yaml  # if using Karpenter
   ```

3. Deploy MCP Mesh with production values:
   ```bash
   helm install mesh deploy/helm/ \
     -f deploy/helm/values-production.yaml \
     --set database.url=postgresql://... \
     -n mesh-production
   ```

## Files

| File | Description |
|------|-------------|
| `external-secret.yaml` | ExternalSecret for AWS Secrets Manager |
| `cert-issuer.yaml` | cert-manager ClusterIssuer for Let's Encrypt |
| `karpenter-nodepool.yaml` | Karpenter NodePools for app and data workloads |

## Disaster Recovery

**Target:** RPO 1hr, RTO 15min

1. PostgreSQL: Cross-region read replica (promotable in ~5min)
2. NATS: Let it rebuild — events are durable in PostgreSQL, polling fallback covers the gap
3. Kubernetes: ArgoCD reconciles from Git + Velero for PVC/CRD backups
4. DNS: Route53 health-check failover to DR region
```

- [ ] **Step 6: Commit**

```bash
git add deploy/infrastructure/
git commit -m "docs(infra): add infrastructure setup guide and example manifests

Includes External Secrets Operator, cert-manager ClusterIssuer,
and Karpenter NodePool examples for production HA deployment."
```

---

### Task 3: Add Helm Chart Validation for SQLite + Autoscaling

**Files:**
- Modify: `deploy/helm/templates/_helpers.tpl`

**Context:** The `_helpers.tpl` already validates that autoscaling requires PostgreSQL or distributed storage (line 116-118). But there is no warning when `database.engine=sqlite` with `replicaCount > 1`. The existing validation on line 113-115 covers `replicaCount > 1` without distributed storage, which implicitly covers SQLite. This task adds a more explicit error message specifically for SQLite + autoscaling.

- [ ] **Step 1: Verify existing validation already covers this case**

Run: `helm template test deploy/helm/ --set autoscaling.enabled=true --set database.engine=sqlite 2>&1 | head -5`

Expected: Error message about autoscaling requiring PostgreSQL or distributed storage.

Since the existing validation already handles this, no change is needed. Mark this task as done.

- [ ] **Step 2: Commit (no-op — validation already exists)**

No commit needed.

---

### Task 4: Format and Final Verification

- [ ] **Step 1: Run formatter**

Run: `bun run fmt`

- [ ] **Step 2: Validate all Helm templates render without errors**

Run: `helm template mesh-prod deploy/helm/ -f deploy/helm/values-production.yaml --set database.url=postgresql://x > /dev/null && echo "OK"`

Expected: "OK"

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore: format"
```
