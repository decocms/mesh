# Helm Chart HA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Helm chart for maximum pod-level availability, add missing K8s primitives (PDB, NetworkPolicy, Ingress), and configure NATS clustering.

**Architecture:** Add new Helm templates (PDB, NetworkPolicy, Ingress, PriorityClass) and update `values.yaml` defaults for production HA. No application code changes — purely Helm chart modifications.

**Tech Stack:** Helm 3, Kubernetes API (policy/v1, networking.k8s.io/v1, autoscaling/v2, scheduling.k8s.io/v1), NATS subchart v2.12.5

---

### Task 1: Add PodDisruptionBudget Template

**Files:**
- Create: `deploy/helm/templates/pdb.yaml`

- [ ] **Step 1: Create the PDB template**

```yaml
{{- if or .Values.autoscaling.enabled (gt (int (default 1 .Values.replicaCount)) 1) }}
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

- [ ] **Step 2: Validate template renders correctly**

Run: `helm template test deploy/helm/ --set autoscaling.enabled=true --set database.engine=postgresql --set database.url=postgresql://x | grep -A 10 PodDisruptionBudget`

Expected: PDB manifest with `maxUnavailable: 1` and correct label selectors.

- [ ] **Step 3: Validate PDB is not rendered for single replica**

Run: `helm template test deploy/helm/ --set replicaCount=1 --set autoscaling.enabled=false | grep PodDisruptionBudget`

Expected: No output (PDB not rendered).

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/templates/pdb.yaml
git commit -m "feat(helm): add PodDisruptionBudget template for HA deployments"
```

---

### Task 2: Update values.yaml — Pod Scheduling, Probes, Shutdown

**Files:**
- Modify: `deploy/helm/values.yaml`

- [ ] **Step 1: Add startupProbe, update probes, add lifecycle hook, update terminationGracePeriod**

In `deploy/helm/values.yaml`, replace the probes and add new fields. The full diff:

Replace:
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /health/ready
    port: http
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 4

terminationGracePeriodSeconds: 60

# Optional lifecycle hooks (preStop, postStart)
# lifecycle: {}
```

With:
```yaml
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

terminationGracePeriodSeconds: 65

lifecycle:
  preStop:
    exec:
      command: ["sleep", "5"]
```

- [ ] **Step 2: Update affinity defaults**

Replace:
```yaml
affinity: {}
```

With:
```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: chart-deco-studio
          topologyKey: kubernetes.io/hostname
```

- [ ] **Step 3: Harden topologySpreadConstraints**

Replace:
```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio
```

With:
```yaml
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
```

- [ ] **Step 4: Pin s3Sync image tag**

Replace:
```yaml
s3Sync:
  enabled: false
  image:
    repository: amazon/aws-cli
    tag: "latest"
```

With:
```yaml
s3Sync:
  enabled: false
  image:
    repository: amazon/aws-cli
    tag: "2.22.35"
```

- [ ] **Step 5: Validate template renders**

Run: `helm template test deploy/helm/ --set database.engine=postgresql --set database.url=postgresql://x | head -100`

Expected: Deployment with startupProbe, lifecycle.preStop, updated terminationGracePeriodSeconds: 65, and anti-affinity.

- [ ] **Step 6: Commit**

```bash
git add deploy/helm/values.yaml
git commit -m "feat(helm): harden probes, add preStop hook, pod anti-affinity, pin s3Sync image"
```

---

### Task 3: Add startupProbe Support to Deployment Template

**Files:**
- Modify: `deploy/helm/templates/deployment.yaml`

The deployment template currently renders `livenessProbe` and `readinessProbe` but does not render `startupProbe`. Add it.

- [ ] **Step 1: Add startupProbe block to deployment template**

In `deploy/helm/templates/deployment.yaml`, after the readinessProbe block (after line 105), add:

```yaml
          {{- with .Values.startupProbe }}
          startupProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
```

The insertion point is right after:
```yaml
          {{- with .Values.readinessProbe }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
```

- [ ] **Step 2: Validate startupProbe renders**

Run: `helm template test deploy/helm/ --set database.engine=postgresql --set database.url=postgresql://x | grep -A 6 startupProbe`

Expected:
```
          startupProbe:
            httpGet:
              path: /health/live
              port: http
            periodSeconds: 2
            failureThreshold: 30
            timeoutSeconds: 3
```

