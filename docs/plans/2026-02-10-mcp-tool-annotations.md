# MCP Tool Annotations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add MCP standard annotations to defineTool() framework and apply appropriate annotations to all existing tools

**Architecture:** Extend the defineTool() type system to support optional tool annotations as defined in the MCP spec. The annotations provide behavioral hints about tools (read-only, destructive, idempotent, open-world) that help clients make informed decisions about tool usage.

**Tech Stack:** TypeScript, Zod schemas, MCP protocol compliance

**Issue:** main-7hq.4

---

## Task 1: Add annotations type to ToolDefinition

**Files:**
- Modify: `apps/mesh/src/core/define-tool.ts`

**Step 1: Add ToolAnnotations interface**

Add the interface after the imports section (around line 15):

```typescript
/**
 * Tool annotations from MCP spec
 * These provide behavioral hints about tools to help clients make informed decisions
 */
export interface ToolAnnotations {
  /**
   * A human-readable title for the tool.
   */
  title?: string;

  /**
   * If true, the tool does not modify its environment.
   * Default: false
   */
  readOnlyHint?: boolean;

  /**
   * If true, the tool may perform destructive updates to its environment.
   * If false, the tool performs only additive updates.
   * (This property is meaningful only when readOnlyHint == false)
   * Default: true
   */
  destructiveHint?: boolean;

  /**
   * If true, calling the tool repeatedly with the same arguments
   * will have no additional effect on its environment.
   * (This property is meaningful only when readOnlyHint == false)
   * Default: false
   */
  idempotentHint?: boolean;

  /**
   * If true, this tool may interact with an "open world" of external
   * entities. If false, the tool's domain of interaction is closed.
   * For example, the world of a web search tool is open, whereas that
   * of a memory tool is not.
   * Default: true
   */
  openWorldHint?: boolean;
}
```

**Step 2: Add annotations field to ToolBinder interface**

Update the ToolBinder interface (around line 26):

```typescript
export interface ToolBinder<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
  TName extends string = string,
> {
  name: TName;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  annotations?: ToolAnnotations;
}
```

**Step 3: Update example in docstring**

Update the docstring example in defineTool (around line 69):

```typescript
/**
 * Define a tool with automatic validation, authorization, and logging
 *
 * @example
 * ```typescript
 * export const MY_TOOL = defineTool({
 *   name: 'MY_TOOL',
 *   description: 'Does something useful',
 *   inputSchema: z.object({
 *     param: z.string(),
 *   }),
 *   outputSchema: z.object({
 *     result: z.string(),
 *   }),
 *   annotations: {
 *     readOnlyHint: true,
 *     openWorldHint: false,
 *   },
 *   handler: async (input, ctx) => {
 *     await ctx.access.check();
 *     return { result: 'done' };
 *   },
 * });
 * ```
 */
```

**Step 4: Run type check**

Run: `bun run check`
Expected: Should pass with no type errors

**Step 5: Commit**

