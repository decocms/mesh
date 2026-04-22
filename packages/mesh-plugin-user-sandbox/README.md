# mesh-plugin-user-sandbox

Isolated per-user sandboxes for MCP tool execution.

## URL shape

- **Prod**: `https://<handle>.sandboxes.<root>/*` → pod dev server on `:3000`
  and `/_daemon/*` → pod daemon on `:9000` (server-to-server bearer auth).
- **Local dev**: `http://<handle>.sandboxes.localhost:7000/*`.

Handles are a 256-bit random hex string — the URL itself is the capability.

## Local dev setup (one-time)

The local ingress forwarder binds `127.0.0.1:SANDBOX_INGRESS_PORT` (default
`7000`) and routes requests by `Host:` header. You need DNS to resolve
`*.sandboxes.localhost` back to `127.0.0.1`.

### dnsmasq

Add to your dnsmasq config:

```
address=/sandboxes.localhost/127.0.0.1
```

Then restart dnsmasq. macOS Homebrew:

```sh
sudo brew services restart dnsmasq
```

### resolv.conf

Point `.localhost` lookups at your local dnsmasq:

```
# /etc/resolver/localhost (macOS)
nameserver 127.0.0.1
```

### /etc/hosts (single-handle fallback)

If dnsmasq is overkill, you can hand-add a line per handle:

```
127.0.0.1 <handle>.sandboxes.localhost
```

Wildcards aren't supported in `/etc/hosts`, so this only works for a fixed
set of handles.

## Environment

- `SANDBOX_INGRESS_PORT` (default `7000`) — local forwarder bind port.
- `SANDBOX_ROOT_URL` — production template for the pod URL. Either a bare
  base (`https://sandboxes.example.com` → handle becomes leading subdomain)
  or a `{handle}` template (`https://{handle}.sandboxes.example.com`).
- `MESH_LOCAL_SANDBOX_INGRESS=1` — force the local forwarder on even when
  `NODE_ENV=production` (single-tenant self-hosted setups).
