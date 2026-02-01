# Coding Conventions

**Analysis Date:** 2026-02-01

## Naming Patterns

**Files:**
- kebab-case for all filenames (enforced by `.oxlintrc.json` rule `enforce-kebab-case-file-names/kebab-case`)
- Example: `mesh-context.ts`, `credential-vault.test.ts`, `button-group.tsx`
- Exception: none - rule is applied consistently across codebase

**Functions:**
- camelCase for regular functions: `createMockContext()`, `getOrganizationId()`
- camelCase for async functions: `validateSession()`, `validateSessionForConfiguration()`
- PascalCase for constructors and classes: `CredentialVault`, `AccessControl`, `UnauthorizedError`
- camelCase with `create` prefix for factory functions: `createDatabase()`, `createMockAuth()`

**Variables:**
- camelCase for all variables and constants: `userId`, `plaintext`, `sessionId`
- ALL_CAPS for string literal type constants defined with `as const`: `name: "ORGANIZATION_CREATE" as const`
- ALL_CAPS for class-level constants: `MCP_MESH_KEY`, `METADATA_KEYS`

**Types:**
- PascalCase for interfaces: `MeshContext`, `AccessControl`, `ToolDefinition`, `BoundAuthClient`
- PascalCase for type aliases: `MeshAuth`, `OrganizationScope`, `RequestMetadata`
- PascalCase for custom Error classes: `UnauthorizedError`, `ForbiddenError`, `SessionAccessError`
- Prefixed interfaces for specific roles: `UserSandboxSessionEntity`, `UserSandboxPluginStorage`

**Tools (Special Naming):**
- ALL_CAPS with underscores for tool names: `ORGANIZATION_CREATE`, `ORGANIZATION_LIST`, `ORGANIZATION_DELETE`
- Pattern: `[DOMAIN]_[ACTION]` (e.g., `ORGANIZATION_CREATE`, `DATABASES_RUN_SQL`)
- Exported as `const` with tool definition: `export const ORGANIZATION_CREATE = defineTool({...})`

## Code Style

**Formatting:**
- Tool: Biome
- Indent: 2 spaces
- Quote style: double quotes (enforced by `biome.json`)
- Semicolons: automatic (Biome default)

**Linting:**
- Tool: oxlint
- Configuration: `.oxlintrc.json`
- Custom plugins enforced:
  - `enforce-kebab-case-file-names`: Files must be kebab-case
  - `ban-use-effect`: `useEffect` is forbidden (error level)
  - `ban-memoization`: `useMemo` and `useCallback` are forbidden (error level)
  - `require-cn-classname`: Must use `cn()` utility for className combinations (error level)
  - `enforce-query-key-constants`: Query keys must be constants (warning level)

**Biome Settings:**
```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  },
  "linter": {
    "enabled": false
  }
}
```

## Import Organization

**Order:**
1. Type imports: `import type * as React from "react"`
2. Package imports from node_modules: `import { z } from "zod"`
3. Relative imports organized by depth:
   - Parent: `import { defineTool } from "../../core/define-tool"`
   - Same level: `import { cn } from "@deco/ui/lib/utils.ts"`
   - Re-exports in barrel files

**Path Aliases:**
- `@deco/*`: Maps to `packages/*/src` (configured in `tsconfig.json`)
- Used in UI components: `import { cn } from "@deco/ui/lib/utils.ts"`
- Used in mesh core: `import { defineTool } from "@/core/define-tool"`

**Import Statement Patterns:**
- Named imports preferred: `import { describe, expect, it } from "bun:test"`
- Type-only imports when importing types: `import type { MeshContext } from "./mesh-context"`
- Wildcard type imports for React: `import type * as React from "react"`

## Error Handling

**Pattern for custom errors:**
- Create classes extending Error with `this.name` property
- Example from `/Users/guilherme/Projects/mesh/apps/mesh/src/core/access-control.ts`:
```typescript
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}
```

**Error throwing:**
- Generic `throw new Error("message")` for standard errors
- Custom error classes for specific error conditions
- Include descriptive messages: "Authentication required" or "Access denied to: ..."

**Error validation in tests:**
- Test both error type and error message:
```typescript
try {
  await validateSession("uss_nonexistent", storage);
} catch (err) {
  expect(err).toBeInstanceOf(SessionAccessError);
  expect((err as SessionAccessError).code).toBe("SESSION_NOT_FOUND");
}
```

## Logging

**Framework:** console (direct usage via `console.log`, `console.warn`, `console.error`)

**Patterns:**
- Migration scripts and database operations use console.log with emoji prefixes
- Examples from `/Users/guilherme/Projects/mesh/apps/mesh/src/database/migrate.ts`:
  - `console.log("✅ Migration executed successfully")`
  - `console.error("❌ Failed to execute migration")`
  - `console.warn("Warning: Error closing database")`
- Database query logging in `/Users/guilherme/Projects/mesh/apps/mesh/src/database/index.ts`:
  - `console.error("Slow query detected:", { queryDuration, query })`
  - `console.error("Query failed:", { error, query })`

**When to log:**
- Data migration steps (log each migration execution)
- Database operations (log slow queries and failures)
- Error conditions and stacktraces
- Startup and initialization steps

**When NOT to log:**
- Regular business logic execution
- In tool handlers (no logging patterns found in tools)
- Test files (use assertions instead)

## Comments

**When to Comment:**
- Document the "why" not the "what"
- Section headers for major code blocks with `// ============================================================================`
- JSDoc for public APIs and complex functions
- Comments on public interfaces explaining key principles

**JSDoc/TSDoc:**
- Used on interfaces and types to explain purpose:
```typescript
/**
 * MeshContext - Core abstraction for all tools
 *
 * Provides tools with access to all necessary services without coupling them
 * to HTTP frameworks or database drivers.
 *
 * Key Principles:
 * - Tools NEVER access HTTP objects directly
 * - Tools NEVER access database drivers directly
 * - Tools NEVER access environment variables directly
 * - All dependencies injected through this interface
 */
export interface MeshContext { ... }
```

- Used on public methods with @example blocks:
```typescript
/**
 * Define a tool with automatic validation, authorization, and logging
 *
 * @example
 * ```typescript
 * export const MY_TOOL = defineTool({...});
 * ```
 */
export function defineTool<...>(...) { ... }
```

## Function Design

**Size:**
- No explicit limit, but favor breaking large functions into smaller helpers
- Private helper functions used for complex operations (e.g., `checkResource()`, `isToolPublic()`)

**Parameters:**
- Destructure object parameters: `({ className, ...props }: React.ComponentProps<"div">)`
- Use rest spread for prop forwarding: `{...props}`
- Optional parameters marked with `?`: `expiresIn?: number`

**Return Values:**
- Async functions always return `Promise<T>`
- Return early pattern for validation/guards:
```typescript
if (this._granted) {
  return;
}
```
- Const assertions for literal types: `name: "ORGANIZATION_CREATE" as const`

## Module Design

**Exports:**
- Named exports preferred for utilities and functions
- Default export for tool definitions (but exported as named const)
- Barrel files export multiple related items:
```typescript
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
```

**Barrel Files:**
- Used in UI components: `/packages/ui/src/components/` has barrel exports
- Used in tools: `/apps/mesh/src/tools/organization/index.ts` re-exports all tools
- Pattern: Group related components/tools and export them from `index.ts` or `index.tsx`

**Module Organization:**
- One primary export per file (tool or component)
- Helper types/interfaces in same file if tightly coupled
- Shared types in separate `types.ts` or domain-specific interfaces

---

*Convention analysis: 2026-02-01*
