# Testing Patterns

**Analysis Date:** 2026-02-01

## Test Framework

**Runner:**
- Bun test (native Bun runtime)
- No additional test configuration files required
- Runs via: `bun test`

**Assertion Library:**
- Built-in Bun expect API
- Assertions available: `expect()`, `.toBe()`, `.toEqual()`, `.toBeInstanceOf()`, `.toThrow()`, `.rejects.toThrow()`, etc.

**Mocking Library:**
- Bun's built-in `vi` (Vitest compatibility layer)
- Imported from `"bun:test"`: `import { describe, expect, it, vi } from "bun:test"`

**Run Commands:**
```bash
bun test                          # Run all tests
bun test --watch                  # Watch mode
bun test --coverage               # Coverage report
```

## Test File Organization

**Location:**
- Co-located with source files or in parallel `__tests__` directory
- Patterns found:
  - Co-located: `/apps/mesh/src/core/mesh-context.test.ts` (same directory as source)
  - Parallel directory: `/packages/mesh-plugin-user-sandbox/server/__tests__/` (separate tests folder)

**Naming:**
- Files ending with `.test.ts` or `.test.tsx`
- Match source filename: `mesh-context.ts` → `mesh-context.test.ts`
- E2E tests ending with `.e2e.test.ts`: `/apps/mesh/e2e/connections.spec.ts`, `/apps/mesh/src/api/routes/oauth-proxy.e2e.test.ts`

**Structure:**
```
apps/mesh/src/
├── core/
│   ├── mesh-context.ts
│   ├── mesh-context.test.ts
│   ├── access-control.ts
│   └── access-control.test.ts
apps/mesh/src/tools/organization/
├── create.ts
├── list.ts
└── organization-tools.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from "bun:test";

describe("ComponentOrFunctionName", () => {
  describe("specific feature", () => {
    it("should do something specific", async () => {
      // Arrange
      const input = setupData();

      // Act
      const result = await functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

**Patterns:**
- Top-level `describe()` for the unit being tested
- Nested `describe()` for specific features or methods
- `it()` for individual assertions with descriptive names starting with "should"
- Async test support: `it("name", async () => {})`

**Example from `/Users/guilherme/Projects/mesh/apps/mesh/src/core/mesh-context.test.ts`:**
```typescript
describe("MeshContext Utilities", () => {
  describe("hasOrganization", () => {
    it("should return true when organization is defined", () => {
      const ctx = createMockContext({
        organization: { id: "org_1", slug: "test-org", name: "Test Org" },
      });
      expect(hasOrganization(ctx)).toBe(true);
    });

    it("should return false when organization is undefined", () => {
      const ctx = createMockContext();
      expect(hasOrganization(ctx)).toBe(false);
    });
  });
});
```

## Mocking

**Framework:** Bun's built-in `vi` (Vitest-compatible)

**Patterns:**

Create mock factories for complex objects:
```typescript
const createMockAuth = () => ({
  api: {
    createOrganization: vi.fn().mockResolvedValue({
      id: "org_123",
      slug: "test-org",
      name: "Test Organization",
      logo: null,
      metadata: null,
      createdAt: new Date().toISOString(),
    }),
  },
});
```

Create mock context factory:
```typescript
const createMockContext = (
  authInstance: ReturnType<typeof createMockAuth> = createMockAuth(),
): MeshContext => {
  const boundAuth = createMockBoundAuth(authInstance);
  return {
    timings: { measure: async <T>(_name: string, cb: () => Promise<T>) => await cb() },
    auth: { user: { id: "user_1", email: "test@example.com" } },
    // ... rest of mock properties
  };
};
```

Mock function usage:
```typescript
const mockAuth = createMockAuth();
const ctx = createMockContext(mockAuth);

// Call function under test
const result = await ORGANIZATION_CREATE.execute({ name: "Test" }, ctx);

// Assert the mock was called correctly
expect(mockAuth.api.createOrganization).toHaveBeenCalledWith({
  body: expect.objectContaining({
    name: "Test Organization",
    slug: "test-org",
  }),
});
```

**What to Mock:**
- External services (Better Auth, storage)
- Database connections
- HTTP handlers and APIs
- Configuration that varies between tests

**What NOT to Mock:**
- Core business logic being tested
- Utility functions
- Domain entities and value objects
- Error classes

## Fixtures and Factories

**Test Data Pattern:**
```typescript
function createTestSession(
  overrides?: Partial<UserSandboxSessionEntity>,
): UserSandboxSessionEntity {
  return {
    id: "uss_test",
    template_id: "usb_test",
    organization_id: "org_test",
    external_user_id: "user_123",
    status: "pending",
    app_statuses: {},
    created_agent_id: null,
    redirect_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    ...overrides,
  };
}
```

**Location:**
- Defined at top level of test file or in separate fixture files
- Named with `create` prefix: `createMockContext()`, `createTestSession()`
- Support override pattern via `Partial<T>` spread syntax

## Coverage

**Requirements:** No explicit coverage requirement configured

**View Coverage:**
```bash
bun test --coverage
```

**Coverage observed in tests:**
- Basic unit test coverage for core functionality
- Boundary condition testing (empty strings, unicode, special characters)
- Error path testing (invalid inputs, authorization failures)
- Integration testing with mock dependencies

## Test Types

**Unit Tests:**
- Scope: Individual functions and classes
- Approach: Isolated with mocked dependencies
- Examples:
  - `mesh-context.test.ts`: Testing utility functions with mock context
  - `credential-vault.test.ts`: Testing encryption/decryption with various inputs
  - `access-control.test.ts`: Testing permission checking logic

**Integration Tests:**
- Scope: Multiple components working together
- Approach: Use mock storage and auth services
- Example: `access-control.integration.test.ts` (616 lines)
  - Tests AccessControl with various permission scenarios
  - Uses BoundAuthClient mocks to simulate permission responses

**E2E Tests:**
- Framework: Playwright (found in `.playwright-mcp` directory)
- Pattern: Spec files with `.spec.ts` or `.e2e.test.ts` suffix
- Example: `/apps/mesh/e2e/connections.spec.ts`
- Location: Separate `e2e/` directory in app root

## Common Patterns

**Async Testing:**
```typescript
// Using async/await with expect
it("should validate session", async () => {
  const session = createTestSession();
  const storage = createMockStorage(session);

  const result = await validateSession("uss_test", storage);
  expect(result.id).toBe("uss_test");
});