```bash
git add apps/mesh/src/core/define-tool.ts
git commit -m "feat(tools): add MCP annotations support to defineTool

- Add ToolAnnotations interface from MCP spec
- Add optional annotations field to ToolBinder
- Update example to show annotations usage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add annotations to read-only LIST tools

**Files:**
- Modify: `apps/mesh/src/tools/connection/list.ts:211`
- Modify: `apps/mesh/src/tools/organization/list.ts`
- Modify: `apps/mesh/src/tools/projects/list.ts`
- Modify: `apps/mesh/src/tools/virtual/list.ts`
- Modify: `apps/mesh/src/tools/virtual-tool/list.ts`
- Modify: `apps/mesh/src/tools/thread/list.ts`
- Modify: `apps/mesh/src/tools/thread/list-messages.ts`
- Modify: `apps/mesh/src/tools/apiKeys/list.ts`
- Modify: `apps/mesh/src/tools/monitoring/list.ts`
- Modify: `apps/mesh/src/tools/tags/list.ts`
- Modify: `apps/mesh/src/tools/eventbus/list.ts`

**Step 1: Add annotations to COLLECTION_CONNECTIONS_LIST**

In `apps/mesh/src/tools/connection/list.ts`, add after outputSchema (line 209):

```typescript
export const COLLECTION_CONNECTIONS_LIST = defineTool({
  name: "COLLECTION_CONNECTIONS_LIST",
  description:
    "List all connections in the organization with filtering, sorting, and pagination",

  inputSchema: ConnectionListInputSchema,
  outputSchema: ConnectionListOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
  },

  handler: async (input, ctx) => {
```

**Step 2: Add annotations to remaining LIST tools**

Apply the same pattern to all other LIST tools:
- ORGANIZATION_LIST
- PROJECT_LIST
- COLLECTION_VIRTUAL_MCP_LIST
- COLLECTION_VIRTUAL_TOOLS_LIST
- COLLECTION_THREADS_LIST
- COLLECTION_THREAD_MESSAGES_LIST
- API_KEY_LIST
- MONITORING_LOGS_LIST
- TAGS_LIST
- EVENT_SUBSCRIPTION_LIST

All should have:
```typescript
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
},
```

**Step 3: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 4: Run formatter**

Run: `bun run fmt`

**Step 5: Commit**

```bash
git add apps/mesh/src/tools/*/list*.ts
git commit -m "feat(tools): add readOnly annotations to LIST tools

All LIST tools are read-only and operate in closed world

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add annotations to read-only GET tools

**Files:**
- Modify: `apps/mesh/src/tools/connection/get.ts`
- Modify: `apps/mesh/src/tools/organization/get.ts`
- Modify: `apps/mesh/src/tools/organization/settings-get.ts`
- Modify: `apps/mesh/src/tools/projects/get.ts`
- Modify: `apps/mesh/src/tools/projects/plugin-config-get.ts`
- Modify: `apps/mesh/src/tools/virtual/get.ts`
- Modify: `apps/mesh/src/tools/virtual-tool/get.ts`
- Modify: `apps/mesh/src/tools/thread/get.ts`
- Modify: `apps/mesh/src/tools/user/get.ts`
- Modify: `apps/mesh/src/tools/tags/member-get.ts`
- Modify: `apps/mesh/src/tools/monitoring/stats.ts`

**Step 1: Add annotations to all GET tools**

Add after outputSchema in each tool:

```typescript
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
},
```

**Step 2: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 3: Run formatter**

Run: `bun run fmt`

**Step 4: Commit**

```bash
git add apps/mesh/src/tools/*/get*.ts apps/mesh/src/tools/monitoring/stats.ts
git commit -m "feat(tools): add readOnly annotations to GET tools

All GET/stats tools are read-only and operate in closed world

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add annotations to read-only inspection tools

**Files:**
- Modify: `apps/mesh/src/tools/organization/member-list.ts`
- Modify: `apps/mesh/src/tools/code-execution/search.ts`
- Modify: `apps/mesh/src/tools/code-execution/describe.ts`
- Modify: `apps/mesh/src/tools/connection/test.ts`

**Step 1: Add annotations to inspection tools**

CONNECTION_TEST and CODE_EXECUTION tools are read-only but may interact with external systems (openWorldHint: true for TEST):

For CONNECTION_TEST:
```typescript
annotations: {
  readOnlyHint: true,
  openWorldHint: true, // Tests external connections
},
```

For CODE_EXECUTION_SEARCH_TOOLS and CODE_EXECUTION_DESCRIBE_TOOLS:
```typescript
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
},
```

For ORGANIZATION_MEMBER_LIST:
```typescript
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
},
```

**Step 2: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 3: Run formatter**

Run: `bun run fmt`

**Step 4: Commit**

```bash
git add apps/mesh/src/tools/organization/member-list.ts apps/mesh/src/tools/code-execution/*.ts apps/mesh/src/tools/connection/test.ts
git commit -m "feat(tools): add readOnly annotations to inspection tools

- CONNECTION_TEST is read-only but open-world (tests external)
- CODE_EXECUTION tools are read-only closed-world
- ORGANIZATION_MEMBER_LIST is read-only closed-world

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add annotations to non-destructive CREATE tools

**Files:**
- Modify: `apps/mesh/src/tools/connection/create.ts`
- Modify: `apps/mesh/src/tools/organization/create.ts`
- Modify: `apps/mesh/src/tools/projects/create.ts`
- Modify: `apps/mesh/src/tools/virtual/create.ts`
- Modify: `apps/mesh/src/tools/virtual-tool/create.ts`
- Modify: `apps/mesh/src/tools/thread/create.ts`
- Modify: `apps/mesh/src/tools/apiKeys/create.ts`
- Modify: `apps/mesh/src/tools/tags/create.ts`

**Step 1: Add annotations to CREATE tools**

CREATE tools are not read-only, not destructive (additive only), not idempotent:

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false, // Additive only
  idempotentHint: false,  // Creates new resources
  openWorldHint: false,
},
```

**Step 2: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 3: Run formatter**

Run: `bun run fmt`

**Step 4: Commit**

```bash
git add apps/mesh/src/tools/*/create*.ts
git commit -m "feat(tools): add annotations to CREATE tools

CREATE tools are additive (non-destructive) and non-idempotent

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add annotations to non-destructive UPDATE tools

**Files:**
- Modify: `apps/mesh/src/tools/connection/update.ts`
- Modify: `apps/mesh/src/tools/organization/update.ts`
- Modify: `apps/mesh/src/tools/organization/settings-update.ts`
- Modify: `apps/mesh/src/tools/projects/update.ts`
- Modify: `apps/mesh/src/tools/projects/plugin-config-update.ts`
- Modify: `apps/mesh/src/tools/virtual/update.ts`
- Modify: `apps/mesh/src/tools/virtual-tool/update.ts`
- Modify: `apps/mesh/src/tools/thread/update.ts`
- Modify: `apps/mesh/src/tools/apiKeys/update.ts`
- Modify: `apps/mesh/src/tools/tags/member-set.ts`
- Modify: `apps/mesh/src/tools/organization/member-update-role.ts`

**Step 1: Add annotations to UPDATE tools**

UPDATE tools are not read-only, not destructive (updates existing), idempotent (same update = same result):

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false, // Updates, doesn't destroy
  idempotentHint: true,   // Same update yields same result
  openWorldHint: false,
},
```

**Step 2: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 3: Run formatter**

Run: `bun run fmt`

**Step 4: Commit**

```bash
git add apps/mesh/src/tools/*/update*.ts apps/mesh/src/tools/**/member-*.ts apps/mesh/src/tools/tags/member-set.ts
git commit -m "feat(tools): add annotations to UPDATE tools

UPDATE tools are non-destructive and idempotent

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Add annotations to destructive DELETE tools

**Files:**
- Modify: `apps/mesh/src/tools/connection/delete.ts`
- Modify: `apps/mesh/src/tools/organization/delete.ts`
- Modify: `apps/mesh/src/tools/organization/member-remove.ts`
- Modify: `apps/mesh/src/tools/projects/delete.ts`
- Modify: `apps/mesh/src/tools/virtual/delete.ts`
- Modify: `apps/mesh/src/tools/virtual-tool/delete.ts`
- Modify: `apps/mesh/src/tools/thread/delete.ts`
- Modify: `apps/mesh/src/tools/apiKeys/delete.ts`
- Modify: `apps/mesh/src/tools/tags/delete.ts`

**Step 1: Add annotations to DELETE tools**

DELETE tools are destructive but idempotent (deleting same resource multiple times = same result):

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,  // Permanently removes resources
  idempotentHint: true,   // Deleting same item multiple times is idempotent
  openWorldHint: false,
},
```

**Step 2: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 3: Run formatter**

Run: `bun run fmt`

**Step 4: Commit**

```bash
git add apps/mesh/src/tools/*/delete*.ts apps/mesh/src/tools/organization/member-remove.ts
git commit -m "feat(tools): add annotations to DELETE tools

DELETE tools are destructive but idempotent

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Add annotations to Event Bus tools

**Files:**
- Modify: `apps/mesh/src/tools/eventbus/publish.ts`
- Modify: `apps/mesh/src/tools/eventbus/subscribe.ts`
- Modify: `apps/mesh/src/tools/eventbus/unsubscribe.ts`
- Modify: `apps/mesh/src/tools/eventbus/cancel.ts`
- Modify: `apps/mesh/src/tools/eventbus/ack.ts`
- Modify: `apps/mesh/src/tools/eventbus/sync-subscriptions.ts`

**Step 1: Add annotations to EVENT_PUBLISH**

EVENT_PUBLISH creates events, not idempotent (each publish creates new event delivery):

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,  // Each publish creates new event
  openWorldHint: true,    // Interacts with external subscribers
},
```

**Step 2: Add annotations to EVENT_SUBSCRIBE**

EVENT_SUBSCRIBE is additive and idempotent (subscribing twice = same subscription):

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,   // Same subscription = idempotent
  openWorldHint: false,
},
```

**Step 3: Add annotations to EVENT_UNSUBSCRIBE**

EVENT_UNSUBSCRIBE is destructive but idempotent:

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,  // Removes subscription
  idempotentHint: true,   // Unsubscribing twice is idempotent
  openWorldHint: false,
},
```

