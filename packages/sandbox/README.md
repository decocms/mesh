# @decocms/sandbox

Isolated per-user sandboxes for MCP tool execution.

## URL shape

- **Prod**: `https://<handle>.<root>/*` → pod dev server on `:3000`
  and `/_daemon/*` → pod daemon on `:9000` (server-to-server bearer auth).
- **Local dev**: `http://<handle>.localhost:7070/*`.

Handles are `<branch-slug>-<hash5>` (or a bare 5-char hash when no branch is
set), DNS-label safe (RFC 1035 caps labels at 63). The hash portion is a
truncated SHA256 of `userId:projectRef`; collisions are bounded per-project.
The URL itself is the routing key, not a capability — daemon endpoints
require a bearer token.

## Local dev

The local ingress forwarder binds both `127.0.0.1` and `::1` on
`SANDBOX_INGRESS_PORT` (default `7070`) and routes requests by `Host:` header.
macOS and Linux resolve `*.localhost` to loopback natively, so **no extra DNS
setup is required** — `http://<handle>.localhost:7070/` just works.

Port `7070` (not `7000`) because macOS's AirPlay Receiver binds port 7000 and
would intercept Chrome's IPv6 connection attempt.

If you previously configured `/etc/resolver/localhost` or `/etc/hosts` entries
for this, you can remove them — they're no longer needed.

## Environment

- `SANDBOX_INGRESS_PORT` (default `7070`) — local forwarder bind port.
- `SANDBOX_ROOT_URL` — production template for the pod URL. Either a bare
  base (`https://sandboxes.example.com` → handle becomes leading subdomain)
  or a `{handle}` template (`https://{handle}.sandboxes.example.com`).
- `MESH_LOCAL_SANDBOX_INGRESS=1` — force the local forwarder on even when
  `NODE_ENV=production` (single-tenant self-hosted setups).
