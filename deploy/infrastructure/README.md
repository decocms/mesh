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
