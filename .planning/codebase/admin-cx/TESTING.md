# Testing Patterns

**Analysis Date:** 2026-02-14

## Test Framework

**Runner:**
- Deno test (native Deno runtime)
- Command: `deno test -A --parallel --trace-ops [file]`
- No external test runner needed

**Assertion Library:**
- `@std/assert` from JSR (jsr:@std/assert@^1.0.2)
- Imports: `assertEquals`, `assertThrows`, `assertMatch`, `assertRejects`, `assertStringIncludes`
- Snapshot testing: `assertSnapshot` from `@std/testing`

**Run Commands:**
```bash
deno task test:components       # Run component tests with Puppeteer
deno test -A tests/components/select_test.ts  # Single test file
deno task check:types           # Type-check code
deno task check                 # Full checks (fmt, lint, types, policies)
```

## Test File Organization

**Location:**
- Co-located with source: `*.test.ts` or `*_test.ts`
- Centralized test suites in `tests/` directory
- Component-level tests in `tests/components/`
- Unit tests co-located with utilities

**Naming:**
- Suffix convention: `_test.ts` (examples: `select_test.ts`, `path_test.ts`)
- Alternative: `.test.ts` (examples: `storage.test.ts`)
- Test files match the module they test

**Structure:**
```
/Users/guilherme/Projects/admin-cx/
├── tests/
│   └── components/
│       ├── select_test.ts        # Component integration tests
│       ├── test_utils.ts         # Shared test utilities
│       ├── deps.ts               # Test dependencies
│       └── fixtures/             # Test fixtures and setup
├── sdk/
│   ├── utils/
│   │   └── path_test.ts          # Co-located unit test
│   └── storage.test.ts           # Co-located unit test
```

## Test Structure

**Suite Organization:**
```typescript
import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.16";
import { pathWithCount } from "./path.ts";

Deno.test("pathWithCount function", async (t) => {
  await t.step("should append count to the filename with extension", () => {
    const result = pathWithCount("admin/logo.png", 2);
    assertEquals(result, "admin/logo-2.png");
  });

  await t.step("should append count to the filename without extension", () => {
    const result = pathWithCount("admin/logo", 2);
    assertEquals(result, "admin/logo-2");
  });

  await t.step("should error on empty path", () => {
    assertThrows(
      () => {
        pathWithCount("", 2);
      },
      Error,
      "Path cannot be empty",
    );
  });
});
```

**Patterns:**
- Single `Deno.test()` per logical test suite
- Nested steps using `t.step()` for fine-grained test organization
- Async functions for tests with async operations
- Clear test names describing behavior and expected outcome

## Mocking

**Framework:** Native test utilities + custom helpers

**Patterns:**
- No external mocking library
- Use `withPageName()` for browser testing with Puppeteer
- Use `withFresh()` for server testing
- Use `fakeServe()` for fake Fresh server instances
- Manual mocking with factory functions or test data builders

**Example - Browser Testing:**
```typescript
import { withPageName } from "deco-sites/admin/tests/components/test_utils.ts";
import { assertEquals } from "./deps.ts";

Deno.test("Select open on click", async () => {
  await withPageName(
    "./tests/components/fixtures/main.ts",
    async (page, address) => {
      await page.goto(`${address}/select`);
      await page.click("#select-default");

      const firstOptEl = await page.waitForSelector('[id="1"]');
      const firstOptText = await firstOptEl?.evaluate((el) => el.textContent);
      assertEquals("1", firstOptText);
    },
  );
});
```

**Example - Server Testing:**
```typescript
export async function withFresh(
  name: string | { name: string; options: Omit<Deno.CommandOptions, "args"> },
  fn: (address: string) => Promise<void>,
) {
  // Spawns test server, runs callback, cleans up
  const { lines, serverProcess, address } = await startFreshServer({
    args: ["run", "--unstable", "-A", file],
  });

  try {
    await fn(address);
  } finally {
    serverProcess.kill("SIGTERM");
    await serverProcess.status;
    for await (const _ of lines) { /* noop */ }
  }
}
```

**What to Mock:**
- Browser interactions (click, navigate, wait for selector)
- Page DOM queries and evaluations
- Server startup and requests

**What NOT to Mock:**
- Core business logic (test real implementations)
- Type checking (test actual types)
- Assertions and comparisons

## Fixtures and Factories

**Test Data:**
Located in `tests/components/fixtures/`:
- `main.ts` - Main test app entry point
- `dev.ts` - Development server setup
- `fresh.config.ts` - Fresh framework config for tests
- `fresh.gen.ts` - Auto-generated routes/islands for tests
- `tailwind.config.ts` - Tailwind config for tests
- `static/` - Static files for testing (excluded from git)