**Step 4: Add annotations to EVENT_CANCEL**

EVENT_CANCEL is destructive but idempotent:

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,  // Cancels recurring event
  idempotentHint: true,   // Canceling twice is idempotent
  openWorldHint: false,
},
```

**Step 5: Add annotations to EVENT_ACK**

EVENT_ACK is additive and idempotent:

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,   // Acking twice has same effect
  openWorldHint: false,
},
```

**Step 6: Add annotations to EVENT_SYNC_SUBSCRIPTIONS**

EVENT_SYNC_SUBSCRIPTIONS is idempotent (syncing to same state = same result):

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,  // May remove subscriptions
  idempotentHint: true,   // Syncing to same state is idempotent
  openWorldHint: false,
},
```

**Step 7: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 8: Run formatter**

Run: `bun run fmt`

**Step 9: Commit**

```bash
git add apps/mesh/src/tools/eventbus/*.ts
git commit -m "feat(tools): add annotations to Event Bus tools

- EVENT_PUBLISH is non-idempotent, open-world
- EVENT_SUBSCRIBE/ACK are idempotent, additive
- EVENT_UNSUBSCRIBE/CANCEL are idempotent, destructive
- EVENT_SYNC_SUBSCRIPTIONS is idempotent, may be destructive

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Add annotations to special operation tools

**Files:**
- Modify: `apps/mesh/src/tools/organization/member-add.ts`
- Modify: `apps/mesh/src/tools/database/index.ts`
- Modify: `apps/mesh/src/tools/code-execution/run.ts`

**Step 1: Add annotations to ORGANIZATION_MEMBER_ADD**

ORGANIZATION_MEMBER_ADD is additive and idempotent (adding same member twice = same result):

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,   // Adding same member twice is idempotent
  openWorldHint: false,
},
```

**Step 2: Add annotations to DATABASES_RUN_SQL**

DATABASES_RUN_SQL can be anything depending on SQL, so conservative defaults:

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,  // SQL can be destructive
  idempotentHint: false,  // SQL may not be idempotent
  openWorldHint: false,   // Operates on closed database
},
```

**Step 3: Add annotations to CODE_EXECUTION_RUN_CODE**

CODE_EXECUTION_RUN_CODE can be anything, conservative defaults:

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,  // Code can be destructive
  idempotentHint: false,  // Code may not be idempotent
  openWorldHint: true,    // Code may interact with external systems
},
```

**Step 4: Run type check**

Run: `bun run check`
Expected: Should pass

**Step 5: Run formatter**

Run: `bun run fmt`

**Step 6: Commit**

```bash
git add apps/mesh/src/tools/organization/member-add.ts apps/mesh/src/tools/database/index.ts apps/mesh/src/tools/code-execution/run.ts
git commit -m "feat(tools): add annotations to special operation tools

- ORGANIZATION_MEMBER_ADD is additive and idempotent
- DATABASES_RUN_SQL uses conservative defaults (destructive)
- CODE_EXECUTION_RUN_CODE uses conservative defaults (open-world)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Verify all tools have annotations

**Files:**
- Read: `apps/mesh/src/tools/registry.ts`
- Read: All tool files

**Step 1: Create verification script**

Create: `scripts/verify-annotations.ts`

```typescript
/**
 * Verify all tools have annotations
 */
