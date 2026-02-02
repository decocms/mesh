---
name: mesh-development
description: Build features for MCP Mesh - our full-stack MCP orchestration platform. Use when working on the mesh codebase, creating plugins, adding tools, or modifying the UI.
---

# Mesh Development Skill

Build and maintain the MCP Mesh platform - a full-stack application for orchestrating MCP (Model Context Protocol) connections, tools, and AI agents.

## When to Use This Skill

- Building new features in the Mesh platform
- Creating or modifying plugins
- Adding MCP tools or bindings
- Working on the React client UI
- Modifying the Hono API server
- Database migrations or storage operations

## Project Structure

```
mesh/
├── apps/
│   ├── mesh/           # Main application (Hono + Vite/React)
│   │   ├── src/
│   │   │   ├── api/    # Hono server routes
│   │   │   ├── web/    # React client
│   │   │   ├── tools/  # MCP tool implementations
│   │   │   └── storage/# Database operations
│   │   └── migrations/ # Kysely migrations
│   └── docs/           # Astro documentation site
├── packages/
│   ├── bindings/       # MCP bindings and connection abstractions
│   ├── runtime/        # MCP proxy, OAuth, tools runtime
│   ├── ui/             # Shared React components (shadcn-based)
│   ├── cli/            # CLI tooling
│   └── mesh-plugin-*/  # Plugin packages
└── plugins/            # Oxlint custom plugins
```

## Quick Start

1. Run `bun install` to install dependencies
2. Run `bun run dev` to start development servers
3. Open `http://localhost:4000` for the client

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start client + server with HMR |
| `bun run check` | TypeScript type checking |
| `bun run lint` | Run oxlint with custom plugins |
| `bun run fmt` | Format code with Biome |
| `bun test` | Run all tests |

## Coding Conventions

### TypeScript & React
- Use TypeScript types, avoid `any`
- React 19 with React Compiler (no manual memoization)
- Tailwind v4 for styling
- Use design system tokens (see [design-tokens.md](references/design-tokens.md))

### Naming
- Files: `kebab-case.ts` for shared packages
- Components/Classes: `PascalCase`
- Hooks/Utilities: `camelCase`
- Query keys: Use constants from `query-keys.ts`

### Banned Patterns
- No `useEffect` - use alternatives (React Query, event handlers)
- No `useMemo`/`useCallback`/`memo` - React 19 compiler handles optimization
- No arbitrary Tailwind values - use design tokens

### Formatting
- Two-space indentation
- Double quotes for strings
- Always run `bun run fmt` after changes

## Creating Plugins

Plugins extend Mesh with custom UI for MCP connections. See existing plugins in `packages/mesh-plugin-*/`.

### Plugin Structure
```typescript
export const myPlugin: Plugin<typeof MY_BINDING> = {
  id: "my-plugin",
  description: "Description for users",
  binding: MY_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context) => {
    context.registerRootSidebarItem({
      icon: <MyIcon size={20} />,
      label: "My Plugin",
    });
    const routes = myRouter.createRoutes(context);
    context.registerPluginRoutes(routes);
  },
};
```

### Bindings
Bindings define which MCP connections a plugin can use. Create bindings in `packages/bindings/src/well-known/`.

## Adding MCP Tools

Tools are server-side functions exposed via MCP. Add tools in `apps/mesh/src/tools/`.

### Tool Structure
```typescript
export function registerMyTool(server: McpServer) {
  server.registerTool(
    "MY_TOOL_NAME",
    {
      title: "My Tool",
      description: "What this tool does",
      inputSchema: {
        param: z.string().describe("Parameter description"),
      },
    },
    async (args) => {
      // Tool implementation
      return {
        content: [{ type: "text", text: "Result" }],
        structuredContent: { result: "data" },
      };
    },
  );
}
```

## Database Operations

Uses Kysely ORM. Migrations in `apps/mesh/migrations/`.

### Creating Migrations
```typescript
// migrations/XXX-my-migration.ts
import { type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("my_table")
    .addColumn("id", "text", (col) => col.primaryKey())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("my_table").execute();
}
```

## Testing

- Co-locate tests: `my-file.test.ts` next to `my-file.ts`
- Use Bun's test framework
- Run `bun test` before PRs

## Commit Guidelines

Follow Conventional Commits:
- `feat(scope): add new feature`
- `fix(scope): fix bug`
- `refactor(scope): code improvement`
- `docs(scope): documentation update`
- `[chore]: maintenance task`

## Related Resources

- [Design Tokens](references/design-tokens.md)
- [UI Components](references/ui-components.md)
- AGENTS.md in repository root
