# Helm Chart HA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Helm chart for maximum pod-level availability, add missing K8s primitives (PDB, Ingress), update probe strategy, and right-size NATS.

**Architecture:** Add new Helm templates (PDB, Ingress) and update `values.yaml` defaults for production HA. No application code changes -- purely Helm chart modifications.

**Tech Stack:** Helm 3, Kubernetes API (policy/v1, autoscaling/v2), NATS subchart v2.12.5

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

### Task 2: Update values.yaml -- Pod Scheduling, Probes, Shutdown

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
  failureThreshold: 3

# Shutdown timing budget: preStop(5s) + appTimeout(58s) + buffer(2s) = 65s
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
# NOTE: labelSelector uses the default chart name. If you use nameOverride or
# a different release name, update the matchLabels to match your deployment.
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

- [ ] **Step 3: Add hostname spread constraint**

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
# NOTE: labelSelector uses the default chart/release names. Update if using
# nameOverride or a different release name. Use DoNotSchedule for zone in
# production clusters with 3+ AZs to guarantee zone spread.
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
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

### Task 4: Add HPA Behavior Support to Template

**Files:**
- Modify: `deploy/helm/templates/hpa.yaml`

Note: We add the `behavior` rendering to the template but do NOT add default behavior values to `values.yaml`. Users should define behavior when they enable HPA and have traffic patterns to optimize for.

- [ ] **Step 1: Update HPA template to render behavior when present**

In `deploy/helm/templates/hpa.yaml`, add the behavior block before the final `{{- end }}`. Replace the full file with:

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

- [ ] **Step 2: Validate HPA renders without behavior (no default)**

Run: `helm template test deploy/helm/ --set autoscaling.enabled=true --set database.engine=postgresql --set database.url=postgresql://x | grep behavior`

Expected: No output (behavior not rendered when not configured).

- [ ] **Step 3: Validate HPA renders with behavior when provided**

Run: `helm template test deploy/helm/ --set autoscaling.enabled=true --set autoscaling.behavior.scaleDown.stabilizationWindowSeconds=300 --set database.engine=postgresql --set database.url=postgresql://x | grep -A 5 behavior`

Expected: behavior block renders.

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/templates/hpa.yaml
git commit -m "feat(helm): add HPA behavior support to template"
```

---

### Task 5: Right-Size NATS JetStream Storage

**Files:**
- Modify: `deploy/helm/values.yaml`

Note: We keep NATS as a single replica by default (clustering is a production overlay concern). Only right-size the JetStream storage which was overprovisioned.

- [ ] **Step 1: Update NATS JetStream values**

In `deploy/helm/values.yaml`, replace the `nats:` block. Only change the JetStream sizing:

```yaml
nats:
  enabled: true
  config:
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
          storageClassName: ""  # empty = use cluster default StorageClass
```

- [ ] **Step 2: Commit**

```bash
git add deploy/helm/values.yaml
git commit -m "feat(helm): right-size NATS JetStream storage (1Gi->512Mi mem, 10Gi->5Gi file)"
```

---

### Task 6: Add Ingress Template

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
  hosts:
    - host: mesh.example.com
      paths:
        - path: /
          pathType: Prefix
  tls: []
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
git commit -m "feat(helm): add optional Ingress template"
```

---

### Task 7: Format and Lint

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

---

## Critique Decisions

**Adopted:**
- Kept `readinessProbe.failureThreshold` at 3 (not 2) to avoid flapping risk (Performance, Architecture critics)
- Kept `ScheduleAnyway` for zone topology as default, added comment about using `DoNotSchedule` in production (Performance, Scope critics)
- Removed PriorityClass task -- YAGNI for most deployments, cluster-scoped resource causes conflicts (Scope, Security, Architecture critics)
- Removed NetworkPolicy from Helm chart -- too environment-specific as a template (Scope critic). Moved to infra plan as example.
- Removed default HPA behavior values -- speculative without traffic data (Scope critic). Kept template support.
- Added hostname spread constraint as `ScheduleAnyway` (Architecture critic)
- Added comments documenting hardcoded label limitation (Duplication, Architecture critics)
- Added shutdown timing budget comment (Duplication critic)
- Right-sized JetStream to 512Mi/5Gi instead of aggressive 2Gi file (compromise on Documentation critic's sizing concern)

**Rejected:**
- Moving label selectors into deployment template -- Helm values cannot use template functions; this is a known Helm limitation. Documented with comments instead.
- 3-node NATS cluster as default -- YAGNI for dev/staging (Scope critic). Moved to production overlay.

**Adapted:**
- s3Sync image pinned to specific tag (not digest) -- digest is ideal but requires infrastructure to track digests. Tag pin is the pragmatic middle ground.
