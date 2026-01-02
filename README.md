<img alt="MCP Mesh Readme Banner" src="https://github.com/user-attachments/assets/e6283421-71ff-478d-8c45-9fb67d484888" />

<h1 align="center">MCP Mesh</h1>

<p align="center">
<em>MCP-native · TypeScript-first · Deploy anywhere</em><br/><br/>
<b>One secure endpoint for every MCP server.</b>
</p>

<p align="center">
<a href="https://docs.deco.page/">📘 Docs</a> ·
<a href="https://decocms.com/discord">💬 Discord</a> ·
<a href="https://decocms.com/mesh">🌐 decocms.com/mesh</a>
</p>

> **TL;DR:**
> - Route all MCP traffic through a single governed endpoint
> - Enforce RBAC, policies, and audit trails at the control plane
> - Full observability with OpenTelemetry — traces, costs, errors
> - Runtime strategies as gateways for optimal tool selection 
> - Self-host with Docker, Bun/Node, Kubernetes, or run locally

---

## What is an MCP Mesh?

**MCP Mesh** is an open-source control plane for MCP traffic. It sits between your MCP clients (Cursor, Claude, Windsurf, VS Code, custom agents) and your MCP servers, providing a unified layer for auth, routing and observability.

It replaces M×N integrations (M MCP servers × N clients) with one production endpoint, so you stop maintaining separate configs in every client. Built for multi-tenant orgs: workspace/project scoping for policies, credentials, and logs.

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Clients                             │
│         Cursor · Claude · VS Code · Custom Agents               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MCP MESH                                │
│       Gateway · Policy Engine · Observability · Token Vault     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Servers                               │
│      Salesforce · Slack · GitHub · Postgres · Your APIs         │
└─────────────────────────────────────────────────────────────────┘
```
---

## Quick Start

```bash
# Clone and install
git clone https://github.com/decocms/mesh.git
bun install

# Run locally (client + API server)
bun run dev
```

→ runs at [http://localhost:3000](http://localhost:3000) (client) + API server

Or use `npx @decocms/mesh` to instantly get a mesh running.

---

## Runtime strategies as gateways

As tool surfaces grow, “send every tool definition to the model on every call” gets expensive and slow.
The mesh models runtime strategies as gateways: one endpoint, different ways of exposing tools.

Examples:
- Full-context: expose everything (simple and deterministic for small toolsets)
- Smart selection: narrow the toolset before execution
- Code execution: load tools on demand and run code in a sandbox

Gateways are configurable and extensible. You can add new strategies and also curate toolsets (see Virtual MCPs).

---

## Core Capabilities

| Capability | What it does |
|-------|-------------|
| **MeshContext** | Unified runtime interface providing auth, storage, observability, and policy control |
| **defineTool()** | Declarative API for typed, auditable, observable MCP tools |
| **AccessControl** | Fine-grained RBAC via Better Auth — OAuth 2.1 + API keys per workspace/project |
| **Multi-tenancy** | Workspace/project isolation for config, credentials, policies, and audit logs |
| **OpenTelemetry** | Full tracing and metrics for tools, workflows, and UI interactions |
| **Storage Adapters** | Kysely ORM → SQLite / Postgres, easily swapped |
| **Proxy Layer** | Secure bridge to remote MCP servers with token vault + OAuth |
| **Virtual MCPs** | Compose and expose governed toolsets as new MCP servers |
| **Event Bus** | Pub/sub between connections with scheduled/cron delivery and at-least-once guarantees |
| **Bindings** | Capability contracts (ex.: agents, workflows, views) so apps target interfaces instead of specific MCP implementations |

---

## STDIO Connections (Local MCPs)

Run npx packages or custom scripts as MCP servers. Mesh passes credentials via environment variables:

```bash
# Mesh spawns your MCP with these env vars:
MESH_TOKEN=<jwt>        # Infinite-expiry JWT for mesh API calls
MESH_URL=<url>          # Mesh instance URL
MESH_STATE=<json>       # Binding values as JSON
```

Your MCP just reads `process.env.MESH_TOKEN` — no special configuration tools needed. This mirrors how HTTP connections receive `x-mesh-token` headers.

→ See [Building STDIO MCPs](https://docs.deco.page/en/mcp-mesh/mcp-servers) for examples in [decocms/mcps](https://github.com/decocms/mcps).

---

## Define Tools

Tools are first-class citizens. Type-safe, audited, observable, and callable via MCP.

```ts
import { z } from "zod";
import { defineTool } from "~/core/define-tool";

