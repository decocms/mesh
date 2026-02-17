# Testing Patterns

**Analysis Date:** 2026-02-14

## Test Framework

**Runner:**
- Bun's native test runner (`bun:test`)
- Version: Bun latest (specified in devDependencies as `"@types/bun": "latest"`)
- All test scripts: `bun test` (invoked as `npm run test` or `bun test` directly)

**Assertion Library:**
- Bun's built-in assertions from `bun:test`
- Imported as: `import { describe, expect, it } from "bun:test"`

**Run Commands:**
```bash
bun test                      # Run all tests in project
bun test <file.test.ts>      # Run specific test file
npm test                      # From package.json workspace root
```

**Coverage:**
- No coverage tool configured
- Not enforced or tracked in CI

## Test File Organization

**Location:**
- Co-located with source code using various patterns:
  - `src/lib/github.test.ts` - Same directory as source
  - `server/__tests__/test-helpers.ts` - Separate `__tests__` subdirectory
  - `server/engine/__tests__/orchestrator.test.ts` - Nested `__tests__` folders
  - `test/mcp.test.ts` - Top-level `test` folder

**Naming:**
- Pattern: `{name}.test.ts` (always `.test.ts`, not `.spec.ts`)
- Example files:
  - `/packages/ui/src/lib/github.test.ts`
  - `/packages/mesh-plugin-workflows/server/engine/__tests__/orchestrator.test.ts`
  - `/packages/bindings/test/index.test.ts`
  - `/packages/mesh-sdk/src/lib/bridge-transport.test.ts`

**Test Helpers:**
- Located in `__tests__/test-helpers.ts` alongside test files
- Exported functions available to other tests
- Example: `createTestDb()`, `createMockOrchestratorContext()`, `makeCodeStep()`

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { /* dependencies */ } from "./source";

describe("Component/Feature Name", () => {
  // Setup
  let resource: Type;

  beforeEach(async () => {
    // Initialize fixtures
    resource = await createResource();
  });

  afterEach(async () => {
    // Cleanup
    await resource.cleanup?.();
  });

  // Nested describe for related tests
  describe("Specific behavior", () => {
    it("should do something when condition X", () => {
      const result = resource.method();
      expect(result).toBe(expectedValue);
    });

    it("should handle edge case Y", async () => {
      const result = await resource.asyncMethod();
      expect(result).not.toBeNull();
    });
  });
});
```

**Patterns:**
- Top-level `describe()` for main feature/class
- Nested `describe()` for logical test groups
- Each group may have its own `beforeEach`/`afterEach` for isolated setup
- Test descriptions start with "should" or "should not"

### Real Example from Codebase

From `/packages/mesh-sdk/src/lib/bridge-transport.test.ts`:
```typescript
describe("BridgeTransport", () => {
  describe("createBridgeTransportPair", () => {
    it("should create a pair of transports", () => {
      const { client, server, channel } = createBridgeTransportPair();
      expect(client).toBeInstanceOf(BridgeClientTransport);
      expect(server).toBeInstanceOf(BridgeServerTransport);
      expect(channel).toBeDefined();
    });
  });

  describe("message delivery", () => {
    it("should deliver messages in order client->server", async () => {
      const { client, server } = createBridgeTransportPair();
      const receivedMessages: JSONRPCMessage[] = [];

      await server.start();
      server.onmessage = (message) => {
        receivedMessages.push(message);
      };
      await client.start();

      await client.send(msg1);
      await new Promise((resolve) => queueMicrotask(resolve));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual(msg1);
    });
  });
});
```

## Mocking

**Framework:** Bun's test mocks
- No dedicated mocking library observed
- Manual mock objects created as needed
- Pattern: Create mock object with expected interface

**Patterns:**

```typescript
// Mock storage interface
function createMockStorage(
  session: UserSandboxSessionEntity | null,
): UserSandboxPluginStorage {
  return {
    templates: {} as never,
    sessions: {
      findById: async () => session,
      findExisting: async () => null,
      listByTemplate: async () => [],
      create: async () => session!,
      // ... other required methods
    },
  };
}

// Mock event bus/context
const ctx = createMockOrchestratorContext(storage);
await ctx.publish("workflow.execution.created", executionId);
await ctx.drainEvents(); // Drain queued events
```

**What to Mock:**
- External service integrations (GitHub API, databases)
- Storage/database layers (create in-memory versions for testing)
- Event buses and messaging systems
- HTTP clients when testing pure logic

**What NOT to Mock:**
- Core business logic classes
- Pure utility functions
- When testing integration between components

## Fixtures and Factories

**Test Data:**

From `/packages/mesh-plugin-workflows/server/__tests__/test-helpers.ts`:
```typescript
export function makeCodeStep(
  id: string,
  code: string,
  inputs: Record<string, string>,
): Step {
  return {
    id,
    type: "code",
    code,
    inputs,
  };
}

const IDENTITY_CODE = "export default function(input) { return input; }";

