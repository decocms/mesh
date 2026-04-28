# Helm Chart: chart-deco-studio

This chart provides a complete and parameterizable solution for deploying the application with support for persistence, authentication, autoscaling, and much more.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
  - [Basic Installation](#basic-installation)
  - [Using External Secrets](#using-external-secrets)
- [Configuration](#configuration)
- [Chart Structure](#chart-structure)
- [Templates and Functionality](#templates-and-functionality)
- [Configurable Values](#configurable-values)
- [Usage Examples](#usage-examples)
- [Maintenance and Updates](#maintenance-and-updates)

## Overview

This Helm chart encapsulates all Kubernetes resources necessary to run the application:

- **Deployment**: Main application with security configurations
- **Service**: Internal application exposure
- **ConfigMap**: Non-sensitive configurations
- **Secret**: Sensitive data (authentication)
- **PersistentVolumeClaim**: Persistent storage for database
- **ServiceAccount**: Service account for the pod
- **HorizontalPodAutoscaler**: Automatic autoscaling (optional)

### Main Features

- ✅ **Parameterizable**: All configurations via `values.yaml`
- ✅ **Reusable**: Deploy to multiple environments with different values
- ✅ **Flexible**: Support for additional volumes, tolerations, affinity
- ✅ **Observable**: Health checks, standardized labels
- ✅ **Scalable**: Optional HPA for autoscaling

### Architecture
![Infrastructure](./img/deco-studio-infra-arch.jpg)


## Prerequisites

- Kubernetes 1.32+
- Helm 3.0+
- `kubectl` configured to access the cluster
- StorageClass configured (for PVC)

## Quick Start

The simplest way to get the application up and running on k8s:

```bash
# 1. Generate a secure secret for authentication
SECRET=$(openssl rand -base64 32)

# 2. Install the chart with the generated secret
helm install deco-studio . \
  --namespace deco-studio \
  --create-namespace \
  --set secret.BETTER_AUTH_SECRET="$SECRET"

# 3. Wait for pods to be ready
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/instance=deco-studio \
  -n deco-studio \
  --timeout=300s

# 4. Access via port-forward
kubectl port-forward svc/deco-studio 8080:80 -n deco-studio
```

The application will be available at `http://localhost:8080`.

> **⚠️ Important for Production**: This configuration uses SQLite and is suitable only for development/testing. For production environments, configure:
> - **PostgreSQL** as the database engine (`database.engine: postgresql`)
> - **Autoscaling** enabled (`autoscaling.enabled: true`) with appropriate values
> - **Distributed persistence** (`persistence.distributed: true`) or PostgreSQL to allow multiple replicas
> 
> See the [Configuration](#configuration) section for more details on production configuration.

## Installation

### Basic Installation

```bash
# Preparing necessary parameters
Adjust values.yaml with desired configurations to run in your environment

# Install with default values
helm install deco-studio . --namespace deco-studio --create-namespace

# Install with custom values
helm install deco-studio . -f my-values.yaml -n deco-studio --create-namespace
```

### Verify Installation

```bash
# View release status
helm status deco-studio -n deco-studio

# View created resources
kubectl get all -l app.kubernetes.io/instance=deco-studio -n deco-studio

# View logs
kubectl logs -l app.kubernetes.io/instance=deco-studio -n deco-studio
```

### Using External Secrets

To keep sensitive values out of your `values.yaml` file (useful for GitOps workflows like ArgoCD), you can create Secrets manually and reference them in your values file.

#### Step 1: Create Secrets Manually

Edit `examples/secrets-example.yaml` with your actual values and apply it:

```bash
# Edit the file with your real values
# Then apply the Secrets
kubectl apply -f examples/secrets-example.yaml -n deco-studio
```

The Secrets file contains:
- **Main Secret** (`deco-studio-secrets`): Contains `BETTER_AUTH_SECRET` and `DATABASE_URL`
- **Auth Config Secret** (`deco-studio-auth-secrets`): Contains OAuth client IDs/secrets and API keys

#### Step 2: Configure values.yaml to Use Secrets

In your `values.yaml` or `values-custom.yaml`, configure:

```yaml
secret:
  # Reference the existing Secret created manually
  secretName: "deco-studio-secrets"
  
  # Reference the authConfig Secret
  authConfigSecretName: "deco-studio-auth-secrets"

database:
  engine: postgresql
  # Leave url empty when using Secret - value comes from DATABASE_URL in Secret
  url: ""

configMap:
  authConfig:
    socialProviders:
      google:
        # Leave empty when using Secret - values come from Secret
        clientId: ""
        clientSecret: ""
      github:
        clientId: ""
        clientSecret: ""
    emailProviders:
      - id: "resend-primary"
        provider: "resend"
        config:
          apiKey: ""  # Leave empty when using Secret
          fromEmail: "noreply@decocms.com"
```

#### Step 3: Install/Upgrade

```bash
# Install with values that reference external Secrets
helm install deco-studio . -f values-custom.yaml -n deco-studio --create-namespace

# Or upgrade existing release
helm upgrade deco-studio . -f values-custom.yaml -n deco-studio
```

**Note**: When `secret.secretName` is defined, the chart will use the existing Secret instead of creating a new one. Values defined in `values.yaml` take precedence over Secret values (for backward compatibility).

### Uninstall

```bash
helm uninstall deco-studio -n deco-studio
```

## Configuration

### Main Values

The main configurable values are in `values.yaml`.

Main sections:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `3` |
| `image.repository` | Image repository | `ghcr.io/decocms/studio/studio` |
| `image.tag` | Image tag | `latest` |
| `service.type` | Service type | `ClusterIP` |
| `persistence.enabled` | Enable PVC | `true` |
| `persistence.distributed` | PVC supports ReadWriteMany | `true` |
| `persistence.accessMode` | PVC access mode | `ReadWriteMany` |
| `persistence.storageClass` | PVC StorageClass | `efs` |
| `autoscaling.enabled` | Enable HPA | `false` |
| `database.engine` | Database (`sqlite`/`postgresql`) | `sqlite` |
| `database.url` | Database URL when PostgreSQL | `""` |
| `database.caCert` | CA certificate for SSL validation (managed databases) | `""` |

### Customizing Values

Create a `custom-values.yaml` file:

```yaml
replicaCount: 2

image:
  tag: "v1.2.3" # Example

service:
  type: LoadBalancer
  port: 80

database:
  engine: postgresql
  url: "postgresql://studio_user:studio_password@studio.example.com:5432/studio_db"  
  caCert: |
  -----BEGIN CERTIFICATE-----
  aaaaaaaabbbbbbcccccccccddddddd
  aaaaaaaabbbbbbcccccccccddddddd
  aaaaaaaabbbbbbcccccccccddddddd
  aaaaaaaabbbbbbcccccccccddddddd
  aaaaaaaabbbbbbcccccccccddddddd
  aaaaaaaabbbbbbcccccccccddddddd
  aaaaaaaabbbbbbcccccccccddddddd
  aaaaaaaabbbbbbcccccccccddddddd
  -----END CERTIFICATE-----

resources:
  requests:
    memory: "300Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"

persistence:
  size: 10Gi
  storageClass: "gp3"
```

Install with custom values:

```bash
helm install deco-studio . -f custom-values.yaml -n deco-studio --create-namespace
```

## Chart Structure

```
chart-deco-studio/
├── Chart.yaml              # Chart metadata
├── values.yaml             # Default values
├── templates/              # Kubernetes templates
│   ├── _helpers.tpl        # Helper functions
│   ├── deployment.yaml     # Application deployment
│   ├── service.yaml        # Service
│   ├── configmap.yaml      # Main ConfigMap
│   ├── configmap-auth.yaml # Authentication ConfigMap
│   ├── secret.yaml         # Secret
│   ├── pvc.yaml            # PersistentVolumeClaim
│   ├── serviceaccount.yaml # ServiceAccount
│   ├── hpa.yaml            # HorizontalPodAutoscaler
│   └── NOTES.txt           # Post-installation messages
└── README.md               # This file
```

## Templates and Functionality

### 1. `_helpers.tpl` - Helper Functions

This file defines reusable functions used in all templates:

#### `chart-deco-studio.name`
Returns the base chart name:
```yaml
{{- define "chart-deco-studio.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}
```
- Uses `nameOverride` if defined, otherwise uses `Chart.Name`
- Truncates to 63 characters (Kubernetes limit)

#### `chart-deco-studio.fullname`
Returns the full resource name:
```yaml
{{- define "chart-deco-studio.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
```
- **Important**: Uses only `Release.Name`, ignoring the chart name
- If you install with `helm install deco-studio`, all resources will have the name `deco-studio`

**Example**:
```bash
helm install deco-studio . -n deco-studio --create-namespace
```
- Deployment: `deco-studio`
- Service: `deco-studio`
- ConfigMap: `deco-studio-config`
- Secret: `deco-studio-secrets`
- PVC: `deco-studio-data`

#### `chart-deco-studio.labels`
Generates standardized labels:
```yaml
helm.sh/chart: chart-deco-studio-0.1.0
app.kubernetes.io/name: chart-deco-studio
app.kubernetes.io/instance: deco-studio
app.kubernetes.io/version: latest
app.kubernetes.io/managed-by: Helm
```

#### `chart-deco-studio.selectorLabels`
Labels used for selection (selectors):
```yaml
app.kubernetes.io/name: chart-deco-studio
app.kubernetes.io/instance: deco-studio
```

### 2. `deployment.yaml` - Application Deployment

#### Conditional Structure

```yaml
{{- if not .Values.autoscaling.enabled }}
replicas: {{ .Values.replicaCount }}
{{- end }}
```
- If HPA is enabled, does not define `replicas` (HPA controls)

#### Deployment Strategy (Auto-detection)

```yaml
strategy:
  type: {{ include "chart-deco-studio.deploymentStrategy" . }}
```

The chart automatically detects the appropriate deployment strategy:
- **RollingUpdate**: used when PostgreSQL OR distributed storage (ReadWriteMany)
- **Recreate**: used by default for SQLite with ReadWriteOnce

You can override by explicitly defining `strategy.type` in `values.yaml`.

#### Environment Variables

```yaml
env:
  - name: NODE_ENV
    valueFrom:
      configMapKeyRef:
        name: {{ include "chart-deco-studio.fullname" . }}-config
        key: NODE_ENV
  - name: DATABASE_URL
    {{- if eq (lower (default "sqlite" .Values.database.engine)) "postgresql" }}
    valueFrom:
      secretKeyRef:
        name: {{ include "chart-deco-studio.fullname" . }}-secrets
        key: DATABASE_URL
    {{- else }}
    valueFrom:
      configMapKeyRef:
        name: {{ include "chart-deco-studio.fullname" . }}-config
        key: DATABASE_URL
    {{- end }}
```
- References ConfigMap dynamically using `fullname`
- **Security**: `DATABASE_URL` uses `secretKeyRef` when PostgreSQL (sensitive credentials) or `configMapKeyRef` when SQLite (just file path)

#### Conditional Volumes

```yaml
{{- if .Values.persistence.enabled }}
- name: data
  persistentVolumeClaim:
    claimName: {{ include "chart-deco-studio.fullname" . }}-data
{{- else }}
- name: data
  emptyDir: {}
{{- end }}
```
- If `persistence.enabled: false`, uses `emptyDir` (temporary data)

#### Additional Volumes

```yaml
{{- with .Values.volumes }}
  {{- toYaml . | nindent 8 }}
{{- end }}
```
- Allows adding custom volumes via `values.yaml`

#### Lifecycle Hooks

```yaml
{{- with .Values.lifecycle }}
lifecycle:
  {{- toYaml . | nindent 12 }}
{{- end }}
```
- Conditionally renders lifecycle hooks (preStop, postStart) if defined in `values.yaml`
- Optional `terminationGracePeriodSeconds` for graceful shutdown (e.g. with PostgreSQL to avoid connection resets during deploy)
- Useful for graceful shutdowns, cleanup tasks, or initialization scripts
- Supports both `exec` (command execution) and `httpGet` (HTTP requests)

#### Topology Spread Constraints

```yaml
{{- if and .Values.topologySpreadConstraints (gt (len .Values.topologySpreadConstraints) 0) }}
topologySpreadConstraints:
  {{- range .Values.topologySpreadConstraints }}
  - maxSkew: {{ .maxSkew }}
    topologyKey: {{ .topologyKey }}
    whenUnsatisfiable: {{ .whenUnsatisfiable }}
    labelSelector:
      {{- toYaml .labelSelector | nindent 12 }}
  {{- end }}
{{- end }}
```
- Distributes pods evenly across zones/availability
- **Important**: `labelSelector` is required when configured

### 3. `service.yaml` - Service

```yaml
selector:
  {{- include "chart-deco-studio.selectorLabels" . | nindent 4 }}
```
- Uses `selectorLabels` to connect to Deployment

```yaml
{{- if .Values.service.sessionAffinity }}
sessionAffinity: {{ .Values.service.sessionAffinity }}
{{- end }}
```
- Renders only if `sessionAffinity` is defined
- **By default**: no session affinity (requests distributed among all pods)
- **If configured**: `sessionAffinity: ClientIP` ensures requests from the same IP are directed to the same pod

### 4. `configmap.yaml` - Main ConfigMap

```yaml
data:
  NODE_ENV: {{ .Values.configMap.meshConfig.NODE_ENV | quote }}
  PORT: {{ .Values.configMap.meshConfig.PORT | quote }}
  {{- if ne (lower (default "sqlite" .Values.database.engine)) "postgresql" }}
  DATABASE_URL: {{ include "chart-deco-studio.databaseUrl" . | trim | quote }}
  {{- end }}
```
- `| quote` ensures values are valid strings in YAML
- **Security**: `DATABASE_URL` only goes in ConfigMap when SQLite (file path, not sensitive)
- When PostgreSQL, `DATABASE_URL` goes in Secret (contains credentials)

### 5. `configmap-auth.yaml` - Authentication ConfigMap

```yaml
auth-config.json: |
  {
    "emailAndPassword": {
      "enabled": {{ .Values.configMap.authConfig.emailAndPassword.enabled }}
    }
  }
```
- Generates JSON from YAML values
- Mounted as file in pod

### 6. `secret.yaml` - Secret

```yaml
{{- if not .Values.secret.secretName }}
apiVersion: v1
kind: Secret
...
stringData:
  BETTER_AUTH_SECRET: {{ .Values.secret.BETTER_AUTH_SECRET | quote }}
{{- end }}
```

#### Secret Creation Logic

The chart supports two secret management scenarios:

1. **Create new Secret** (default):
   - If `secret.secretName` is empty or undefined, creates a new Secret
   - Uses `stringData` (Helm automatically encodes to base64)
   - Secret name: `{{ release-name }}-secrets`

2. **Use existing Secret**:
   - If `secret.secretName` is defined, **does not create** a new Secret
   - Deployment references the existing Secret specified in `secretName`
   - Useful for using secrets managed by External Secrets Operator, etc.

**Logic summary**:
- If `secret.secretName` empty/undefined → **creates** new Secret
- If `secret.secretName` defined → **does not create** Secret, only references existing one

### 7. `pvc.yaml` - PersistentVolumeClaim

```yaml
{{- if .Values.persistence.enabled -}}
{{- if not .Values.persistence.claimName }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "chart-deco-studio.fullname" . }}-data
spec:
  accessModes:
    - {{ .Values.persistence.accessMode }}
  resources:
    requests:
      storage: {{ .Values.persistence.size }}
{{- end }}
{{- end }}
```

#### PVC Creation Logic

The chart supports three persistence scenarios:

1. **Create new PVC** (default):
   ```yaml
   persistence:
     enabled: true
     claimName: ""  # or omit
   ```
   - Creates a new PVC with name `{{ release-name }}-data`
   - Uses parameters defined in `persistence` (size, storageClass, accessMode)

2. **Use existing PVC**:
   ```yaml
   persistence:
     enabled: true
     claimName: "my-existing-pvc"
   ```
   - **Does not create** a new PVC
   - References the existing PVC specified in `claimName`
   - Useful for reusing data from previous installations or manually created PVCs

3. **No persistence**:
   ```yaml
   persistence:
     enabled: false
   ```
   - **Does not create** PVC
   - Deployment uses `emptyDir` (temporary data, lost on pod restart)

**Logic summary**:
- If `persistence.enabled: false` → no PVC (uses `emptyDir`)
- If `persistence.enabled: true` AND `persistence.claimName` empty/undefined → **creates** new PVC
- If `persistence.enabled: true` AND `persistence.claimName` defined → **does not create** PVC, only references existing one

### 8. `serviceaccount.yaml` - ServiceAccount

```yaml
{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
...
{{- end }}
```
- Creates ServiceAccount only if `serviceAccount.create: true`

### 9. `hpa.yaml` - HorizontalPodAutoscaler

```yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
...
{{- end }}
```
- Creates HPA only if `autoscaling.enabled: true`
- When enabled, removes `replicas` from Deployment

### 10. `NOTES.txt` - Post-Installation Messages

Displays instructions after install/upgrade:

```yaml
{{- if contains "ClusterIP" .Values.service.type }}
  echo "To access the application, run:"
  echo "  kubectl port-forward svc/$SERVICE_NAME 8080:80"
{{- end }}
```
- Different messages based on Service type

## Configurable Values

### Image

```yaml
image:
  repository: ghcr.io/decocms/studio/studio
  pullPolicy: Always  # Always, IfNotPresent, Never
  tag: "latest"       # Overrides Chart.AppVersion if defined
```

### Replicas and Strategy

```yaml
replicaCount: 3  # Ignored if autoscaling.enabled: true

strategy:
  # type: ""  # Leave empty for auto-detection:
  #   - RollingUpdate: if database.engine=postgresql OR persistence.distributed=true OR accessMode=ReadWriteMany
  #   - Recreate: if SQLite with ReadWriteOnce (default)
  # rollingUpdate:
  #   maxSurge: 1
  #   maxUnavailable: 0
```

**Strategy Auto-detection**: If `strategy.type` is empty or undefined, the chart automatically detects the appropriate strategy:
- **RollingUpdate**: used when `database.engine=postgresql` OR `persistence.distributed=true` OR `accessMode=ReadWriteMany`
- **Recreate**: used by default for SQLite with ReadWriteOnce (when only one pod can mount the volume)

You can also explicitly define `strategy.type: "RollingUpdate"` or `"Recreate"` if you want to override auto-detection.

### Scalability Restrictions

- `replicaCount > 1` **is only allowed** when you have distributed storage (`persistence.distributed: true` or `accessMode: ReadWriteMany`) **or** are using PostgreSQL (`database.engine: postgresql`).
- `autoscaling.enabled: true` requires the same condition above (distributed storage or PostgreSQL).
- If these requirements are not met, keep `replicaCount: 1` and make capacity adjustments via vertical scaling (CPU/RAM).

### Service

```yaml
service:
  type: ClusterIP  # ClusterIP, NodePort, LoadBalancer
  port: 80
  targetPort: 3000
```

### Resources

```yaml
resources:
  requests:
    memory: "300Mi"
    cpu: "250m"
  limits:
    memory: "600Mi"
    cpu: "500m"
```

### Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 4
```

### Lifecycle Hooks

You can configure lifecycle hooks (preStop, postStart) to execute commands during pod lifecycle events. This is useful for graceful shutdowns, cleanup tasks, or initialization scripts.

```yaml
# Optional lifecycle hooks (preStop, postStart)
lifecycle:
  preStop:
    exec:
      command:
        - /bin/sh
        - -c
        - "sleep 5"
```

**Common use cases:**
- **preStop**: Graceful shutdown, draining connections, cleanup tasks
- **postStart**: Initialization scripts, warm-up tasks

**Important notes:**
- The `lifecycle` configuration is optional - if not defined, no lifecycle hooks will be added
- The `preStop` hook runs before the container is terminated, allowing for graceful shutdowns
- The `postStart` hook runs immediately after the container starts
- Both hooks support `exec` (command execution) or `httpGet` (HTTP requests)

**`terminationGracePeriodSeconds` (optional):** Time in seconds the pod has to terminate gracefully after receiving SIGTERM (e.g. during a rolling update). When using PostgreSQL, set this (e.g. `60`) together with a `preStop` hook so the app can drain database connections and avoid "Connection reset by peer" in the DB logs. If not set, the default is 30 seconds.

```yaml
terminationGracePeriodSeconds: 60
```

**Example with preStop hook for graceful shutdown:**
```yaml
lifecycle:
  preStop:
    exec:
      command:
        - /bin/sh
        - -c
        - "sleep 5"
```

### Persistence

```yaml
persistence:
  enabled: true
  storageClass: "efs"      # "" uses default
  accessMode: ReadWriteMany
  size: 10Gi
  claimName: ""            # If defined, uses existing PVC
  distributed: true        # Mark true if PVC offers ReadWriteMany

**Important**: mark `distributed: true` or change `accessMode` to `ReadWriteMany` when using distributed storage (EFS, NFS, CephFS, etc.). Without this, the chart will block multiple replicas and autoscaling usage.
```

### Database

```yaml
database:
  engine: sqlite        # sqlite | postgresql
  url: ""               # Required when engine=postgresql
```

- `sqlite`: uses local file `/app/data/mesh.db` (suitable for one replica).
- `postgresql`: requires `database.url` (e.g., `postgresql://user:pass@host:5432/db`) and does not require shared storage to scale horizontally.

**Security**: `DATABASE_URL` is stored securely:
- **SQLite**: goes in ConfigMap (just a file path, not sensitive)
- **PostgreSQL**: goes in Secret (contains sensitive credentials like user and password)

The Deployment automatically references the correct location (`configMapKeyRef` for SQLite or `secretKeyRef` for PostgreSQL) based on `database.engine`.

#### SSL/CA Certificates for Managed Databases

When connecting to managed databases (such as AWS RDS, Google Cloud SQL, Azure Database, etc.), it is common for the server to use self-signed SSL certificates or provider-specific Certificate Authority (CA) certificates. To ensure secure and validated connections, you can configure the provider's CA certificate.

**When to use:**
- Connecting to managed databases that require SSL certificate validation
- Providers like AWS RDS, Google Cloud SQL, Azure Database, DigitalOcean Managed Databases, etc.
- When you receive errors like `SELF_SIGNED_CERT_IN_CHAIN` or `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

**Configuration:**

```yaml
database:
  engine: postgresql
  url: "postgresql://user:password@host:5432/dbname?sslmode=verify-ca"
  caCert: |
    -----BEGIN CERTIFICATE-----
    MIID/jCCAuagAwIBAgIQdOCSuA9psBpQd8EI368/0DANBgkqhkiG9w0BAQsFADCB
    ... (complete CA certificate content)
    -----END CERTIFICATE-----

configMap:
  meshConfig:
    DATABASE_PG_SSL: "true"
    NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-cert.pem"  # Path where certificate will be mounted
```

**How to obtain the CA certificate:**

- **AWS RDS**: Download the certificate bundle for the desired region:
  ```bash
  curl -o sa-east-1-bundle.pem https://truststore.pki.rds.amazonaws.com/sa-east-1/sa-east-1-bundle.pem
  ```
  Available URLs: `https://truststore.pki.rds.amazonaws.com/{region}/{region}-bundle.pem`

- **Other providers** (Google Cloud SQL, Azure Database, DigitalOcean, etc.): Consult your managed database provider's documentation to obtain the appropriate CA certificate.

**How it works:**

1. The CA certificate is defined in `database.caCert` (complete certificate content)
2. Helm creates a ConfigMap with the certificate
3. The certificate is mounted in the pod at `/etc/ssl/certs/ca-cert.pem`
4. The `NODE_EXTRA_CA_CERTS` variable points to the mounted certificate
5. Node.js uses the certificate to validate the SSL connection with the database

**Important notes:**

- If `caCert` is not provided, the ConfigMap and volume will not be created for it
- The `NODE_EXTRA_CA_CERTS` variable is only added if `caCert` is defined
- This configuration is optional if you are running a self-managed PostgreSQL

**Complete example for AWS RDS:**

```yaml
database:
  engine: postgresql
  url: "postgresql://postgres:password@rds-instance.region.rds.amazonaws.com:5432/dbname?sslmode=verify-ca"
  caCert: |
    -----BEGIN CERTIFICATE-----
    MIID/jCCAuagAwIBAgIQdOCSuA9psBpQd8EI368/0DANBgkqhkiG9w0BAQsFADCB
    lzELMAkGA1UEBhMCVVMxIjAgBgNVBAoMGUFtYXpvbiBXZWIgU2VydmljZXMsIElu
    ... (complete bundle content)
    -----END CERTIFICATE-----

configMap:
  meshConfig:
    DATABASE_PG_SSL: "true"
    NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-cert.pem"
```

### Autoscaling

```yaml
autoscaling:
  enabled: false
  minReplicas: 3
  maxReplicas: 6
  # targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80
```

**Important**: enable autoscaling only if `persistence.distributed: true` (or `accessMode: ReadWriteMany`) or if using PostgreSQL (`database.engine: postgresql`). Otherwise, the chart will fail during render.

### ConfigMap

```yaml
configMap:
  meshConfig:
    NODE_ENV: "production"
    PORT: "3000"
    HOST: "0.0.0.0"
    BETTER_AUTH_URL: "http://localhost:8080"
    BASE_URL: "http://localhost:8080"
    # DATABASE_URL is automatically filled from database.engine/url
  
  authConfig:
    emailAndPassword:
      enabled: true
    socialProviders:
      google:
        clientId: "your-google-client-id.apps.googleusercontent.com"
        clientSecret: "your-google-client-secret"
      github:
        clientId: "your-github-client-id"
        clientSecret: "your-github-client-secret"
    saml:
      enabled: false
      providers: []
    emailProviders:
      - id: "resend-primary"
        provider: "resend"
        config:
          apiKey: "your-resend-api-key"
          fromEmail: "noreply@example.com"
    inviteEmailProviderId: "resend-primary"
    magicLinkConfig:
      enabled: true
      emailProviderId: "resend-primary"
```

### Secret

The chart supports three secret management scenarios:

1. **Create new Secret** (default):
   ```yaml
   secret:
     secretName: ""  # or omit
     BETTER_AUTH_SECRET: "change-this-to-a-secure-random-string-at-least-32-chars"
   ```
   - Creates a new Secret with name `{{ release-name }}-secrets`
   - Uses values defined in `secret` (BETTER_AUTH_SECRET and optionally DATABASE_URL for PostgreSQL)

2. **Use existing Secret**:
   ```yaml
   secret:
     secretName: "my-existing-secret"  # Name of secret that already exists in cluster
     # BETTER_AUTH_SECRET not required when using existing secret
   ```
   - **Does not create** a new Secret
   - References the existing Secret specified in `secretName`
   - The existing Secret must contain the necessary keys:
     - `BETTER_AUTH_SECRET` (required)
     - `DATABASE_URL` (required only if `database.engine=postgresql`)
   - Useful for using secrets managed by External Secrets Operator, Sealed Secrets, or other systems

3. **No Secret** (not supported):
   - Secret is always required for `BETTER_AUTH_SECRET`

**⚠️ Important**: Generate a secure secret:
```bash
openssl rand -base64 32
```

**Logic summary**:
- If `secret.secretName` empty/undefined → **creates** new Secret
- If `secret.secretName` defined → **does not create** Secret, only references existing one

### Security Context

```yaml
podSecurityContext:
  fsGroup: 1001
  fsGroupChangePolicy: "OnRootMismatch"

securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: false
```

### Node Selection

```yaml
nodeSelector:
  kubernetes.io/arch: amd64

tolerations: []
# - key: "env"
#   operator: "Equal"
#   value: "dev"
#   effect: "NoSchedule"

affinity: {}
# - podAntiAffinity:
#     preferredDuringSchedulingIgnoredDuringExecution:
#       - weight: 100
#         podAffinityTerm:
#           labelSelector:
#             matchLabels:
#               app.kubernetes.io/name: chart-deco-studio
#           topologyKey: kubernetes.io/hostname
```

### Topology Spread Constraints

```yaml
# Topology Spread Constraints (optional - leave empty [] to disable)
# IMPORTANT: labelSelector is required when topologySpreadConstraints is configured
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: chart-deco-studio
        app.kubernetes.io/instance: deco-studio
```

**Important**: The `labelSelector` is required when `topologySpreadConstraints` is configured. This ensures pods are distributed evenly across zones/availability, improving application high availability.

### Additional Volumes

```yaml
volumes: []
# - name: extra-config
#   configMap:
#     name: my-config

volumeMounts: []
# - name: extra-config
#   mountPath: "/etc/config"
#   readOnly: true
```

### Extra Containers in Pod

You can add extra containers to the Pod (such as sidecars, proxies, etc.) without removing the default application container.  
The chart always keeps the main container and **concatenates** what is defined in `extraContainers`:

```yaml
extraContainers: []
# - name: cloudsql-proxy
#   image: gcr.io/cloudsql-docker/gce-proxy:1.33.1
#   args:
#     - "/cloud_sql_proxy"
#     - "-instances=PROJECT:REGION:INSTANCE=tcp:5432"
```

- If `extraContainers` is not defined or empty, the Pod will have only the default container (current behavior).
- If you define `extraContainers`, all these containers will be added to the same Pod along with the main container.

### ServiceAccount

```yaml
serviceAccount:
  create: true
  automount: true
  annotations: {}
  name: ""  # If defined, uses this name (does not create)
```

### Naming

```yaml
nameOverride: ""        # Replaces Chart.Name
fullnameOverride: ""    # Replaces Release.Name (has priority)
```

## Usage Examples

### Example 1: Basic Deploy

```bash
helm install deco-studio . -n deco-studio --create-namespace
```

### Example 2: Deploy with Custom Values

```yaml
# production-values.yaml
replicaCount: 3

image:
  tag: "v1.0.0"

service:
  type: LoadBalancer

resources:
  requests:
    memory: "300Mi"
    cpu: "250m"
  limits:
    memory: "600Mi"
    cpu: "500m"

persistence:
  size: 10Gi
  storageClass: "efs"

configMap:
  meshConfig:
    NODE_ENV: "production"
    BASE_URL: "https://studio.example.com"
```

```bash
helm install deco-studio . -f production-values.yaml -n deco-studio --create-namespace
```

### Example 3: Deploy with Autoscaling

```yaml
# autoscaling-values.yaml
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 6
  targetMemoryUtilizationPercentage: 80

resources:
  requests:
    memory: "300Mi"
    cpu: "250m"
  limits:
    memory: "600Mi"
    cpu: "500m"
```

```bash
helm install deco-studio . -f autoscaling-values.yaml -n deco-studio --create-namespace
```

### Example 4: Deploy with Existing PVC

```yaml
# existing-pvc-values.yaml
persistence:
  enabled: true
  claimName: "existing-studio-data"  # Name of PVC that already exists in cluster
  # When claimName is defined, chart does NOT create a new PVC
  # Only references the specified existing PVC
```

```bash
# PVC must exist before installing chart
kubectl get pvc existing-studio-data -n deco-studio

# Install using existing PVC
helm install deco-studio . -f existing-pvc-values.yaml -n deco-studio --create-namespace

# Deployment will be created referencing existing PVC
# No new PVC will be created by this chart
```

**When to use**:
- Migrate data from previous installation
- Reuse data between different Helm releases
- Use PVCs created manually or by other processes

### Example 5: Deploy with PostgreSQL and CA Certificate (Managed Databases)

```yaml
# postgresql-managed-values.yaml
database:
  engine: postgresql
  url: "postgresql://postgres:password@rds-instance.sa-east-1.rds.amazonaws.com:5432/mydb?sslmode=verify-ca"
  caCert: |
    -----BEGIN CERTIFICATE-----
    MIID/jCCAuagAwIBAgIQdOCSuA9psBpQd8EI368/0DANBgkqhkiG9w0BAQsFADCB
    ... (complete CA certificate content)
    -----END CERTIFICATE-----

configMap:
  meshConfig:
    DATABASE_PG_SSL: "true"
    NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-cert.pem"

persistence:
  enabled: false  # No PVC needed when using external PostgreSQL
```

```bash
# Download CA certificate from AWS RDS (example for sa-east-1)
curl -o sa-east-1-bundle.pem https://truststore.pki.rds.amazonaws.com/sa-east-1/sa-east-1-bundle.pem

# Copy certificate content to values.yaml
cat sa-east-1-bundle.pem

# Install with managed PostgreSQL
helm install deco-studio . -f postgresql-managed-values.yaml -n deco-studio --create-namespace
```

**Note:** This example works for AWS RDS and other managed database providers. For other providers, consult the documentation to obtain the appropriate CA certificate.

### Example 6: Deploy without Persistence (Development)

```yaml
# dev-values.yaml
persistence:
  enabled: false  # Uses emptyDir (temporary data)

replicaCount: 1

resources:
  requests:
    memory: "300Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

```bash
helm install deco-studio . -f dev-values.yaml -n deco-studio --create-namespace
```

### Example 7: Deploy with Custom Name

```bash
# Uses only release name
helm install deco-studio . -n deco-studio --create-namespace

# Or completely override
helm install deco-studio . \
  --set fullnameOverride=custom-studio \
  -n deco-studio --create-namespace
```

### Example 8: Deploy with Existing Secret

```yaml
# existing-secret-values.yaml
secret:
  secretName: "external-secrets-operator-secret"  # Name of secret that already exists in cluster
  # BETTER_AUTH_SECRET not required when using existing secret
  # Existing secret must contain keys:
  #   - BETTER_AUTH_SECRET (required)
  #   - DATABASE_URL (required only if database.engine=postgresql)
```

```bash
# Secret must exist before installing chart
kubectl get secret external-secrets-operator-secret -n deco-studio

# Verify it contains necessary keys
kubectl get secret external-secrets-operator-secret -n deco-studio -o jsonpath='{.data}' | jq 'keys'

# Install using existing Secret
helm install deco-studio . -f existing-secret-values.yaml -n deco-studio --create-namespace

# Deployment will be created referencing existing Secret
# No new Secret will be created by this chart
```

**When to use**:
- Use secrets managed by External Secrets Operator, etc
- Share secrets between different Helm releases
- Use secrets created manually or by other processes

### Example 9: Deploy with Lifecycle Hook (Graceful Shutdown)

```yaml
# lifecycle-values.yaml
lifecycle:
  preStop:
    exec:
      command:
        - /bin/sh
        - -c
        - "sleep 5"
```

```bash
helm install deco-studio . -f lifecycle-values.yaml -n deco-studio --create-namespace
```

**When to use**:
- Graceful shutdown of connections before pod termination
- Cleanup tasks or resource release
- Notifying external systems about pod termination
- Draining connections or stopping background processes

**Note**: The `preStop` hook runs before the container receives the SIGTERM signal, allowing for graceful shutdowns during rolling updates or pod deletions.

## Maintenance and Updates

### Update Values

```bash
# Edit values.yaml or create new file
vim custom-values.yaml

# Update release
helm upgrade deco-studio . -f custom-values.yaml -n deco-studio

# View history
helm history deco-studio -n deco-studio

# Rollback
helm rollback deco-studio -n deco-studio
```

### Update Image

```bash
# Option 1: Update values.yaml and upgrade
helm upgrade deco-studio . \
  --set image.tag=v1.2.3 \
  -n deco-studio

# Option 2: If pullPolicy: Always, just restart
kubectl rollout restart deployment/deco-studio -n deco-studio
```

### Update ConfigMap/Secret

```bash
# Edit values.yaml
vim values.yaml

# Update
helm upgrade deco-studio . -n deco-studio

# Restart pods to pick up changes
kubectl rollout restart deployment/deco-studio -n deco-studio
```

### Verify Changes Before Applying

```bash
# See what will be generated
helm template deco-studio . -n deco-studio

# See diff between versions
helm diff upgrade deco-studio . -n deco-studio
```

### Database Backup - SQLite

```bash
# If using PVC
POD=$(kubectl get pod -l app.kubernetes.io/instance=deco-studio -n deco-studio -o jsonpath='{.items[0].metadata.name}')
kubectl cp deco-studio/$POD:/app/data/mesh.db ./backup-$(date +%Y%m%d).db
```

## Security

### Secrets Management

**⚠️ Do not commit secrets to Git!**

Recommended options:

1. **External Secrets Operator**:
```yaml
secret:
  BETTER_AUTH_SECRET: ""  # Filled via ExternalSecret
```

2. **Values via command line**:
```bash
helm install deco-studio . \
  --set secret.BETTER_AUTH_SECRET=$(cat secret.txt) \
  -n deco-studio --create-namespace
```

### Security Context

The chart already includes:
- ✅ `runAsNonRoot: true`
- ✅ `allowPrivilegeEscalation: false`
- ✅ `capabilities.drop: ALL`
- ⚠️ `readOnlyRootFilesystem: false` (can be enabled with tmpfs volumes)

## Monitoring

### Labels for Selection

All resources have standardized labels:

```bash
# View all release resources
kubectl get all -l app.kubernetes.io/instance=deco-studio -n deco-studio

# View logs
kubectl logs -l app.kubernetes.io/instance=deco-studio -n deco-studio

# View metrics
kubectl top pods -l app.kubernetes.io/instance=deco-studio -n deco-studio
```

### Health Checks

- **Liveness**: Kills and recreates pods with problems
- **Readiness**: Removes pods from Service when not ready

## Agent-sandbox runner

Mesh ships with three sandbox runners (Docker, Freestyle, agent-sandbox) for
isolating user code execution. The agent-sandbox runner uses
[`kubernetes-sigs/agent-sandbox`](https://github.com/kubernetes-sigs/agent-sandbox)
as its control loop. For self-hosters on Kubernetes it's the most scalable
option; for single-node or dev setups the Docker runner is simpler and the
default.

### Enable

```bash
helm install deco-studio deploy/helm/ \
  --set sandbox.agentSandbox.enabled=true \
  --namespace deco-studio --create-namespace
```

Then set `STUDIO_SANDBOX_RUNNER=agent-sandbox` in the mesh server environment
(`configMap.meshConfig` or `env:` in values). With `enabled=true` the chart
installs, in order:

- The vendored [`agent-sandbox`](./charts/agent-sandbox/README.md) subchart
  — operator Deployment + four `v1alpha1` CRDs (`Sandbox`, `SandboxClaim`,
  `SandboxTemplate`, `SandboxWarmPool`) in the `agent-sandbox-system`
  namespace.
- A `SandboxTemplate` named `studio-sandbox` — the shared pod template every
  `SandboxClaim` references. Image, pull policy, and resources come from
  `sandbox.agentSandbox.*`.
- A `NetworkPolicy` that scopes sandbox-pod ingress/egress (see
  [Security](#security)).
- Optionally a `SandboxWarmPool` (disabled unless
  `sandbox.agentSandbox.warmPool.enabled=true`).

With `enabled=false` (default) none of the above renders — `helm template`
emits zero sandbox-related resources.

### Prereqs

- A working Kubernetes cluster (EKS / GKE / AKS / kind / k3s — tested on
  kind locally). The subchart bundles everything the operator needs;
  there's no out-of-chart install step.
- Cluster capacity for sandbox pods. Defaults request `500m` CPU / `1Gi`
  memory per sandbox and cap at `2` CPU / `4Gi` / `10Gi` ephemeral. Tune
  via `sandbox.agentSandbox.resources.*`.
- For preview URLs (`*.preview.<domain>`), see
  [Sandbox preview ingress](#sandbox-preview-ingress) below — this is the
  standard path and uses the Gateway API + cert-manager.
- The legacy
  `sandbox.agentSandbox.networkPolicy.previewGatewayNamespace` knob is only
  needed for setups that route preview traffic *around* mesh, terminating
  directly on the sandbox's port 3000. The standard path lands on port
  9000 via mesh, where the daemon's CSP/HMR rewrites apply.

### Sandbox preview ingress

When `sandbox.agentSandbox.previewGateway.enabled=true`, the chart renders
an Istio Gateway + HTTPRoute + cert-manager Certificate that send
`*.preview.<domain>` traffic to the mesh Service. Mesh recognises the
Host header and reverse-proxies to the matching sandbox's daemon at
port 9000 — including WebSocket upgrades, so vite HMR works.

> **⚠️ Preview handles are URL-grade secrets**. The handle in
> `<handle>.preview.<domain>` is the *only* authorization check between a
> browser and a sandbox's preview surface — there is no per-user auth on
> the preview path (matching how Vercel preview URLs work). The handle
> appears in plaintext in the Host header, which means it will be logged
> in:
>
> - your CDN / load balancer access logs
> - the Istio/Envoy proxy access logs
> - any HTTP request logging the mesh Service emits
> - browser history of anyone you share the URL with
>
> Treat handles like signed URLs: do not paste them into chat, tickets,
> or screenshots intended for an audience you wouldn't grant the
> sandbox to. If you need stronger isolation, terminate auth at the
> Gateway with an `AuthorizationPolicy` (Istio) / extauth (Envoy) /
> Cloudflare Access policy in front of the listener.

Required values:

```yaml
sandbox:
  agentSandbox:
    enabled: true
    previewUrlPattern: "https://{handle}.preview.example.com"
    previewGateway:
      enabled: true
      domain: "preview.example.com"
      clusterIssuer: "cloudflare-dns01"  # name of an existing ClusterIssuer
      # Optional overrides:
      # gatewayClassName: "istio"
      # namespace: "istio-system"
```

Two things are *not* templated and have to be done by hand once per
cluster — the chart will not work end-to-end without these:

#### 1. DNS — wildcard A/CNAME

In your DNS provider (Cloudflare, Route53, etc.), add a wildcard record
pointing at the cluster's external load balancer:

```
*.preview.example.com   →   <LB hostname or IP>
```

For Cloudflare, set the record to **DNS only** (grey-cloud, not orange)
so cert-manager's DNS-01 challenge can update TXT records under the
zone. Cloudflare proxy mode (orange-cloud) blocks DNS-01.

To find the LB hostname for an Istio Gateway:

```bash
kubectl get svc -n istio-system   # look for the LoadBalancer service
```

#### 2. cert-manager DNS-01 ClusterIssuer

DNS-01 is the only solver that works for wildcard certs. The chart does
not template the ClusterIssuer because the API token is per-cluster
infrastructure. Example for Cloudflare:

```yaml
# Apply to the cluster ONCE — outside the chart.
apiVersion: v1
kind: Secret
metadata:
  name: cloudflare-api-token
  namespace: cert-manager
type: Opaque
stringData:
  api-token: "<your Cloudflare API token with Zone:DNS:Edit>"
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: cloudflare-dns01
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: cloudflare-dns01-account-key
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
```

Verify the cert provisions after `helm upgrade`:

```bash
kubectl get certificate -n istio-system
kubectl describe certificate <release>-sandbox-preview -n istio-system
```

cert-manager logs in `cert-manager` namespace are the place to look if
the cert hangs in `Pending` for more than a few minutes.

### Local kind

Pull policy defaults to `IfNotPresent` (prod). For local kind clusters
where the image is loaded via `kind load docker-image`, override:

```bash
helm install deco-studio deploy/helm/ \
  --set sandbox.agentSandbox.enabled=true \
  --set sandbox.agentSandbox.image.pullPolicy=Never \
  --kube-context kind-<your-cluster> \
  --namespace deco-studio --create-namespace
```

The repo also ships `deploy/k8s-sandbox/local/` for contributors developing
the runner itself — that path uses raw `kubectl apply` and is independent
of this Helm chart.

### Bumping the upstream operator

The `agent-sandbox` subchart pins `v0.4.2`. To update:

```bash
./deploy/helm/charts/agent-sandbox/vendor.sh vX.Y.Z
# edit charts/agent-sandbox/Chart.yaml:
#   appVersion: "X.Y.Z"
#   version: bump subchart version (e.g. 0.1.0 -> 0.2.0)
helm dependency update deploy/helm/
```

Helm never upgrades CRDs on `helm upgrade` (this is intentional upstream
behavior). After `vendor.sh` pulls a new CRD schema, apply it manually:

```bash
kubectl apply -f deploy/helm/charts/agent-sandbox/crds/agent-sandbox-crds.yaml
```

Then `helm upgrade` as normal. See `charts/agent-sandbox/README.md` for
the full story.

### Security

The default `NetworkPolicy` (`sandbox.agentSandbox.networkPolicy.enabled=true`):

- **Ingress**: allows mesh server pods (chart's own selector labels) to
  reach port 9000 (daemon) on sandbox pods; optionally allows the
  configured preview gateway namespace on port 3000 (dev server).
- **Egress**: permits DNS to CoreDNS + public internet on 80/443. Blocks
  RFC1918, `169.254.0.0/16` (link-local + IMDSv2), and the EKS pod CIDR
  (`100.64.0.0/10`) via `ipBlock.except`.

On EKS, also set IMDSv2 hop-limit=1 on the node launch template — a
misconfigured egress rule alone won't protect the node IAM role if IMDS is
reachable by hop.

## License

This chart is part of the deco-studio project.
