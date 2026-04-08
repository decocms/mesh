# Infrastructure & Advanced HA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide production configuration examples: a values overlay with HA features enabled, and reference infrastructure manifests.

**Architecture:** This plan produces example configuration files deployed outside the Helm chart. The deliverables are: a production values example overlay and infrastructure reference manifests in `deploy/`.

**Tech Stack:** Kubernetes, External Secrets Operator, cert-manager

**Note:** This plan is for documentation and configuration. It does NOT modify application code or the core Helm chart templates.

---

### Task 1: Create Production Values Example Overlay

**Files:**
- Create: `deploy/helm/values-production.example.yaml`

This file contains ONLY values that differ from the defaults in `values.yaml`. It serves as a starting point for production deployments.

- [ ] **Step 1: Create the production values example**

Create `deploy/helm/values-production.example.yaml`:

```yaml
# Production values overlay for MCP Mesh HA deployment.
# Contains ONLY values that differ from defaults in values.yaml.
# Usage: helm install mesh deploy/helm/ -f deploy/helm/values-production.example.yaml
#
# Prerequisites:
#   - PostgreSQL (RDS Multi-AZ, CloudNativePG, or Cloud SQL HA)
#   - External Secrets Operator for secret management
#   - cert-manager for TLS certificates (optional)
#   - 3+ AZ cluster with 6+ nodes

replicaCount: 3

# --- Database (required for multi-replica) ---
database:
  engine: postgresql
  # URL provided via secret.secretName below

# --- Secret (managed by External Secrets Operator) ---
secret:
  secretName: "mesh-production-secrets"

# --- Autoscaling ---
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 6
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

# --- Topology: use DoNotSchedule for zone spread in 3+ AZ clusters ---
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio  # Change to your release name
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio  # Change to your release name

# --- NATS: 3-node cluster for production ---
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
          size: 5Gi
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

# --- Ingress (example with NGINX + SSE support) ---
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
    - host: mesh.example.com  # CHANGE THIS
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: mesh-tls
      hosts:
        - mesh.example.com  # CHANGE THIS

# --- ConfigMap overrides ---
configMap:
  meshConfig:
    NODE_ENV: "production"
    PORT: "3000"
    HOST: "0.0.0.0"
    BETTER_AUTH_URL: "https://mesh.example.com"  # CHANGE THIS
    BASE_URL: "https://mesh.example.com"  # CHANGE THIS
    DATA_DIR: "/app/data"
    DECO_AI_GATEWAY_ENABLED: "false"

# --- OTel (optional) ---
otel:
  enabled: true
  protocol: "http/protobuf"
  service: "mcp-mesh"
  collector:
    enabled: true
```

- [ ] **Step 2: Validate production overlay renders**

Run: `helm template mesh-prod deploy/helm/ -f deploy/helm/values-production.example.yaml --set database.url=postgresql://x > /dev/null && echo "OK"`

Expected: "OK" (no rendering errors).

- [ ] **Step 3: Commit**

```bash
git add deploy/helm/values-production.example.yaml
git commit -m "feat(helm): add production values example overlay"
```

---

### Task 2: Create Infrastructure Reference Manifests

**Files:**
- Create: `deploy/infrastructure/README.md`
- Create: `deploy/infrastructure/external-secret.yaml`
- Create: `deploy/infrastructure/cert-issuer.yaml`
- Create: `deploy/infrastructure/networkpolicy.yaml`

- [ ] **Step 1: Create the infrastructure directory**

Run: `mkdir -p deploy/infrastructure`

- [ ] **Step 2: Create External Secrets example**

Create `deploy/infrastructure/external-secret.yaml`:

