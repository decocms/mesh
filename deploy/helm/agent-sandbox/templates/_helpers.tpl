{{/*
Chart name (overridable via nameOverride).
*/}}
{{- define "agent-sandbox.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Chart-name-and-version label.
*/}}
{{- define "agent-sandbox.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Selector labels for sandbox pods. Uses a fixed `studio-sandbox` name (not
the chart name) because the sandbox runner stamps this same label onto
every pod it creates via SandboxClaim.additionalPodMetadata, and the
runner has no easy way to read the chart name. The NetworkPolicy
podSelector targets these labels.
*/}}
{{- define "agent-sandbox.sandboxSelectorLabels" -}}
app.kubernetes.io/name: studio-sandbox
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Common labels for sandbox-* resources. component=sandbox lets dashboards
split runtime sandbox pods from operator pods and traffic-edge resources.
*/}}
{{- define "agent-sandbox.sandboxLabels" -}}
helm.sh/chart: {{ include "agent-sandbox.chart" . }}
{{ include "agent-sandbox.sandboxSelectorLabels" . }}
app.kubernetes.io/component: sandbox
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Common labels for the sandbox-preview Gateway/HTTPRoute/Certificate. Same
shape as sandboxLabels but with name=studio-sandbox-preview and
component=sandbox-preview so dashboards can split traffic-edge resources
from runtime sandbox pods.
*/}}
{{- define "agent-sandbox.sandboxPreviewLabels" -}}
helm.sh/chart: {{ include "agent-sandbox.chart" . }}
app.kubernetes.io/name: studio-sandbox-preview
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: sandbox-preview
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Common labels for non-sandbox resources owned by this chart (RBAC, etc.).
*/}}
{{- define "agent-sandbox.labels" -}}
helm.sh/chart: {{ include "agent-sandbox.chart" . }}
app.kubernetes.io/name: {{ include "agent-sandbox.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Validate that the chart is being installed into agent-sandbox-system. The
vendored upstream operator manifest (templates/agent-sandbox-manifest.yaml)
ships its own Namespace object and hardcodes that name across its
ServiceAccount, Service, Deployment, and ClusterRoleBinding. The Studio-side
templates (SandboxTemplate, NetworkPolicy, Role, WarmPool) also reference
agent-sandbox-system explicitly so they live alongside the operator.
Installing under any other namespace splits resources across two namespaces
and breaks reconciliation in non-obvious ways — fail at template time
instead.
*/}}
{{- define "agent-sandbox.validateNamespace" -}}
{{- if ne .Release.Namespace "agent-sandbox-system" -}}
{{- fail (printf "agent-sandbox: this chart must be installed into the 'agent-sandbox-system' namespace (got %q). The vendored upstream operator manifest hardcodes that namespace; installing elsewhere splits resources across namespaces. Re-run with --namespace agent-sandbox-system --create-namespace." .Release.Namespace) -}}
{{- end -}}
{{- end }}

{{/*
Validate that Gateway API + cert-manager CRDs are present when the sandbox
preview gateway is enabled. Without this check, `helm install` would push
Gateway/HTTPRoute/Certificate to an API server that doesn't know those
kinds — the failure mode is an opaque "no matches for kind" rejection,
sometimes after partial-apply. Failing at template time keeps the release
atomic and gives a pointer to the right install command.
*/}}
{{- define "agent-sandbox.validatePreviewGateway" -}}
{{- if .Values.previewGateway.enabled }}
{{- if not (.Capabilities.APIVersions.Has "gateway.networking.k8s.io/v1") }}
{{- fail "agent-sandbox: previewGateway.enabled=true requires the Gateway API CRDs (gateway.networking.k8s.io/v1). Install: kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.1.0/standard-install.yaml — and a Gateway controller (Istio, Envoy Gateway, Cilium, ...) implementing the chosen gatewayClassName." -}}
{{- end }}
{{- if not (.Capabilities.APIVersions.Has "cert-manager.io/v1") }}
{{- fail "agent-sandbox: previewGateway.enabled=true requires cert-manager (cert-manager.io/v1). Install: helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true" -}}
{{- end }}
{{- end }}
{{- end }}
