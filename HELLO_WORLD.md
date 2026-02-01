# Hello, World! 👋

Welcome to **MCP Mesh** — the open-source control plane for MCP traffic.

## What are we building?

MCP Mesh is an infrastructure layer that sits between your MCP clients (like Cursor, Claude, VS Code, or custom agents) and your MCP servers. Think of it as a unified gateway that replaces the chaos of M×N integrations with a single, governed endpoint.

### The Problem

Without a mesh, every MCP client needs direct configuration for every MCP server. This means:
- Duplicated configs across tools
- No centralized auth or policy enforcement
- No unified observability
- Difficult credential management

### The Solution

MCP Mesh provides:
- **One endpoint** for all your MCP traffic
- **RBAC and policies** enforced at the control plane
- **Full observability** with OpenTelemetry traces, costs, and errors
- **Multi-tenancy** with workspace/project scoping
- **Token vault** for secure credential management
- **Virtual MCPs** to compose and expose toolsets as new MCP servers

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

- **Runtime**: Bun / Node
- **Language**: TypeScript + Zod
- **Framework**: Hono (API) + Vite + React 19
- **Database**: Kysely → SQLite / PostgreSQL
- **Auth**: Better Auth (OAuth 2.1 + API keys)
- **Observability**: OpenTelemetry
- **UI**: React 19 + Tailwind v4 + shadcn
- **Protocol**: Model Context Protocol (MCP)

## Getting Started

```bash
# Clone and install
git clone https://github.com/decocms/mesh.git
bun install

# Run locally
bun run dev
```

The client runs at http://localhost:4000 with the API server alongside it.

## Part of deco CMS

MCP Mesh is the infrastructure layer of [decoCMS](https://decocms.com) — enabling you to connect, govern, and observe all your MCP traffic from one place.

---

Happy building! 🚀