```yaml
# External Secrets Operator: sync secrets from AWS Secrets Manager.
# Prerequisites:
#   - External Secrets Operator installed
#   - ClusterSecretStore configured for AWS Secrets Manager
#
# Usage: kubectl apply -f deploy/infrastructure/external-secret.yaml -n mesh-production
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: mesh-production-secrets
spec:
  refreshInterval: 5m
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: mesh-production-secrets  # Must match secret.secretName in values
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

- [ ] **Step 4: Create NetworkPolicy example**

Create `deploy/infrastructure/networkpolicy.yaml`:

```yaml
# NetworkPolicy example for MCP Mesh.
# This is highly environment-specific -- adapt to your cluster's CNI,
# ingress controller, and network layout before applying.
#
# Usage: kubectl apply -f deploy/infrastructure/networkpolicy.yaml -n mesh-production
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mcp-mesh
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: chart-deco-studio  # Match your chart name
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx  # Your ingress namespace
      ports:
        - port: 3000
          protocol: TCP
    # Kubelet health checks (host-network, bypasses NetworkPolicy)
    - ports:
        - port: 3000
          protocol: TCP
  egress:
    # NATS
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: nats
      ports:
        - port: 4222
          protocol: TCP
    # PostgreSQL
    - to:
        - ipBlock:
            cidr: 10.0.0.0/8  # Your database CIDR
      ports:
        - port: 5432
          protocol: TCP
    # DNS
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    # External HTTPS only (MCP servers, OAuth providers)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
      ports:
        - port: 443
          protocol: TCP
```

- [ ] **Step 5: Create the README**

Create `deploy/infrastructure/README.md`:

```markdown
# Infrastructure Setup for MCP Mesh HA

Reference manifests for external infrastructure components needed for
production HA deployment of MCP Mesh. Adapt to your environment.

## Prerequisites

1. **Kubernetes cluster** with 3+ AZs
2. **PostgreSQL** -- RDS Multi-AZ, Cloud SQL HA, or CloudNativePG
3. **External Secrets Operator** -- for secret management
4. **cert-manager** -- for TLS certificate automation (optional)
5. **Ingress controller** -- NGINX Ingress or Envoy-based (Contour)

## Files

| File | Description |
|------|-------------|
| `external-secret.yaml` | ExternalSecret for AWS Secrets Manager |
| `cert-issuer.yaml` | cert-manager ClusterIssuer for Let's Encrypt |
| `networkpolicy.yaml` | NetworkPolicy example (adapt to your CNI) |

## Deployment

1. Apply infrastructure manifests (adapt first):
   ```bash
   kubectl apply -f deploy/infrastructure/cert-issuer.yaml
   kubectl apply -f deploy/infrastructure/external-secret.yaml -n mesh-production
   kubectl apply -f deploy/infrastructure/networkpolicy.yaml -n mesh-production
   ```

2. Deploy MCP Mesh with production values:
   ```bash
   helm install mesh deploy/helm/ \
     -f deploy/helm/values-production.example.yaml \
     --set database.url=postgresql://... \
     -n mesh-production
   ```
```

- [ ] **Step 6: Commit**

```bash
git add deploy/infrastructure/
git commit -m "docs(infra): add infrastructure reference manifests

Includes External Secrets Operator (v1 API), cert-manager ClusterIssuer,
and NetworkPolicy example for production HA deployment."
```

---

### Task 3: Format and Final Verification

- [ ] **Step 1: Run formatter**

Run: `bun run fmt`

- [ ] **Step 2: Validate all Helm templates render without errors**

Run: `helm template mesh-prod deploy/helm/ -f deploy/helm/values-production.example.yaml --set database.url=postgresql://x > /dev/null && echo "OK"`

Expected: "OK"

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore: format"
```

---

## Critique Decisions

**Adopted:**
- Slimmed `values-production.yaml` to deltas only, renamed to `.example.yaml` (Duplication, Scope critics)
- Fixed ESO API from `v1beta1` to `v1` (Documentation critic)
- Reduced ESO `refreshInterval` from `1h` to `5m` (Security critic)
- Removed port 80 from NetworkPolicy egress, added RFC1918 exclusions (Security critic)
- Moved NetworkPolicy from Helm template to infrastructure example (Scope critic)
- Removed `DATABASE_POOL_MAX` override (Correctness critic -- was backwards)
- Removed `persistence` from overlay to avoid RWO + multi-replica conflict (Correctness critic)
- Removed Karpenter NodePool -- AWS-specific, out of scope for this repo (Scope critic)
- Removed DR section from README -- belongs in deployment guide (Scope critic)

**Rejected:**
- Adding Helm validation for empty secrets in production -- Better Auth already fails on startup with invalid secrets. Adding chart-level validation is an unrelated concern.

**Adapted:**
- Kept 3-node NATS cluster in production overlay only (not as default) with pod anti-affinity (Scope + Architecture compromise)