// Using rejects for error cases
it("should reject expired session", async () => {
  const session = createTestSession({
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  const storage = createMockStorage(session);

  await expect(validateSession("uss_test", storage)).rejects.toThrow(
    SessionAccessError,
  );
});
```

**Error Testing:**
```typescript
// Test both error type and code property
try {
  await validateSession("uss_nonexistent", storage);
} catch (err) {
  expect(err).toBeInstanceOf(SessionAccessError);
  expect((err as SessionAccessError).code).toBe("SESSION_NOT_FOUND");
}

// Or using rejects pattern
await expect(vault.decrypt("invalid-base64!!!")).rejects.toThrow();
```

**Mock Assertion:**
```typescript
// Verify function called with correct arguments
expect(mockAuth.api.createOrganization).toHaveBeenCalledWith({
  body: expect.objectContaining({
    name: "Test Organization",
    slug: "test-org",
    metadata: { description: "Test description" },
    userId: "user_1",
  }),
});

// Verify function was called
expect(mockAuth.api.listOrganizations).toHaveBeenCalledWith({
  query: { userId: "user_1" },
});
```

**Data Validation Testing:**
```typescript
// Test with various inputs
it("should handle special characters", async () => {
  const plaintext = "token!@#$%^&*(){}[]<>?/:;'\"|\\+=~`";
  const encrypted = await vault.encrypt(plaintext);
  const decrypted = await vault.decrypt(encrypted);

  expect(decrypted).toBe(plaintext);
});

it("should handle unicode characters", async () => {
  const plaintext = "Hello 世界 🌍";
  const encrypted = await vault.encrypt(plaintext);
  const decrypted = await vault.decrypt(encrypted);

  expect(decrypted).toBe(plaintext);
});

it("should handle long strings", async () => {
  const plaintext = "a".repeat(10000);
  const encrypted = await vault.encrypt(plaintext);
  const decrypted = await vault.decrypt(encrypted);

  expect(decrypted).toBe(plaintext);
});
```

**Security-Focused Testing:**
```typescript
// Test key generation uniqueness
it("should generate different keys", () => {
  const key1 = CredentialVault.generateKey();
  const key2 = CredentialVault.generateKey();

  expect(key1).not.toBe(key2);
});

// Test encryption produces different ciphertext each time
it("should produce different ciphertext each time", async () => {
  const plaintext = "same-secret";
  const encrypted1 = await vault.encrypt(plaintext);
  const encrypted2 = await vault.encrypt(plaintext);

  expect(encrypted1).not.toBe(encrypted2);
});

// Test tampering detection
it("should throw on tampered ciphertext", async () => {
  const plaintext = "secret";
  const encrypted = await vault.encrypt(plaintext);

  const buffer = Buffer.from(encrypted, "base64");
  buffer[buffer.length - 1] = (buffer[buffer.length - 1] ?? 0) ^ 0xff;
  const tampered = buffer.toString("base64");

  await expect(vault.decrypt(tampered)).rejects.toThrow();
});
```

## Test Coverage Patterns

**Organization Tools (`organization-tools.test.ts` - 543 lines):**
- Happy path testing: successful operations
- Error path testing: missing auth, invalid inputs
- Mock verification: ensuring APIs called with correct arguments
- All CRUD operations covered

**Encryption Tests (`credential-vault.test.ts` - 190 lines):**
- Encrypt/decrypt round-trip verification
- Edge cases: empty strings, special characters, unicode, large files
- Key generation and consistency
- Cross-vault compatibility (same key, different keys)
- Error handling: invalid ciphertext, tampering, truncation

**Access Control Tests (`access-control.test.ts` - 388 lines):**
- Permission checking with mocked BoundAuthClient
- Role-based access (admin, owner bypass)
- Multiple resource checking (OR logic)
- Grant/revoke cycles
- Tool metadata public access checks

---

*Testing analysis: 2026-02-01*
