# Hello, World!

Welcome to **MCP Mesh** - an open-source control plane for Model Context Protocol (MCP) traffic.

## What We're Building

MCP Mesh is a full-stack platform for orchestrating MCP connections, tools, and AI agents. It sits between MCP clients (Cursor, Claude, VS Code, custom agents) and MCP servers, providing a unified layer for authentication, routing, and observability.

### The Problem We Solve

Without MCP Mesh, you have M×N integrations: M MCP servers × N clients, each requiring separate configs. MCP Mesh replaces this complexity with one production endpoint, so you stop maintaining separate configurations in every client.

### Core Capabilities

- **Virtual MCPs** - Runtime strategies for optimal tool selection
- **Access Control** - Fine-grained RBAC via OAuth 2.1 + API keys
- **Multi-tenancy** - Workspace/project isolation for configs, credentials, and logs
- **Observability** - Full tracing with OpenTelemetry
- **Token Vault** - Secure credential management
- **Event Bus** - Pub/sub between connections with at-least-once delivery

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Clients                             │
│         Cursor · Claude · VS Code · Custom Agents               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MCP MESH                                │
│     Virtual MCP · Policy Engine · Observability · Token Vault   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Servers                               │
│      Salesforce · Slack · GitHub · Postgres · Your APIs         │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun / Node |
| Language | TypeScript + Zod |
| Framework | Hono (API) + Vite + React 19 |
| Database | Kysely → SQLite / PostgreSQL |
| Auth | Better Auth (OAuth 2.1 + API keys) |
| Observability | OpenTelemetry |
| UI | React 19 + Tailwind v4 + shadcn |
| Protocol | Model Context Protocol (MCP) |

## Quick Start

```bash
# Clone and install
git clone https://github.com/decocms/mesh.git
bun install

# Run locally
bun run dev
```

Open `http://localhost:4000` to access the admin UI.

## Part of deco CMS

MCP Mesh is the infrastructure layer of [decoCMS](https://decocms.com), providing the foundation for connecting, governing, and observing MCP traffic.

---

*One secure endpoint for every MCP server.*