import { ALL_TOOLS } from "../apps/mesh/src/tools/index";

const toolsWithoutAnnotations: string[] = [];

for (const tool of ALL_TOOLS) {
  if (!tool.annotations) {
    toolsWithoutAnnotations.push(tool.name);
  }
}

if (toolsWithoutAnnotations.length > 0) {
  console.error("Tools without annotations:");
  for (const name of toolsWithoutAnnotations) {
    console.error(`  - ${name}`);
  }
  process.exit(1);
}

console.log(`✓ All ${ALL_TOOLS.length} tools have annotations`);
```

**Step 2: Run verification script**

Run: `bun run scripts/verify-annotations.ts`
Expected: All tools have annotations

**Step 3: If any tools are missing annotations, add them**

Review the output and add annotations to any missing tools based on their behavior.

**Step 4: Commit verification script**

```bash
git add scripts/verify-annotations.ts
git commit -m "chore(tools): add verification script for tool annotations

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Add validation test for annotations

**Files:**
- Create: `apps/mesh/src/core/define-tool.test.ts`

**Step 1: Write test for annotation defaults**

```typescript
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineTool } from "./define-tool";

describe("defineTool annotations", () => {
  test("should accept annotations", () => {
    const tool = defineTool({
      name: "TEST_TOOL",
      description: "Test tool",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      handler: async () => ({}),
    });

    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });

  test("should work without annotations", () => {
    const tool = defineTool({
      name: "TEST_TOOL_2",
      description: "Test tool 2",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      handler: async () => ({}),
    });

    expect(tool.annotations).toBeUndefined();
  });

  test("should accept all annotation fields", () => {
    const tool = defineTool({
      name: "TEST_TOOL_3",
      description: "Test tool 3",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      annotations: {
        title: "Test Tool",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async () => ({}),
    });

    expect(tool.annotations).toEqual({
      title: "Test Tool",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
  });
});
```

