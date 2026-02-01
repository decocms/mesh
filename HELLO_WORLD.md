# Hello, World!

Welcome to **MCP Mesh** - an open-source control plane for Model Context Protocol (MCP) traffic.

## What Are We Building?

MCP Mesh sits between your AI clients (Cursor, Claude, VS Code, custom agents) and your MCP servers, providing a unified layer for authentication, routing, and observability.

### The Problem

When you have M MCP servers and N clients, you end up maintaining M×N separate integrations. Each client needs its own configuration for each server. This becomes unmanageable as your tooling grows.

### The Solution

MCP Mesh replaces those M×N integrations with **one production endpoint**. It acts as a secure gateway that:

- **Routes** all MCP traffic through a single governed endpoint
- **Enforces** RBAC, policies, and audit trails at the control plane
- **Observes** everything with OpenTelemetry - traces, costs, errors
- **Manages** runtime strategies for optimal tool selection

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Clients                             │
│         Cursor · Claude · VS Code · Custom Agents               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MCP MESH                                │
│       Virtual MCP · Policy Engine · Observability · Token Vault │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Servers                               │
│      Salesforce · Slack · GitHub · Postgres · Your APIs         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

- **MeshContext** - Unified runtime interface for auth, storage, observability, and policy control
- **defineTool()** - Declarative API for typed, auditable, observable MCP tools
- **Multi-tenancy** - Workspace/project isolation for configs, credentials, and logs
- **Virtual MCPs** - Compose and expose governed toolsets as new MCP servers
- **Token Vault** - Secure credential management with OAuth support

## Getting Started

```bash
# Clone and install
git clone https://github.com/decocms/mesh.git
bun install

# Run locally
bun run dev
```

Then visit [http://localhost:3000](http://localhost:3000)

## Part of deco CMS

MCP Mesh is the infrastructure layer of [decoCMS](https://decocms.com). It's designed to connect, govern, and observe MCP traffic at scale.

---

Happy building!
