# Testing Patterns

**Analysis Date:** 2026-02-14

## Test Framework

**Runner:**
- Deno native test runner (`Deno.test()`)
- No external test framework (Jest, Vitest, etc.)
- Configuration: `deno.json` task `deno test --unstable-http -A .`

**Assertion Library:**
- `@std/assert` from JSR - provides core assertions
- `@std/testing/mock` - provides mocking utilities (`spy`, `assertSpyCalls`, etc.)

**Run Commands:**
```bash
deno task check              # Runs all checks including tests: deno test --unstable-http -A .
deno test --unstable-http -A .     # Run all tests
deno test -A tests/file.ts  # Run single test file
```

**Available Assertions:**
```typescript
import { assertEquals, assertRejects, fail } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { assertObjectMatch, assertArrayIncludes } from "@std/assert";
```

## Test File Organization

**Location:**
- Co-located with source files
- Same directory as implementation: `utils/object.ts` with `utils/object.test.ts`
- Excluded from publication via `deno.json` publish config: `**/*.test.ts`

**Naming:**
- Pattern: `{module}.test.ts`
- Examples: `clients/formdata.test.ts`, `engine/core/mod.test.ts`, `utils/object.test.ts`

**Structure:**
```
/Users/guilherme/Projects/deco
├── utils/
│   ├── object.ts           # Source implementation
│   ├── object.test.ts      # Test file
│   ├── formdata.ts         # Source
│   └── formdata.test.ts    # Test
├── engine/
│   ├── core/
│   │   ├── resolver.ts     # Source
│   │   ├── mod.test.ts     # Test
│   │   └── hints.test.ts   # Test
├── runtime/
│   ├── caches/
│   │   ├── redis.ts        # Source
│   │   └── redis.test.ts   # Test
```

## Test Structure

**Suite Organization:**
```typescript
// From clients/formdata.test.ts
Deno.test("propsToFormData", async (t) => {
  await t.step("primitive values work", () => {
    const formData = propsToFormData({
      foo: "bar",
      baz: 123,
      qux: true,
    });

    assertEquals(formData.get("foo"), "bar");
    assertEquals(formData.get("baz"), "123");
    assertEquals(formData.get("qux"), "true");
  });

  await t.step("nested objects work", () => {
    const formData = propsToFormData(EXAMPLE_OBJECT);

    assertEquals(formData.get("foo.bar"), "baz");
    assertEquals(formData.get("foo.qux"), "123");
  });

  await t.step("root as array throws", () => {
    assertThrows(
      () => {
        propsToFormData([1, 2, 3]);
      },
      Error,
      "Cannot send array as multipart",
    );
  });
});
```

**Patterns:**
- Top-level test via `Deno.test("name", async (t) => { ... })`
- Sub-tests using `t.step("step description", async () => { ... })`
- Each step focuses on single behavior/scenario
- Setup/data shared at test scope (e.g., `EXAMPLE_OBJECT`)

**Resource Cleanup:**
```typescript
Deno.test({
  name: ".match",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  // Test that opens resources (Redis, network)
  // Resources not automatically closed - disabled sanitization
});
```

- Resource/ops sanitization disabled when testing integration with external systems
- Used in `redis.test.ts` to allow Redis connections to remain open

## Mocking

**Framework:**
- `@std/testing/mock` provides `spy()`, `assertSpyCalls()`, `assertSpyCall()`
- No external mocking library

**Patterns:**

**Basic Spy Usage:**
```typescript
// From engine/core/mod.test.ts
const shouldNotBeCalledResolver = (parent: unknown): unknown => {
  return Promise.resolve(parent);
};
const resolverMap = {
  ...defaults,
  resolve: (data: unknown) => context.resolve(data),
  shouldNotBeCalledResolver: spy(shouldNotBeCalledResolver),
};
```

**Asserting Spy Calls:**
```typescript
import { assertSpyCalls, spy } from "@std/testing/mock";

// Verify spy was called specific number of times
assertSpyCalls(mockFunc, 3);
assertSpyCall(mockFunc, 0, { args: [expectedArg] });
```

**Manual Mocking via Interfaces:**
```typescript
// From runtime/caches/redis.test.ts
const store: RedisConnection = {
  get: (cacheKey: string): string => {
    const data: { [key: string]: string } = {
      "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3test": JSON.stringify({
        body: "body",
        status: 200,
      }),
    };
    return data[cacheKey];
  },
} as unknown as RedisConnection;

await t.step("when the cache key exists", async () => {
  const client = create(store, namespace);
  const response = await client.match("test");
  assertEquals(response?.status, 200);
  assertEquals(await response?.text(), "body");
});
```

**What to Mock:**
- External interfaces/dependencies: Redis, HTTP, file systems
- Time-dependent behavior: `setTimeout()` simulated with long delays in test
- Complex sub-dependencies where response is predictable

**What NOT to Mock:**
- Pure utility functions: test actual implementation
- Core business logic: mock only external dependencies
- Types/interfaces that are implementation details