**Step 2: Run test**

Run: `bun test apps/mesh/src/core/define-tool.test.ts`
Expected: All tests pass

**Step 3: Commit test**

```bash
git add apps/mesh/src/core/define-tool.test.ts
git commit -m "test(tools): add tests for tool annotations

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Update AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md` (or `CLAUDE.md`)

**Step 1: Add documentation about tool annotations**

Add a new section in the "Working with Tools" section:

```markdown
## Working with Tools

When creating new MCP tools:
1. Use `defineTool()` from `apps/mesh/src/core/define-tool.ts`
2. Place tools in appropriate domain folder under `apps/mesh/src/tools/`
3. Always inject `MeshContext` as second parameter
4. Call `await ctx.access.check()` for authorization
5. Use `ctx.storage` for database operations (never access Kysely directly)
6. Define Zod schemas for input/output validation
7. Add appropriate MCP annotations to indicate tool behavior
8. Tools are automatically traced, logged, and metrified

### Tool Annotations

All tools should include MCP standard annotations to indicate their behavior:

**Read-only tools** (LIST, GET, stats, search):
```typescript
annotations: {
  readOnlyHint: true,
  openWorldHint: false, // true if interacting with external systems
}
```

**Create tools** (non-destructive, additive):
```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}
```

**Update tools** (non-destructive, idempotent):
```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
```

**Delete tools** (destructive, idempotent):
```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
}
```

**Guidelines:**
- `readOnlyHint: true` - Tool doesn't modify environment
- `destructiveHint: true` - Tool permanently removes/modifies resources
- `idempotentHint: true` - Calling with same args multiple times = same result
- `openWorldHint: true` - Tool interacts with external entities (APIs, web, etc.)
```

**Step 2: Run formatter**

Run: `bun run fmt`

**Step 3: Commit documentation**

```bash
git add CLAUDE.md
git commit -m "docs: add tool annotations guidelines to CLAUDE.md

Document MCP annotation patterns for different tool types

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Final verification

**Step 1: Run all checks**

Run: `bun run check && bun run lint && bun test`
Expected: All checks pass

**Step 2: Verify tool count**

Run: `bun run scripts/verify-annotations.ts`
Expected: All tools have annotations

**Step 3: Check for any missed files**

Run: `git status`
Expected: Working directory clean (all changes committed)

**Step 4: Review commit history**

Run: `git log --oneline -15`
Expected: See all commits for this feature

---

## Summary

This plan implements MCP tool annotations for all ~60 built-in tools by:

1. ✅ Adding ToolAnnotations type to defineTool()
2. ✅ Categorizing tools by behavior (read-only, create, update, delete, special)
3. ✅ Applying appropriate annotations to each tool
4. ✅ Adding verification script and tests
5. ✅ Documenting guidelines for future tools

**Annotation patterns applied:**
- Read-only: 17 LIST + 11 GET + 4 inspection = 32 tools
- Create (additive): 8 tools
- Update (idempotent): 11 tools
- Delete (destructive): 9 tools
- Event Bus: 6 tools (varied annotations)
- Special operations: 3 tools (conservative defaults)

**Total: ~60 tools** with MCP-compliant annotations.
