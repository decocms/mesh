# Coding Conventions

**Analysis Date:** 2026-02-14

## Naming Patterns

**Files:**
- Lowercase with `.ts`, `.tsx`, `.test.ts`, `.bench.ts` extensions
- Descriptive names: `formdata.ts`, `resolver.ts`, `schemeable.ts`
- Test files co-located with source: `utils/object.ts` paired with `utils/object.test.ts`
- Benchmark files alongside tests: `engine/core/mod.bench.ts`

**Functions:**
- camelCase: `pickPaths()`, `propsToFormData()`, `formDataToProps()`
- Prefix utilities: `escapeDots()`, `unescapeDots()`, `tryGetVersionOf()`
- Descriptive and action-oriented: `tryOrDefault()`, `isAwaitable()`, `notUndefined()`

**Variables:**
- camelCase: `testObj`, `formData`, `resolverMap`, `resolvableMap`
- Constants in UPPER_SNAKE_CASE: `RESOLVE_TYPES`, `ENV_SITE_NAME`, `DENO_REGION`
- Abbreviations used sparingly: `idx` for array index, `ref` for reference, `ctx` for context
- Type variables prefixed with `T`: `TProps`, `TState`, `TResp`, `TContext`, `TResolverMap`

**Types:**
- PascalCase interfaces and types: `LoaderModule`, `BaseContext`, `Resolvable`, `ResolveChain`
- Union types composed: `PropFieldResolver | ResolvableFieldResolver | ResolverFieldResolver`
- Generic type parameters prefixed with `T`: `<T>`, `<TProps>`, `<TState>`
- Record/Map types explicit: `Record<string, Resolvable<any>>`, `Record<string, Resolver>`

## Code Style

**Formatting:**
- Deno's built-in formatter (deno fmt) - enforced
- No custom prettier config
- Line length follows deno defaults

**Linting:**
- Deno's built-in linter (deno lint) - enforced
- Common ignores file-wide:
  - `// deno-lint-ignore-file no-explicit-any` - Used in generic/dynamic code (`blocks/loader.ts`, `blocks/action.ts`, `engine/core/resolver.ts`)
  - `// deno-lint-ignore-file ban-types` - Used with type-heavy modules (`blocks/app.ts`, `blocks/workflow.ts`)
  - `// deno-lint-ignore no-empty-interface` - Used for interface-only exports (`blocks/account.ts`)
- Inline ignores for specific violations where justified

**JSX/TSX:**
- Automatic JSX runtime: `/** @jsxRuntime automatic */` at file top
- Import source: `/** @jsxImportSource preact */` specified explicitly
- Example from `runtime/handler.tsx`:
```typescript
/** @jsxRuntime automatic */
/** @jsxImportSource preact */
import {
  type ComponentChildren,
  type ComponentType,
  createContext,
} from "preact";
```

## Import Organization

**Order:**
1. File-level directives and JSX pragmas (if JSX file)
2. Deno references: `/// <reference ...>`
3. Standard library imports: `@std/*` from JSR
4. First-party dependencies: `@deco/*` packages
5. Third-party imports: `npm:`, `jsr:`, absolute URLs
6. Internal relative imports: `../` and `./` paths
7. Type-only imports grouped with their runtime counterparts

**Path Aliases:**
- No path aliases in deno.json - imports use relative paths or absolute JSR/npm paths
- Scoped imports via `deno.json` scopes for CDN-hosted versions (e.g., `deco/` points to JSR version)
- Explicit URL imports for specific versions when needed

**Import Examples:**

From `blocks/loader.ts`:
```typescript
import JsonViewer from "../components/JsonViewer.tsx";
import { RequestContext } from "../deco.ts";
import { ValueType } from "../deps.ts";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { FieldResolver } from "../engine/core/resolver.ts";
import { singleFlight } from "../engine/core/utils.ts";
import type { DecofileProvider } from "../engine/decofile/provider.ts";
import { HttpError } from "../engine/errors.ts";
import type { ResolverMiddlewareContext } from "../engine/middleware.ts";
import type { State } from "../mod.ts";
import { logger } from "../observability/otel/config.ts";
import { meter, OTEL_ENABLE_EXTRA_METRICS } from "../observability/otel/metrics.ts";
import { caches, ENABLE_LOADER_CACHE } from "../runtime/caches/mod.ts";
import { inFuture } from "../runtime/caches/utils.ts";
import type { DebugProperties } from "../utils/vary.ts";
```

From `engine/core/mod.test.ts`:
```typescript
import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { genHints } from "../../engine/core/hints.ts";
import { type BaseContext, resolve, type ResolverMap } from "../../engine/core/resolver.ts";
import defaults from "../manifest/fresh.ts";
```

