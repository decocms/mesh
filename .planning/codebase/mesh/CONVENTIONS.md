# Coding Conventions

**Analysis Date:** 2026-02-14

## Naming Patterns

**Files:**
- Lowercase with hyphens for file names: `bridge-transport.ts`, `use-copy.ts`, `card.tsx`
- Test files: `{name}.test.ts` or `{name}.spec.ts` (not `.spec.test.ts`)
- Component files: Same as file names but may use PascalCase for exported components
- Utility files: descriptive kebab-case names like `github.ts`, `utils.ts`, `time-expressions.ts`

**Functions:**
- camelCase for all functions: `useCopy()`, `handleCopy()`, `parseWorkflow()`, `createTestDb()`
- Event handlers: `handle{EventName}()` prefix, e.g., `handleCopy`
- React hooks: `use{HookName}()` prefix, e.g., `useCopy`, `useCallback`
- Private methods: `_methodName()` prefix (underscore), e.g., `_createWorkflow()`, `_getQueue()`
- Factory functions: `create{Thing}()`, e.g., `createBridgeTransportPair()`, `createTestDb()`
- Parser functions: `parse{Thing}()`, e.g., `parseWorkflow()`, `parseStepResult()`
- Getter functions: `get{Thing}()`, e.g., `getGitHubAvatarUrl()`

**Variables:**
- camelCase for all variables: `organizationId`, `executionId`, `stepResults`, `copied`
- Database models/rows: snake_case in data structures from DB queries: `workflow_id`, `created_at_epoch_ms`, `step_id`
- Constants: UPPER_SNAKE_CASE, e.g., `MAX_QUEUE_SIZE`, `IDENTITY_CODE`, `TEST_ORG_ID`

**Types:**
- PascalCase for interfaces and types: `ParsedWorkflow`, `ExecutionContext`, `BridgeChannel`
- Union/enum-like strings: kept as lowercase strings in actual values
- Component props interfaces: `React.ComponentProps<"element">` pattern used extensively

**CSS/Classes:**
- Use Tailwind CSS classes exclusively
- No separate CSS files in components
- data-slot attribute pattern for semantic targeting: `data-slot="card"`, `data-slot="button-group"`
- class variants via `class-variance-authority`: see `buttonGroupVariants` example

## Code Style

**Formatting:**
- Tool: `biome` (Biomejs 2.2.5)
- Indent: 2 spaces
- Quote style: Double quotes for JavaScript
- Line length: No explicit limit in config

**Linting:**
- Tool: `oxlint` (version 1.23.0) - runs on all packages
- Biome linter disabled in `biome.json` (`"enabled": false`)
- Primary linting via oxlint; biome handles formatting only

**ESLint directives:**
- Disable comments used: `/* eslint-disable ban-memoization/ban-memoization */`
- When used, placed at file top or before specific lines

## Import Organization

**Order (typical pattern from observed files):**
1. Type imports: `import type { Type } from "module"`
2. Standard library / framework imports: `import { React, useState } from "react"`
3. Internal imports with path aliases: `import { cn } from "@deco/ui/lib/utils.ts"`
4. Relative imports: `import { Component } from "./component"`

**Path Aliases:**
- `@deco/*` resolves to `packages/*/src` (defined in `tsconfig.json`)
- Used consistently: `@deco/ui/lib/utils.ts` instead of relative paths
- File extensions included in imports: `.ts`, `.tsx`, `.js` explicitly written

**Barrel Files:**
- Used for exporting multiple components from same directory
- Example: `export { Card, CardHeader, CardTitle, ... }` in `card.tsx`
- Groups related exports together

## Error Handling

**Patterns:**
- Throw custom Error objects with descriptive messages
- Error messages include context: `"BridgeTransport: client queue overflow (max 10000 messages)"`
- Try-catch blocks used for error handling and recovery
- Errors caught and forwarded via `onerror` callbacks in transport classes
- Example from `bridge-transport.ts`:
  ```ts
  try {
    handler(message);
  } catch (error) {
    this.onerror?.(error as Error);
  }
  ```
- Silent no-ops for expected conditions (e.g., sending after close): comment explains intent
- No error wrapping layers; errors propagate directly with meaningful messages

## Logging

**Framework:** `console` object directly
- No structured logging library in use
- Pattern: `console.error("[contextName] Message", error)`
- Context labels in brackets for traceability
- Example: `console.error("[isConnectionAuthenticated] Error:", error)`
- Used sparingly for debugging auth flows and critical failures

## Comments

**When to Comment:**
- Complex algorithms: Bridge transport scheduling, workflow orchestration logic
- Non-obvious design decisions: Why microtasks are used, why MAX_QUEUE_SIZE exists
- Block comments above functions explaining design intent
- JSDoc-style comments for public APIs

**JSDoc/TSDoc:**
- Used extensively for class and function documentation
- Format:
  ```ts
  /**
   * Brief description
   *
   * Longer explanation with sections if needed
   *
   * ## Design notes
   * - Detail 1
   * - Detail 2
   *
   * @param paramName - description
   * @throws Error - when condition X
   */
  ```
- Example from `bridge-transport.ts` shows full module-level JSDoc with usage example

**File-level comments:**
- Placed at top before imports
- Describe purpose of test files or complex modules
- Example: `/**\n * Orchestrator Tests -- Core orchestration + durability\n * Uses in-memory SQLite and mock event bus...`

## Function Design

**Size:** No enforced limit observed; complex functions can be 50+ lines if necessary
- Typical helper functions: 5-15 lines
- Complex orchestration: may span 40+ lines with clear sections

**Parameters:**
- Named parameters preferred over positional
- Use object parameters for multiple related arguments
- Example: `createExecution({ organizationId, virtualMcpId, steps, input })`
- Destructuring used extensively

**Return Values:**
- Explicit return statements; no implicit returns in non-arrow functions
- Async functions return Promise types
- Methods that modify state may return results object: `{ id: string }`
- Test helpers return various fixtures

## Module Design

**Exports:**
- Named exports preferred: `export { Card, CardHeader, CardTitle }`
- Default exports rare; mostly named exports in barrel files
- Public API functions exported from index files

**File Organization:**
- Utility functions at top of file
- Main class or component definition follows
- Exports at bottom (if multiple) or inline with definition

**Monorepo Packages:**
- Each package under `packages/` has its own `package.json` with exports field
- Exports define public API: `"./server"`, `"./client"`, `"./collections"`
- Workspace dependencies: `workspace:*` pattern in package.json

## React Component Patterns

**Functional Components:**
- Arrow functions or function declarations
- Props destructured in parameters
- Example: `function Card({ className, ...props }: React.ComponentProps<"div">)`

**Hooks:**
- Standard React hooks: `useState`, `useCallback`, `useMemo`
- Bun test utilities: `describe`, `it`, `expect` from `bun:test`

**Component Props:**
- Use `React.ComponentProps<"element">` for spread compatibility
- Combine with custom properties when needed
- Example: `React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>`

---

*Convention analysis: 2026-02-14*