export const CONNECTION_CREATE = defineTool({
  name: "CONNECTION_CREATE",
  description: "Create a new MCP connection",
  inputSchema: z.object({
    name: z.string(),
    connection: z.object({
      type: z.enum(["HTTP", "SSE", "WebSocket"]),
      url: z.string().url(),
      token: z.string().optional(),
    }),
  }),
  outputSchema: z.object({
    id: z.string(),
    scope: z.enum(["workspace", "project"]),
  }),
  handler: async (input, ctx) => {
    await ctx.access.check();
    const conn = await ctx.storage.connections.create({
      projectId: ctx.project?.id ?? null,
      ...input,
      createdById: ctx.auth.user!.id,
    });
    return { id: conn.id, scope: conn.projectId ? "project" : "workspace" };
  },
});
```

Every tool call automatically gets: input/output validation, access control checks, audit logging, and OpenTelemetry traces.

---

## Project Structure

```
├── apps/
│   ├── mesh/                # Full-stack MCP Mesh (Hono API + Vite/React)
│   │   ├── src/
│   │   │   ├── api/         # Hono HTTP + MCP proxy routes
│   │   │   ├── auth/        # Better Auth (OAuth + API keys)
│   │   │   ├── core/        # MeshContext, AccessControl, defineTool
│   │   │   ├── tools/       # Built-in MCP management tools
│   │   │   ├── storage/     # Kysely DB adapters
│   │   │   ├── event-bus/   # Pub/sub event delivery system
│   │   │   ├── encryption/  # Token vault & credential management
│   │   │   ├── observability/  # OpenTelemetry tracing & metrics
│   │   │   └── web/         # React 19 admin UI
│   │   └── migrations/      # Kysely database migrations
│   └── docs/                # Astro documentation site
│
└── packages/
    ├── bindings/            # Core MCP bindings and connection abstractions
    ├── runtime/             # MCP proxy, OAuth, and runtime utilities
    ├── ui/                  # Shared React components (shadcn-based)
    ├── cli/                 # CLI tooling (deco commands)
    ├── create-deco/         # Project scaffolding (npm create deco)
    └── vite-plugin-deco/    # Vite plugin for Deco projects
```

---

## Development

```bash
# Install dependencies
bun install

# Run dev server (client + API)
bun run dev

# Run tests
bun test

# Type check
bun run check

# Lint
bun run lint

# Format
bun run fmt
```

### Mesh-specific commands (from `apps/mesh/`)

```bash
bun run dev:client     # Vite dev server (port 4000)
bun run dev:server     # Hono server with hot reload
bun run migrate        # Run database migrations
```

---

## Deploy Anywhere

```bash
# Docker Compose (SQLite)
docker compose -f deploy/docker-compose.yml up

# Docker Compose (PostgreSQL)
docker compose -f deploy/docker-compose.postgres.yml up

# Self-host with Bun
bun run build:client && bun run build:server
bun run start

# Kubernetes
kubectl apply -f k8s/
```

Runs on any infrastructure — Docker, Kubernetes, AWS, GCP, or local Bun/Node runtimes. No vendor lock-in.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Bun / Node |
| Language | TypeScript + Zod |
| Framework | Hono (API) + Vite + React 19 |
| Database | Kysely → SQLite / PostgreSQL |
| Auth | Better Auth (OAuth 2.1 + API keys) |
| Observability | OpenTelemetry |
| UI | React 19 + Tailwind v4 + shadcn |
| Protocol | Model Context Protocol (MCP) |

---

## Roadmap

- [ ] Multi-tenant admin dashboard
- [ ] MCP bindings (swap providers without rewrites)
- [ ] Version history for mesh configs
- [ ] NPM package runtime
- [ ] Edge debugger / live tracing
- [ ] Cost analytics and spend caps
- [ ] MCP Store — discover and install pre-built MCP apps

---

## Part of deco CMS

The MCP Mesh is the infrastructure layer of [decoCMS](https://decocms.com).

| Layer | What it does |
|-------|--------------|
| **MCP Mesh** | Connect, govern, and observe MCP traffic |
| **MCP Studio** (coming soon) | Package durable MCP capabilities into shareable apps (SDK + no-code admin) |
| **MCP Store** (coming soon) | Discover, install (and eventually monetize) pre-built MCP apps. |

---

## License

The MCP Mesh ships with a **Sustainable Use License (SUL)**. See [LICENSE.md](./LICENSE.md).

- ✅ Free to self-host for internal use
- ✅ Free for client projects (agencies, SIs)
- ⚠️ Commercial license required for SaaS or revenue-generating production systems

Questions? [contact@decocms.com](mailto:contact@decocms.com)

---

## Contributing

We welcome contributions! Run the following before submitting a PR:

```bash
bun run fmt      # Format code
bun run lint     # Check linting
bun test         # Run tests
```

See `AGENTS.md` for detailed coding guidelines and conventions.

---

<div align="center">
  <sub>Made with ❤️ by the <a href="https://decocms.com">deco</a> community</sub>
</div>