- [ ] **Step 3: Commit**

```bash
git add deploy/helm/templates/deployment.yaml
git commit -m "feat(helm): add startupProbe support to deployment template"
```

---

### Task 4: Add HPA Behavior Policies

**Files:**
- Modify: `deploy/helm/values.yaml`
- Modify: `deploy/helm/templates/hpa.yaml`

- [ ] **Step 1: Add behavior config to values.yaml**

In `deploy/helm/values.yaml`, inside the `autoscaling` block, after `targetMemoryUtilizationPercentage: 80`, add:

```yaml
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
```

- [ ] **Step 2: Update HPA template to render behavior**

In `deploy/helm/templates/hpa.yaml`, before the final `{{- end }}`, add the behavior block. Replace the full file with:

```yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "chart-deco-studio.fullname" . }}
  labels:
    {{- include "chart-deco-studio.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "chart-deco-studio.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
  {{- with .Values.autoscaling.behavior }}
  behavior:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
```

- [ ] **Step 3: Validate HPA renders with behavior**

Run: `helm template test deploy/helm/ --set autoscaling.enabled=true --set database.engine=postgresql --set database.url=postgresql://x | grep -A 15 behavior`

Expected: behavior block with scaleUp and scaleDown policies.

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/values.yaml deploy/helm/templates/hpa.yaml
git commit -m "feat(helm): add HPA behavior policies for scaling stability"
```

---

### Task 5: Enable 3-Node NATS Cluster

**Files:**
- Modify: `deploy/helm/values.yaml`

- [ ] **Step 1: Update NATS subchart values for clustering**

In `deploy/helm/values.yaml`, replace the `nats:` block:

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
```

- [ ] **Step 2: Validate NATS subchart renders**

Run: `helm dependency update deploy/helm/ && helm template test deploy/helm/ --set database.engine=postgresql --set database.url=postgresql://x | grep -c "kind: StatefulSet"`

Expected: At least 1 (NATS StatefulSet).

- [ ] **Step 3: Commit**

```bash
git add deploy/helm/values.yaml
git commit -m "feat(helm): enable 3-node NATS cluster with pod anti-affinity"
```

---

### Task 6: Add NetworkPolicy Templates

**Files:**
- Create: `deploy/helm/templates/networkpolicy.yaml`
- Modify: `deploy/helm/values.yaml`

- [ ] **Step 1: Add networkPolicy config to values.yaml**

After the `env: []` block at the end of `deploy/helm/values.yaml`, add:

```yaml

# Network Policies (optional - requires a CNI that supports NetworkPolicy)
networkPolicy:
  enabled: false
  # Ingress controller namespace (for allowing inbound traffic)
  ingressNamespace: "ingress-nginx"
  # PostgreSQL CIDR (for egress to database)
  databaseCIDR: "10.0.0.0/8"
```

- [ ] **Step 2: Create the NetworkPolicy template**

Create `deploy/helm/templates/networkpolicy.yaml`:

```yaml
{{- if .Values.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "chart-deco-studio.fullname" . }}
  labels:
    {{- include "chart-deco-studio.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "chart-deco-studio.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow traffic from ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: {{ .Values.networkPolicy.ingressNamespace }}
      ports:
        - port: {{ .Values.service.targetPort | default 3000 }}
          protocol: TCP
    # Allow health checks from kubelet
    - ports:
        - port: {{ .Values.service.targetPort | default 3000 }}
          protocol: TCP
  egress:
    # NATS
    {{- if .Values.nats.enabled }}
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: nats
      ports:
        - port: 4222
          protocol: TCP
    {{- end }}
    # PostgreSQL
    - to:
        - ipBlock:
            cidr: {{ .Values.networkPolicy.databaseCIDR }}
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
    # External HTTPS (MCP servers, OAuth providers, OTel)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32
      ports:
        - port: 443
          protocol: TCP
        - port: 80
          protocol: TCP
{{- end }}
```

- [ ] **Step 3: Validate NetworkPolicy renders when enabled**

Run: `helm template test deploy/helm/ --set networkPolicy.enabled=true --set database.engine=postgresql --set database.url=postgresql://x | grep -A 5 NetworkPolicy`

