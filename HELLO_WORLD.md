# Hello, World!

Welcome to **MCP Mesh** - a self-hostable MCP Gateway for orchestrating AI connections and tools.

## What is MCP Mesh?

MCP Mesh is a full-stack application that helps you manage and orchestrate [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) connections. Think of it as a central hub where AI agents can discover and use tools, connect to various services, and work together seamlessly.

## Key Features

- **MCP Gateway**: Connect and manage multiple MCP servers from a single interface
- **Tool Orchestration**: Register, discover, and invoke AI tools across your organization
- **Plugin Architecture**: Extend functionality with custom plugins for specific MCP connections
- **Self-Hostable**: Run on your own infrastructure with full control over your data
- **Modern Stack**: Built with React 19, Hono, and Tailwind v4

## Project Structure

```
mesh/
├── apps/
│   ├── mesh/           # Main application (Hono API + React client)
│   └── docs/           # Documentation site
├── packages/
│   ├── bindings/       # MCP connection abstractions
│   ├── runtime/        # MCP proxy, OAuth, and tools runtime
│   ├── ui/             # Shared React components
│   └── mesh-plugin-*/  # Plugin packages
```

## Getting Started

```bash
# Install dependencies
bun install

# Start development servers
bun run dev

# Open http://localhost:4000
```

## Learn More

- Check out `AGENTS.md` for repository guidelines
- Explore `skills/mesh-development/SKILL.md` for development conventions
- Visit the documentation at `apps/docs/`

---

Built with care by the Deco team.