## Fixtures and Factories

**Test Data:**
```typescript
// From clients/formdata.test.ts
const EXAMPLE_FILE = new File(["foo"], "foo.txt");
const EXAMPLE_OBJECT = {
  foo: {
    bar: "baz",
    qux: "123",
    quux: "true",
  },
  myFile: EXAMPLE_FILE,
  baz: [
    {
      qux: "quux",
      quuz: "123",
      corge: "true",
    },
    {
      qux: "quux",
      quuz: "123",
      corge: "true",
    },
    "qux",
  ],
};

Deno.test("propsToFormData", async (t) => {
  await t.step("nested objects work", () => {
    const formData = propsToFormData(EXAMPLE_OBJECT);
    assertEquals(formData.get("foo.bar"), "baz");
  });
});
```

**Factory Pattern:**
```typescript
// From engine/core/mod.test.ts
const getSchemeableFor = async (
  name: string,
): Promise<Schemeable | undefined> => {
  const ast = await parsePath(toFileUrl(path).toString());
  return await typeNameToSchemeable(name, {
    path,
    parsedSource: ast!,
    importMapResolver: ImportMapBuilder.new(),
  });
};
```

**Location:**
- Test data constants defined at file scope (reused across tests)
- Helper functions defined at file scope for test setup
- Shared fixtures referenced by multiple test cases
- Data structures kept simple and explicit (not framework-generated)

## Coverage

**Requirements:**
- No explicit coverage target enforced
- Coverage can be generated via `deno coverage` command (not shown in config)
- Critical paths expected to be tested based on test file presence

**View Coverage:**
```bash
deno coverage --lcov > coverage.lcov
```

## Test Types

**Unit Tests:**
- Scope: Individual functions and pure logic
- Approach: Direct function invocation, assert outputs
- No external dependencies called
- Examples: `utils/object.test.ts`, `clients/formdata.test.ts`

**Integration Tests:**
- Scope: Component interaction with external systems
- Approach: Mock external interfaces, verify integration points
- External systems (Redis, databases) mocked via interface implementation
- Examples: `runtime/caches/redis.test.ts` (Redis integration)

**E2E Tests:**
- Framework: Not detected
- Current approach: Manual/CI-based validation
- No dedicated E2E test runner in codebase

## Benchmarks

**Framework:**
- Deno native benchmark runner (`Deno.bench()`)
- Files: `*.bench.ts` excluded from publication
- Run command: `deno bench -A .`

**Structure:**
```typescript
// From blocks/loader.bench.ts
import hash from "https://esm.sh/v135/object-hash@3.0.0";

const props = {
  randomObject: { foo: "bar", baz: 42 },
  randomString: "Hello World",
  randomNumber: 42,
  randomBoolean: true,
};

const tests = [props];

Deno.bench("hash", { group: "object-hash" }, () => {
  for (const test of tests) {
    hash(test);
  }
});

Deno.bench("hash with options", { group: "object-hash" }, () => {
  for (const test of tests) {
    hash(test, {
      ignoreUnknown: true,
      respectType: false,
      respectFunctionProperties: false,
    });
  }
});
```

**Patterns:**
- Group related benchmarks: `{ group: "object-hash" }`
- Compare algorithm variants and options
- Isolate performance measurements with loop over dataset
- Minimal setup per iteration

## Common Patterns

**Async Testing:**
```typescript
Deno.test("async operation", async (t) => {
  await t.step("should resolve", async () => {
    const result = await asyncFunc();
    assertEquals(result, expectedValue);
  });

  await t.step("should reject on error", async () => {
    await assertRejects(
      () => asyncFunc("invalid"),
      Error,
      "expected error message",
    );
  });
});
```

**Error Testing:**
```typescript
// From clients/formdata.test.ts
await t.step("root as array throws", () => {
  assertThrows(
    () => {
      propsToFormData([1, 2, 3]);
    },
    Error,
    "Cannot send array as multipart",
  );
});

// Async error testing
await assertRejects(
  () => resolve({ __resolveType: "not_found_resolver" }, context),
  "Dangling reference of: not_found_resolver",
);
```

**Data Assertion:**
```typescript
// From engine/core/mod.test.ts
assertEquals(clone, resolvableMap);  // Deep equality

// Partial matching
assertObjectMatch(transformed, {
  jsDocSchema: {},
  type: "object",
  file: "data:text/tsx,export interface MyDataUriType { a: string; };",
});

// Array inclusion
assertArrayIncludes(
  Object.keys(result),
  ["a"],
  'object keys should include "a"',
);
```

## Test Isolation and Dependencies

**Test Data Sharing:**
- Immutable data defined at file scope: `EXAMPLE_FILE`, `EXAMPLE_OBJECT`
- Each test step gets fresh reference (objects cloned or independent)
- No test pollution from shared state modifications

**Dependencies Between Tests:**
- None - each test is independent
- Can run in any order
- No setup/teardown required between tests

---

*Testing analysis: 2026-02-14*