Expected: NetworkPolicy manifest with correct podSelector.

- [ ] **Step 4: Validate NetworkPolicy is NOT rendered when disabled**

Run: `helm template test deploy/helm/ --set database.engine=postgresql --set database.url=postgresql://x | grep NetworkPolicy`

Expected: No output.

- [ ] **Step 5: Commit**

```bash
git add deploy/helm/templates/networkpolicy.yaml deploy/helm/values.yaml
git commit -m "feat(helm): add optional NetworkPolicy template"
```

---

### Task 7: Add Ingress Template

**Files:**
- Create: `deploy/helm/templates/ingress.yaml`
- Modify: `deploy/helm/values.yaml`

- [ ] **Step 1: Add ingress config to values.yaml**

In `deploy/helm/values.yaml`, after the `service:` block, add:

```yaml

ingress:
  enabled: false
  className: ""
  annotations: {}
    # For NGINX Ingress with SSE support:
    # nginx.ingress.kubernetes.io/proxy-buffering: "off"
    # nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    # nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    # nginx.ingress.kubernetes.io/proxy-body-size: "10m"
  hosts:
    - host: mesh.example.com
      paths:
        - path: /
          pathType: Prefix
  tls: []
  #  - secretName: mesh-tls
  #    hosts:
  #      - mesh.example.com
```

- [ ] **Step 2: Create the Ingress template**

Create `deploy/helm/templates/ingress.yaml`:

```yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "chart-deco-studio.fullname" . }}
  labels:
    {{- include "chart-deco-studio.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "chart-deco-studio.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
```

- [ ] **Step 3: Validate Ingress renders when enabled**

Run: `helm template test deploy/helm/ --set ingress.enabled=true --set ingress.className=nginx --set database.engine=postgresql --set database.url=postgresql://x | grep -A 20 "kind: Ingress"`

Expected: Ingress manifest with correct service backend.

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/templates/ingress.yaml deploy/helm/values.yaml
git commit -m "feat(helm): add optional Ingress template with SSE annotation examples"
```

---

### Task 8: Add PriorityClass Template

**Files:**
- Create: `deploy/helm/templates/priorityclass.yaml`
- Modify: `deploy/helm/values.yaml`
- Modify: `deploy/helm/templates/deployment.yaml`

- [ ] **Step 1: Add priorityClass config to values.yaml**

In `deploy/helm/values.yaml`, after the `securityContext:` block, add:

```yaml

# Priority class for pod scheduling (optional)
priorityClass:
  enabled: false
  name: "mcp-mesh-control-plane"
  value: 1000000
  preemptionPolicy: PreemptLowerPriority
```

- [ ] **Step 2: Create the PriorityClass template**

Create `deploy/helm/templates/priorityclass.yaml`:

```yaml
{{- if .Values.priorityClass.enabled }}
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: {{ .Values.priorityClass.name }}
  labels:
    {{- include "chart-deco-studio.labels" . | nindent 4 }}
value: {{ .Values.priorityClass.value }}
globalDefault: false
preemptionPolicy: {{ .Values.priorityClass.preemptionPolicy }}
description: "Priority for MCP Mesh control plane pods"
{{- end }}
```

- [ ] **Step 3: Add priorityClassName to Deployment template**

In `deploy/helm/templates/deployment.yaml`, inside `spec.template.spec`, after `serviceAccountName`, add:

```yaml
      {{- if .Values.priorityClass.enabled }}
      priorityClassName: {{ .Values.priorityClass.name }}
      {{- end }}
```

- [ ] **Step 4: Validate PriorityClass renders**

Run: `helm template test deploy/helm/ --set priorityClass.enabled=true --set database.engine=postgresql --set database.url=postgresql://x | grep -A 5 PriorityClass`

Expected: PriorityClass manifest with value 1000000.

- [ ] **Step 5: Commit**

```bash
git add deploy/helm/templates/priorityclass.yaml deploy/helm/templates/deployment.yaml deploy/helm/values.yaml
git commit -m "feat(helm): add optional PriorityClass for preemption protection"
```

---

### Task 9: Format and Lint

- [ ] **Step 1: Run formatter**

Run: `bun run fmt`

- [ ] **Step 2: Run lint**

Run: `bun run lint`

Fix any issues found.

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore(helm): format"
```
