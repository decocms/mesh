# agent-sandbox Helm chart

Standalone Helm chart for the mesh / Studio k8s sandbox runner. Installs
the upstream [`kubernetes-sigs/agent-sandbox`](https://github.com/kubernetes-sigs/agent-sandbox)
operator + CRDs (vendored — upstream doesn't publish a Helm chart as of
v0.4.2) and the Studio-side resources that consume them: `SandboxTemplate`,
RBAC, `NetworkPolicy`, optional `SandboxWarmPool`, optional preview
`Gateway` + `Certificate`.

This chart is **deployed independently** of the studio (`chart-deco-studio`)
chart, typically as its own ArgoCD `Application`. Cross-chart wiring lives
under `mesh.*` values: tell this chart where the studio release runs so the
RBAC `RoleBinding`, `NetworkPolicy` ingress selector, and preview
`HTTPRoute` `backendRef` can reach it.

Pinned upstream version: **v0.4.2** (see `Chart.yaml` `appVersion`).

## Install

Published as an OCI artifact at
`oci://ghcr.io/decocms/studio/charts/agent-sandbox` by
`.github/workflows/release-agent-sandbox-chart.yaml`.

```bash
helm install agent-sandbox \
  oci://ghcr.io/decocms/studio/charts/agent-sandbox \
  --version 0.1.0 \
  --namespace agent-sandbox-system --create-namespace \
  --set mesh.namespace=deco-studio \
  --set mesh.serviceAccountName=deco-studio \
  --set mesh.serviceName=deco-studio \
  --set mesh.servicePort=80
```

Then point the studio (chart-deco-studio) release at this runner:

```yaml
# in your studio values.yaml
configMap:
  meshConfig:
    STUDIO_SANDBOX_RUNNER: "agent-sandbox"
    STUDIO_SANDBOX_PREVIEW_URL_PATTERN: "https://{handle}.preview.example.com"
```

### ArgoCD Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: agent-sandbox
  namespace: argocd
spec:
  project: default
  source:
    repoURL: ghcr.io/decocms/studio/charts
    chart: agent-sandbox
    targetRevision: 0.1.0
    helm:
      values: |
        mesh:
          namespace: deco-studio
          serviceAccountName: deco-studio
          serviceName: deco-studio
          servicePort: 80
  destination:
    server: https://kubernetes.default.svc
    namespace: agent-sandbox-system
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

## Layout

```
agent-sandbox/
├── Chart.yaml
├── values.yaml                          # tunables + mesh.* cross-refs
├── vendor.sh                            # re-fetches upstream YAML
├── examples/
│   └── values-kind.yaml                 # local dev overrides
├── crds/
│   └── agent-sandbox-crds.yaml          # vendored CRDs
└── templates/
    ├── _helpers.tpl
    ├── validations.yaml                 # Gateway API + cert-manager preflight
    ├── agent-sandbox-manifest.yaml      # vendored upstream operator
    ├── sandbox-template.yaml            # SandboxTemplate (studio-sandbox)
    ├── sandbox-warm-pool.yaml           # SandboxWarmPool (optional)
    ├── sandbox-network-policy.yaml      # NetworkPolicy on sandbox pods
    ├── sandbox-rbac.yaml                # Role + cross-ns RoleBinding to mesh SA
    ├── sandbox-preview-cert.yaml        # cert-manager Certificate (optional)
    └── sandbox-preview-gateway.yaml     # Gateway + HTTPRoute (optional)
```

`vendor.sh` splits upstream multi-doc YAML on `kind: CustomResourceDefinition`
boundaries and routes each doc into `crds/` or `templates/`.

## Values

See `values.yaml` for the full set. The most-tuned ones:

| Key | Default | Notes |
| --- | --- | --- |
| `image.repository` | `ghcr.io/decocms/studio/studio-sandbox` | studio-sandbox image |
| `image.tag` | chart `appVersion` | bump in lockstep with packages/sandbox/package.json |
| `resources.*` | 0.5/2 CPU, 1/4Gi RAM | per sandbox pod |
| `nodeSelector` / `tolerations` / `affinity` | `{}` | for sandbox isolation NodePool |
| `hostUsers` | `false` | userns remap; flip to `true` if kernel/containerd doesn't support userns |
| `readOnlyRootFilesystem` | `true` | RO rootfs + emptyDirs on /app, /tmp, /home |
| `networkPolicy.enabled` | `true` | locks down ingress/egress |
| `warmPool.enabled` / `warmPool.size` | `false` / `0` | only after measuring cold-start pain |
| `previewGateway.enabled` | `false` | wildcard `*.preview.<domain>` Gateway + cert |
| `mesh.namespace` | `deco-studio` | studio release namespace |
| `mesh.serviceAccountName` | `deco-studio` | mesh ServiceAccount that gets the RoleBinding |
| `mesh.serviceName` | `deco-studio` | mesh Service the preview HTTPRoute targets |
| `mesh.servicePort` | `80` | match studio's `service.port` |
| `mesh.podSelectorLabels` | `chart-deco-studio` / `deco-studio` | for the NetworkPolicy ingress rule |

## CRD upgrade caveat

Helm install-applies files under `crds/` on first install but **never
upgrades them** (intentional Helm design choice). After bumping
`appVersion` via `./vendor.sh`, run:

```bash
kubectl apply -f deploy/helm/agent-sandbox/crds/agent-sandbox-crds.yaml
# then helm upgrade as normal
```

Uninstall + reinstall also works but drops existing `SandboxClaim`s.

## Bumping upstream version

```bash
./vendor.sh v0.4.3               # re-fetches + re-splits, requires sha256 in KNOWN_CHECKSUMS
# edit Chart.yaml: appVersion -> "0.4.3"
# bump version: 0.1.0 -> 0.2.0
```

Push to `main` — `release-agent-sandbox-chart.yaml` packages and pushes
the new OCI tag to `ghcr.io`. Argo CD picks it up by the `targetRevision`
in the `Application` manifest.

Check upstream release notes for CRD schema changes — if `sandboxtemplates`
or `sandboxwarmpools` shape changes, `templates/sandbox-template.yaml` and
`templates/sandbox-warm-pool.yaml` may need corresponding edits.

## Why not an upstream Helm chart?

Upstream hasn't published one as of v0.4.2. Filing a request with prior
art pointing at this chart is worthwhile — if upstream ships an official
chart, the vendored copy goes away and this chart switches to a `dependencies:`
entry pointing at upstream's repo.
