# Hello, World!

Welcome to **MCP Mesh** — the open-source control plane for Model Context Protocol (MCP) traffic.

## What Are We Building?

MCP Mesh is a unified gateway that sits between your MCP clients (Cursor, Claude, VS Code, custom agents) and your MCP servers (Salesforce, Slack, GitHub, Postgres, your APIs). Instead of configuring M×N integrations, you get one production endpoint with built-in governance, observability, and security.

### Core Vision

- **One Endpoint, Many Servers**: Route all MCP traffic through a single governed endpoint
- **Enterprise-Ready**: RBAC, policies, audit trails, and multi-tenant workspace isolation
- **Full Observability**: OpenTelemetry traces, costs, and error tracking out of the box
- **Deploy Anywhere**: Docker, Kubernetes, AWS, GCP, or local Bun/Node runtimes

### Current Focus: Site Builder

We're actively developing a **Site Builder** plugin that lets you control any local site from Mesh. The workflow:

1. Select a folder and mount it as a site
2. Describe what you want (or pick a skill like "Landing Page")
3. AI agents build it iteratively with live streaming preview
4. Watch progress until complete or budget exhausted

This is powered by:
- **Beads**: Git-backed task storage with dependency graphs
- **Ralph-style loops**: Autonomous execution (SELECT → PROMPT → EXECUTE → EVALUATE)
- **Stack-agnostic design**: Works with Deco, Fresh, Next.js, and more

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

## Getting Started

```bash
# Clone and install
git clone https://github.com/decocms/mesh.git
bun install

# Run locally
bun run dev
```

The app runs at http://localhost:3000.

## Part of deco CMS

MCP Mesh is the infrastructure layer of [decoCMS](https://decocms.com) — a platform for building and deploying AI-powered applications. The mesh connects, governs, and observes all MCP traffic, while upcoming layers (MCP Studio, MCP Store) will enable packaging and sharing of MCP capabilities.

## Learn More

- [Documentation](https://docs.deco.page/)
- [Discord Community](https://decocms.com/discord)
- [Website](https://decocms.com/mesh)

---

Built with care by the [deco](https://decocms.com) community.