async function startWorkflow(
  steps: Parameters<WorkflowExecutionStorage["createExecution"]>[0]["steps"],
  input?: Record<string, unknown>,
) {
  const { id } = await storage.createExecution({
    organizationId: TEST_ORG_ID,
    virtualMcpId: TEST_VIRTUAL_MCP_ID,
    steps,
    input: input ?? null,
  });
  return id;
}
```

**Location:**
- Test helpers in `__tests__/test-helpers.ts` in same directory
- Factories: `createTestDb()`, `createMockOrchestratorContext()`, `makeCodeStep()`
- Constants: `TEST_ORG_ID`, `TEST_VIRTUAL_MCP_ID`, `IDENTITY_CODE`
- Reused across multiple test files in same package

**In-Memory Database for Tests:**
```typescript
export async function createTestDb(): Promise<Kysely<WorkflowDatabase>> {
  const db = new Kysely<WorkflowDatabase>({
    dialect: new BunWorkerDialect({
      url: ":memory:",
    }),
  });

  // Setup schema and migrations
  await db.schema.createTable("organization").ifNotExists()...
  await migration001.up(db as Kysely<unknown>);

  return db;
}
```

## Async Testing

**Pattern:**
```typescript
it("should handle async operations", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

it("should wait for events", async () => {
  // Wait using microtask
  await new Promise((resolve) => queueMicrotask(resolve));

  // Or wait using setTimeout
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(state).toEqual(expectedState);
});
```

**Common patterns:**
- `await ctx.drainEvents()` - Process all queued event-driven actions
- `queueMicrotask()` for immediate async scheduling
- `setTimeout(..., ms)` for timing-based waiting
- Proper setup/teardown of async resources in `beforeEach`/`afterEach`

## Error Testing

**Pattern:**
```typescript
it("should throw when condition X occurs", () => {
  expect(() => {
    riskyOperation();
  }).toThrow("Expected error message");
});

it("should handle promise rejection", async () => {
  await expect(asyncRiskyOperation()).rejects.toThrow(
    "Expected error message"
  );
});

it("should catch and forward errors", async () => {
  const errors: Error[] = [];

  handler.onerror = (error) => {
    errors.push(error);
  };

  await triggerError();
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(errors).toHaveLength(1);
  expect(errors[0].message).toBe("Test error");
});
```

## Test Coverage Examples

### Example 1: GitHub Utilities (`packages/ui/src/lib/github.test.ts`)
Tests cover:
- URL parsing (HTTPS, SSH, .git suffix variations)
- Null handling and edge cases
- HTML manipulation (removing anchor icons, adding link attributes)
- Multiple links in single HTML string
- Attribute preservation

```typescript
describe("github utilities", () => {
  describe("extractGitHubRepo", () => {
    it("should extract owner and repo from HTTPS URL", () => {
      const result = extractGitHubRepo("https://github.com/owner/repo");
      expect(result).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should return null for undefined input", () => {
      expect(extractGitHubRepo(undefined)).toBeNull();
    });
  });
});
```

### Example 2: Bridge Transport (`packages/mesh-sdk/src/lib/bridge-transport.test.ts`)
Tests cover:
- Message ordering guarantees
- Bidirectional communication (client->server and server->client)
- Batching behavior
- Transport lifecycle (start, close, double-start prevention)
- Error propagation and recovery
- MCP SDK integration

```typescript
describe("message delivery", () => {
  it("should deliver messages in order client->server", async () => {
    const { client, server } = createBridgeTransportPair();
    const receivedMessages: JSONRPCMessage[] = [];

    await server.start();
    server.onmessage = (message) => {
      receivedMessages.push(message);
    };
    await client.start();

    await client.send(msg1);
    await client.send(msg2);

    await new Promise((resolve) => queueMicrotask(resolve));

    expect(receivedMessages).toHaveLength(2);
    expect(receivedMessages[0]).toEqual(msg1);
    expect(receivedMessages[1]).toEqual(msg2);
  });
});
```

### Example 3: Workflow Orchestrator (`packages/mesh-plugin-workflows/server/engine/__tests__/orchestrator.test.ts`)
Tests cover:
- Linear workflow execution
- Parallel step dispatch and dependency resolution
- Empty workflows and cycle detection
- Step error propagation
- forEach iteration with concurrency limits
- Workflow deadline enforcement

```typescript
describe("Orchestrator", () => {
  describe("linear workflow (A -> B -> C)", () => {
    it("executes steps in order and completes with success", async () => {
      const ctx = createMockOrchestratorContext(storage);

      const executionId = await startWorkflow([
        makeCodeStep("A", IDENTITY_CODE, {}),
        makeCodeStep("B", IDENTITY_CODE, { fromA: "@A" }),
        makeCodeStep("C", IDENTITY_CODE, { fromB: "@B" }),
      ]);

      await ctx.publish("workflow.execution.created", executionId);
      await ctx.drainEvents();

      const execution = await storage.getExecution(executionId, TEST_ORG_ID);
      expect(execution!.status).toBe("success");
    });
  });
});
```

## Test Tools and Config

**Database Testing:**
- In-memory SQLite via `kysely-bun-worker` (BunWorkerDialect with `:memory:`)
- Full schema setup with migrations
- Transaction support for test isolation

**Type Checking in Tests:**
- Full TypeScript support, tests are type-checked
- `tsconfig.json` includes test files by default

**Utilities from Bun Test:**
- `describe(name, fn)` - Test suite
- `it(name, fn)` or `test(name, fn)` - Individual test
- `expect(value)` - Assertion object
- `beforeEach(fn)` - Setup hook
- `afterEach(fn)` - Teardown hook
- Common matchers: `toBe()`, `toEqual()`, `not.toBeNull()`, `toHaveLength()`, `toBeInstanceOf()`, `toThrow()`, `rejects.toThrow()`

---

*Testing analysis: 2026-02-14*
