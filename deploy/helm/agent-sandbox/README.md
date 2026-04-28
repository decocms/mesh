# agent-sandbox subchart

Local Helm subchart that vendors
[`kubernetes-sigs/agent-sandbox`](https://github.com/kubernetes-sigs/agent-sandbox)
so the parent `chart-deco-studio` can install the operator + CRDs for the
mesh k8s sandbox runner. Upstream does not publish a Helm chart as of
v0.4.2 — only raw `manifest.yaml` + `extensions.yaml` release assets — so
we vendor the YAML here and reference the subchart via `file://`.

Version pin: **v0.4.2** (see `Chart.yaml` `appVersion`).

## Layout

```
agent-sandbox/
├── Chart.yaml
├── values.yaml                        # intentionally empty — no tunables
├── vendor.sh                          # re-fetch upstream YAML on version bump
├── crds/
│   └── agent-sandbox-crds.yaml        # all CustomResourceDefinition docs
└── templates/
    └── agent-sandbox-manifest.yaml    # Deployment, RBAC, Namespace, Service, ServiceAccount
```

Upstream `extensions.yaml` and `manifest.yaml` both contain a mix of CRDs
and non-CRD resources (controller Deployment, RBAC, Namespace). `vendor.sh`
splits on `kind: CustomResourceDefinition` at document boundaries and
routes each doc to the right directory.

## CRD upgrade caveat

Helm installs files in `crds/` on first install but **never upgrades
them** (this is an intentional Helm design choice — CRD upgrades are
treated as a manual operation because schema changes can break existing
custom resources). That's acceptable for mesh because:

- Upstream pin is tight (v0.4.2).
- CRD schema changes are rare between upstream patch releases.

To pick up upstream CRD schema changes after running `vendor.sh`:

```bash
kubectl apply -f deploy/helm/charts/agent-sandbox/crds/agent-sandbox-crds.yaml
# then helm upgrade as normal
```

Uninstall + reinstall also works but drops existing SandboxClaims.

## Bumping upstream version

```bash
./vendor.sh v0.4.3               # re-fetches + re-splits
# edit Chart.yaml: appVersion -> "0.4.3"
# bump version: ... (subchart version; e.g. 0.1.0 -> 0.2.0)
helm dependency update ../../    # refresh parent Chart.lock
```

Check the upstream release notes for CRD schema changes — if the
`sandboxtemplates` or `sandboxwarmpools` CRD shape changes, the parent
chart's `templates/sandbox-template.yaml` and `templates/sandbox-warm-pool.yaml`
may need corresponding edits.

## Why not an upstream Helm chart?

Upstream hasn't published one. Filing a request with prior art pointing at
this subchart is worthwhile — if it lands, this vendored copy goes away
and the parent chart switches to `repository: oci://...` or a Helm repo.
Not a blocker for mesh.