## Error Handling

**Patterns:**
- Domain errors via custom `HttpError` class that wraps Response: `throw new HttpError(resp)`
- HTTP status helpers via curried functions: `forbidden()`, `unauthorized()`, `notFound()`, `badRequest()`
- Error shortcircuit via `shortcircuit(response)` which throws `HttpError` to halt execution
- Type-safe DanglingReference error: `new DanglingReference(resolverType)`
- Assertion functions for early validation: `assertEquals()`, `assertRejects()` from `@std/assert`

**Example from `runtime/errors.ts`:**
```typescript
export class HttpError extends Error {
  public status: number;
  constructor(public resp: Response) {
    super(`http error ${resp.status}`);
    this.status = resp.status;
  }
}

export const status = (status: number): ResponseErrorBuilder =>
  (err?: HttpErrorMessage, headers?: Headers) => {
    const mHeaders = headers ?? new Headers();
    if (err) {
      mHeaders.set("content-type", "application/json");
    }
    shortcircuit(
      new Response(err ? JSON.stringify(err) : null, {
        status,
        headers: mHeaders,
      }),
    );
  };

export const forbidden: ResponseErrorBuilder = status(403);

export const shortcircuit = (resp: Response): never => {
  throw new HttpError(resp);
};
```

## Logging

**Framework:** `@std/log` via Logger class

**Patterns:**
- Logger imported and used via static method: `logger` variable from `observability/otel/config.ts`
- OpenTelemetry integration: `OpenTelemetryHandler` in `observability/otel/logger.ts`
- Context-aware logging with resource metadata (service name, version, instance ID)

**Example from `observability/otel/config.ts`:**
```typescript
import * as log from "@std/log";
import { Logger } from "@std/log/logger";
import { logger } from "../observability/otel/config.ts";
```

## Comments

**When to Comment:**
- JSDoc for public API functions and types
- Complex algorithms benefit from step-by-step comments
- Deprecations clearly marked: `@deprecated since version X`
- Business logic that isn't self-documenting

**JSDoc/TSDoc:**
- Used for module exports and public interfaces
- Parameter descriptions with `@param` tags
- Return type documentation with `@returns` tag
- Example from `clients/formdata.ts`:

```typescript
/**
 * Convert a javascript object to a FormData instance.
 *
 * Usage:
 * ```ts
 * const formData = propsToFormData({ foo: "bar", baz: [1, 2, 3] });
 * formData.get("foo"); // "bar"
 * formData.get("baz.0"); // 1
 * ```
 *
 * @param props Can be any valid serializable javascript object.
 * Arrays as root will throw an error, since we cannot represent them as multipart.
 * @returns FormData instance with the given props.
 */
export function propsToFormData(props: unknown): FormData {
```

- Deprecation notices with version: `@deprecated use cacheKey instead`

## Function Design

**Size:**
- Prefer modular functions under 100 lines
- Recursive helpers acceptable when encapsulated (e.g., `pickPath` helper in `utils/object.ts`)

**Parameters:**
- Typed explicitly, no implicit `any`
- Generic types used for flexible functions: `<T, K extends DotNestedKeys<T>>()`
- Object destructuring for multiple parameters common

**Return Values:**
- Explicit return types on exported functions
- Promise<T> for async operations
- Union return types when multiple outcomes: `string | null`
- Example from `utils/object.ts`:
```typescript
export const pickPaths = <T, K extends DotNestedKeys<T>>(
  obj: T,
  paths: K[],
): DeepPick<T, K> => {
  // implementation
}
```

## Module Design

**Exports:**
- Explicit named exports preferred over default exports
- Type exports separated: `export type { Foo }` vs `export { bar }`
- Barrel files (e.g., `blocks/mod.ts`, `utils/mod.ts`) re-export public API
- Example from `blocks/mod.ts`:
```typescript
export type { Accounts } from "./account.ts";
export type { Loader } from "./loader.ts";
export { default as blocks, defineBlock } from "./index.ts";
export { isSection, type Section } from "./section.ts";
```

**Barrel Files:**
- Located at `mod.ts` or `index.ts` in each directory
- Re-export public types and functions
- Hide implementation details
- Used as single entry point for packages (e.g., `export * from "./mod.ts"` in `mod.ts` root)

**Module Organization:**
- Each logical unit (blocks, clients, engine) has own directory
- Related utilities grouped: `engine/core/`, `runtime/middlewares/`, `observability/otel/`
- Test files co-located with sources

---

*Convention analysis: 2026-02-14*
