{{/*
Chart name (overridable via nameOverride).
*/}}
{{- define "sandbox-env.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Chart-name-and-version label.
*/}}
{{- define "sandbox-env.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
envName, validated. Required so multiple releases (dev / staging / prod)
can coexist in the shared `agent-sandbox-system` namespace without name
collisions; every other helper here suffixes with this value. Constrained
to RFC 1035 DNS labels (a-z0-9-, must start with a letter) so that the
suffixed resource names remain valid in every K8s context — Service /
Role / NetworkPolicy / Gateway names all share that constraint.
*/}}
{{- define "sandbox-env.envName" -}}
{{- $env := required "envName is required (e.g. envName=staging). Used as suffix on every resource name so multiple releases share agent-sandbox-system without collisions." .Values.envName -}}
{{- if not (regexMatch "^[a-z]([a-z0-9-]{0,30}[a-z0-9])?$" $env) -}}
{{- fail (printf "envName=%q must be a DNS label: lowercase alphanumeric or '-', start with a letter, end alphanumeric, 1-32 chars" $env) -}}
{{- end -}}
{{- $env -}}
{{- end }}

{{/*
Sandbox-pod template + warm-pool name. Both share the same name because
the SandboxWarmPool references the SandboxTemplate by name, and dashboards
keying off `app.kubernetes.io/name` get a single coherent label.
*/}}
{{- define "sandbox-env.sandboxName" -}}
{{- printf "studio-sandbox-%s" (include "sandbox-env.envName" .) -}}
{{- end }}

{{/*
Mesh runner Role / RoleBinding name. Stays under 63 chars even with a
32-char envName.
*/}}
{{- define "sandbox-env.runnerRoleName" -}}
{{- printf "studio-sandbox-runner-%s" (include "sandbox-env.envName" .) -}}
{{- end }}

{{/*
Preview Gateway / HTTPRoute / Certificate name.
*/}}
{{- define "sandbox-env.previewName" -}}
{{- printf "agent-sandbox-preview-%s" (include "sandbox-env.envName" .) -}}
{{- end }}

{{/*
Default cert-manager Secret name for the preview wildcard cert. Mirrors
the Gateway/HTTPRoute name so the cert ↔ listener pairing is obvious.
*/}}
{{- define "sandbox-env.previewTlsSecretName" -}}
{{- default (printf "agent-sandbox-preview-%s-tls" (include "sandbox-env.envName" .)) .Values.previewGateway.tlsSecretName -}}
{{- end }}

{{/*
Selector labels for sandbox pods. The runner stamps the same name label
onto every pod it creates via SandboxClaim.additionalPodMetadata, so the
NetworkPolicy podSelector can target it. Per-env, so two envs' netpols
don't accidentally apply to each other's pods.
*/}}
{{- define "sandbox-env.sandboxSelectorLabels" -}}
app.kubernetes.io/name: {{ include "sandbox-env.sandboxName" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Common labels for sandbox-* resources. component=sandbox lets dashboards
split runtime sandbox pods from operator pods and traffic-edge resources.
*/}}
{{- define "sandbox-env.sandboxLabels" -}}
helm.sh/chart: {{ include "sandbox-env.chart" . }}
{{ include "sandbox-env.sandboxSelectorLabels" . }}
app.kubernetes.io/component: sandbox
studio.decocms.com/env: {{ include "sandbox-env.envName" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Common labels for the sandbox-preview Gateway/HTTPRoute/Certificate. Same
shape as sandboxLabels but with name=studio-sandbox-preview-<env> and
component=sandbox-preview so dashboards can split traffic-edge resources
from runtime sandbox pods.
*/}}
{{- define "sandbox-env.sandboxPreviewLabels" -}}
helm.sh/chart: {{ include "sandbox-env.chart" . }}
app.kubernetes.io/name: {{ include "sandbox-env.previewName" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: sandbox-preview
studio.decocms.com/env: {{ include "sandbox-env.envName" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Common labels for non-sandbox resources owned by this chart (RBAC, etc.).
*/}}
{{- define "sandbox-env.labels" -}}
helm.sh/chart: {{ include "sandbox-env.chart" . }}
app.kubernetes.io/name: {{ include "sandbox-env.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
studio.decocms.com/env: {{ include "sandbox-env.envName" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Validate shared build cache configuration. When cache.enabled=true and
accessMode is ReadWriteMany, storageClass must be explicitly set — the
cluster default StorageClass on EKS is EBS (gp2/gp3), which does not
support ReadWriteMany. Without this guard the PVC provisions against the
wrong driver and stays Pending with an opaque provisioner error.
*/}}
{{- define "sandbox-env.validateCache" -}}
{{- if .Values.cache.enabled }}
{{- if and (eq .Values.cache.accessMode "ReadWriteMany") (not .Values.cache.storageClass) }}
{{- fail "sandbox-env: cache.enabled=true with accessMode=ReadWriteMany requires cache.storageClass to be set explicitly. The cluster default StorageClass on EKS is EBS (gp2/gp3), which does not support ReadWriteMany — the PVC will stay Pending forever. On EKS: install the AWS EFS CSI driver, create an EFS-backed StorageClass (e.g. efs-sc with throughputMode: elastic), and set cache.storageClass=efs-sc. On single-node kind: override to cache.accessMode=ReadWriteOnce and cache.storageClass=standard (see examples/values-kind.yaml)." -}}
{{- end }}
{{- end }}
{{- end }}

{{/*
Validate that Gateway API + cert-manager CRDs are present when the sandbox
preview gateway is enabled. Without this check, `helm install` would push
Gateway/HTTPRoute/Certificate to an API server that doesn't know those
kinds — the failure mode is an opaque "no matches for kind" rejection,
sometimes after partial-apply. Failing at template time keeps the release
atomic and gives a pointer to the right install command.
*/}}
{{- define "sandbox-env.validatePreviewGateway" -}}
{{- if .Values.previewGateway.enabled }}
{{- if not (.Capabilities.APIVersions.Has "gateway.networking.k8s.io/v1") }}
{{- fail "sandbox-env: previewGateway.enabled=true requires the Gateway API CRDs (gateway.networking.k8s.io/v1). Install: kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.1.0/standard-install.yaml — and a Gateway controller (Istio, Envoy Gateway, Cilium, ...) implementing the chosen gatewayClassName." -}}
{{- end }}
{{- if not (.Capabilities.APIVersions.Has "cert-manager.io/v1") }}
{{- fail "sandbox-env: previewGateway.enabled=true requires cert-manager (cert-manager.io/v1). Install: helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true" -}}
{{- end }}
{{- end }}
{{- end }}