**Location:**
- Component fixtures: `tests/components/fixtures/`
- Shared test utilities: `tests/components/test_utils.ts`
- Test dependencies: `tests/components/deps.ts`

**Helper Functions from `test_utils.ts`:**
```typescript
export function parseHtml(input: string): TestDocument
export async function startFreshServer(options: Deno.CommandOptions)
export async function fetchHtml(url: string)
export function assertSelector(doc: Document, selector: string)
export function assertNotSelector(doc: Document, selector: string)
export function assertTextMany(doc: Document, selector: string, expected: string[])
export function assertTextMatch(doc: Document, selector: string, regex: RegExp)
export async function withPageName(name: string, fn: (page: Page, address: string) => Promise<void>)
export async function clickWhenListenerReady(page: Page, selector: string)
export async function waitForText(page: Page, selector: string, text: string)
export async function waitForStyle(page: Page, selector: string, name: keyof CSSStyleDeclaration, value: string)
export async function recreateFolder(folderPath: string)
export async function runBuild(fixture: string)
export async function waitFor(fn: () => Promise<unknown> | unknown): Promise<void>
```

## Coverage

**Requirements:** Not enforced in `deno.json`

**View Coverage:**
- Use `deno test --coverage=<dir>` to generate coverage
- No pre-configured command; must be run manually with flags

## Test Types

**Unit Tests:**
- Scope: Individual functions and utilities
- Location: Co-located with source (e.g., `sdk/utils/path_test.ts`)
- Approach: Test pure functions with various inputs/outputs
- Example: `pathWithCount()` testing with different paths and edge cases

**Integration Tests:**
- Scope: Multi-component interaction and data flow
- Location: `tests/components/` for UI integration
- Approach: Start server, navigate pages, verify DOM/behavior
- Example: `select_test.ts` testing Select component interaction with Puppeteer

**E2E Tests:**
- Framework: Cypress (configured but not actively used in recent tests)
- Location: `tests/cypress/` (legacy, appears unused)
- Alternative: Browser testing via Puppeteer in `tests/components/`

## Common Patterns

**Async Testing:**
```typescript
// Using async/await
Deno.test("async operation", async () => {
  const result = await asyncFunction();
  assertEquals(result, expected);
});

// Using t.step for nested async tests
Deno.test("complex flow", async (t) => {
  await t.step("step 1", async () => {
    await operation1();
  });

  await t.step("step 2", async () => {
    await operation2();
  });
});
```

**Error Testing:**
```typescript
Deno.test("error handling", () => {
  assertThrows(
    () => {
      functionThatThrows();
    },
    Error,
    "Expected error message",
  );
});

// For async errors
Deno.test("async error handling", async () => {
  await assertRejects(
    async () => {
      await asyncFunctionThatThrows();
    },
    Error,
    "Expected error message",
  );
});
```

**DOM Testing Pattern:**
```typescript
// Parse HTML
const doc = parseHtml(htmlString);

// Query and assert
assertSelector(doc, ".my-element");
assertNotSelector(doc, ".missing-element");

// Text content assertions
assertTextMany(doc, "li", ["item1", "item2", "item3"]);
assertTextMatch(doc, ".error", /error occurred/);

// Debug output
doc.debug(); // Prints pretty-printed DOM
```

**Page/Browser Testing Pattern:**
```typescript
Deno.test("browser interaction", async () => {
  await withPageName(
    "./tests/components/fixtures/main.ts",
    async (page, address) => {
      // Navigate
      await page.goto(`${address}/page`);

      // Wait for elements
      const el = await page.waitForSelector("#element");

      // Interact
      await page.click("#button");

      // Wait for state changes
      await waitForText(page, ".status", "loaded");

      // Verify
      const text = await el?.evaluate((el) => el.textContent);
      assertEquals(text, "expected");
    },
  );
});
```

## Test Dependencies

**From `tests/components/deps.ts`:**
```typescript
// Assertions
export { assert, assertEquals, assertThrows, ... } from "@std/assert@0.211.0"
export { assertSnapshot } from "@std/testing"

// Browser testing
export { default as puppeteer, Page } from "puppeteer@16.2.0"

// DOM parsing
export { Document, DOMParser, HTMLElement, HTMLMetaElement } from "linkedom@0.15.1"

// Utilities
export { delay } from "@std/async"
export { retry } from "@std/async"
export * as colors from "@std/fmt/colors"
export { TextLineStream } from "@std/streams"
export { basename, dirname, join, toFileUrl } from "@std/path"
```

## Pre-commit Behavior

**Hook:** Runs `deno task check` before commits
- Includes `deno fmt` (formatting check)
- Includes `deno lint` (linting)
- Includes `deno task check:types` (type checking)
- Includes `deno task check:policies` (permission policies)
- Tests NOT run on pre-commit (manual trigger only)

---

*Testing analysis: 2026-02-14*
