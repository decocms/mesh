# @decocms/sandbox

Isolated per-user sandboxes for MCP tool execution.

One sandbox per `(userId, projectRef)`: a container (or VM) holding a checked-out
repo plus an in-pod daemon that proxies exec, file ops, and the dev server.
Callers go through a single `SandboxRunner` interface; the runner decides how
the sandbox is provisioned and reached.

## Runners

Three runner backends live behind the common `SandboxRunner` interface
(`server/runner/types.ts`):

- **Docker** (`./runner`) — default for local dev. Spawns containers via the
  local Docker CLI and routes browser traffic through an in-process ingress
  bound on `SANDBOX_INGRESS_PORT`.
- **Freestyle** (`./runner/freestyle`) — hosted VMs. Preview URL is a
  Freestyle-provided HTTPS domain; daemon traffic is base64-wrapped to clear
  Cloudflare WAF. SDKs are `optionalDependencies` and only pulled in when this
  runner is selected.
- **agent-sandbox** (`./runner/agent-sandbox`) — one `SandboxClaim` per sandbox
  against the [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox)
  operator. Mesh talks to pods via apiserver port-forward in dev; in prod,
  `previewUrlPattern` switches the preview URL to real ingress and skips the
  dev forward.

### Selection

The host app calls `resolveRunnerKindFromEnv()` / `tryResolveRunnerKindFromEnv()`
from `./runner`:

1. `STUDIO_SANDBOX_RUNNER=docker|freestyle|agent-sandbox` wins when set.
2. Otherwise, `FREESTYLE_API_KEY` present → `freestyle`.
3. Otherwise, in `NODE_ENV=production` → unresolved (strict variant throws).
4. Otherwise (dev) → `docker` if the CLI is on `PATH`, else unresolved.

agent-sandbox is **explicit-only** — it's never auto-selected, so docker-only
deploys don't accidentally need a kubeconfig.

## URL shape

- **Prod**: `https://<handle>.<root>/*` → pod dev server on `:3000`
  and `/_daemon/*` → pod daemon on `:9000` (server-to-server bearer auth).
- **Local dev**: `http://<handle>.localhost:7070/*`.

Handles are `<branch-slug>-<hash5>` (or a bare 5-char hash when no branch is
set), DNS-label safe (RFC 1035 caps labels at 63). The hash portion is a
truncated SHA256 of `userId:projectRef`; collisions are bounded per-project.
The URL itself is the routing key, not a capability — daemon endpoints
require a bearer token.

## Local dev (Docker)

The local ingress forwarder binds both `127.0.0.1` and `::1` on
`SANDBOX_INGRESS_PORT` (default `7070`) and routes requests by `Host:` header.
macOS and Linux resolve `*.localhost` to loopback natively, so **no extra DNS
setup is required** — `http://<handle>.localhost:7070/` just works.

Port `7070` (not `7000`) because macOS's AirPlay Receiver binds port 7000 and
would intercept Chrome's IPv6 connection attempt.

If you previously configured `/etc/resolver/localhost` or `/etc/hosts` entries
for this, you can remove them — they're no longer needed.

## Environment

- `STUDIO_SANDBOX_RUNNER` — pin the runner: `docker`, `freestyle`, or
  `agent-sandbox`. Leave unset in dev to let auto-detect pick docker.
- `FREESTYLE_API_KEY` — required for the Freestyle runner. Presence also
  auto-selects it when `STUDIO_SANDBOX_RUNNER` is unset.
- `MESH_SANDBOX_IMAGE` — override the Docker runner image
  (default `mesh-sandbox:local`, built from `image/Dockerfile`).
- `SANDBOX_INGRESS_PORT` (default `7070`) — local Docker ingress bind port.
- `SANDBOX_ROOT_URL` — production template for the pod URL. Either a bare
  base (`https://sandboxes.example.com` → handle becomes leading subdomain)
  or a `{handle}` template (`https://{handle}.sandboxes.example.com`).
- `MESH_LOCAL_SANDBOX_INGRESS=1` — force the local forwarder on even when
  `NODE_ENV=production` (single-tenant self-hosted setups).
