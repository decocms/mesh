# Hello, World!

Welcome to **MCP Mesh** - an open-source control plane for MCP (Model Context Protocol) traffic.

## What is this project?

MCP Mesh sits between your MCP clients (like Cursor, Claude, VS Code, or custom agents) and your MCP servers, providing a unified layer for authentication, routing, and observability.

### The Problem It Solves

Without MCP Mesh, you face **M×N integrations** - every MCP server needs separate configuration in every client. MCP Mesh replaces this complexity with **one production endpoint**, eliminating the need to maintain separate configs across tools.

### Key Capabilities

- **Unified Routing** - Route all MCP traffic through a single governed endpoint
- **Access Control** - Fine-grained RBAC with OAuth 2.1 and API keys per workspace/project
- **Multi-tenancy** - Workspace and project isolation for configs, credentials, policies, and audit logs
- **Observability** - Full OpenTelemetry integration for tracing, metrics, costs, and errors
- **Virtual MCPs** - Compose and expose governed toolsets as new MCP servers
- **Token Vault** - Secure bridge to remote MCP servers with credential management

### Tech Stack

- **Runtime**: Bun / Node
- **Language**: TypeScript + Zod
- **Framework**: Hono (API) + Vite + React 19
- **Database**: Kysely with SQLite / PostgreSQL
- **Auth**: Better Auth (OAuth 2.1 + API keys)
- **UI**: React 19 + Tailwind v4 + shadcn

## Getting Started

```bash
# Clone and install
git clone https://github.com/decocms/mesh.git
bun install

# Run locally
bun run dev
```

This starts the client at http://localhost:3000 plus the API server.

## Part of deco CMS

MCP Mesh is the infrastructure layer of [decoCMS](https://decocms.com), providing the foundation for connecting, governing, and observing MCP traffic.

---

Happy building!
