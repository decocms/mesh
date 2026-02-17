# Coding Conventions

**Analysis Date:** 2026-02-14

## Naming Patterns

**Files:**
- PascalCase for components: `UpgradePlanModal.tsx`, `Embedded.tsx`
- camelCase for utilities and helpers: `path.ts`, `cache.ts`, `storage.ts`
- camelCase for loaders: `revision.ts`, `published.ts`, `listRevisions.ts`
- camelCase for actions: `publish.ts`, `restore.ts`, `duplicate.ts`
- Snake_case for test files: `select_test.ts`, `path_test.ts`, `storage.test.ts`

**Functions:**
- camelCase for all functions: `pathWithCount()`, `getElStyle()`, `parseHtml()`
- PascalCase for React/Preact components (default exports)
- Verb-prefixed for data fetchers: `listWaitlist()`, `getErrorPatterns()`
- `authContext` export pattern for permission definitions in loaders/actions

**Variables:**
- camelCase for all variables and constants: `ref`, `modalRef`, `base`, `pqueue`
- CONSTANT_CASE for true constants: `DEFAULT_SUBTITLE`, `VOID_ELEMENTS`
- Leading underscore for intentionally unused variables: `_req`, `_error`

**Types and Interfaces:**
- PascalCase for all types: `Props`, `ModalProps`, `TestDocument`, `PerformanceMetricEvent`
- Suffix `Props` for component/function parameter interfaces
- Generic type parameters use PascalCase: `T`, `K`

## Code Style

**Formatting:**
- Deno's built-in `deno fmt` (configured in `deno.json`)
- Exclude CSS files from formatting
- No custom `.prettierrc` - uses Deno defaults
- Line length: Following Deno defaults

**Linting:**
- Deno's built-in linter via `deno lint`
- Configured in `deno.json` with these exclusions:
  - `no-explicit-any`
  - `no-extra-boolean-cast`
  - `react-rules-of-hooks`
  - `react-no-danger`
  - `jsx-button-has-type`
  - `jsx-key`
  - `jsx-no-useless-fragment`
  - `jsx-no-children-prop`

**Pre-commit Hook:**
- `deno task check` runs before commits
- Includes: `deno fmt`, `deno lint`, `deno task check:types`, `deno task check:policies`

## Import Organization

**Order:**
1. Framework imports: `$fresh/`, `preact`, `@preact/signals`
2. Type imports: `import type { ... } from "..."`
3. External packages: npm, JSR, esm.sh imports
4. Internal deco-sites/admin imports: `"deco-sites/admin/..."`
5. Relative imports: `"./file.ts"`, `"../file.ts"`
6. Type-only imports use `import type` keyword

**Path Aliases:**
- `deco-sites/admin/` → `./` (project root)
- `$fresh/` → Fresh framework
- `@deco/deco` → Deco framework
- `preact`, `react` → Preact (react uses compat layer)

**Example from `actions/blocks/publish.ts`:**
```typescript
import { context } from "@deco/deco";
import { asResolved } from "@deco/deco";
import type { WorkflowProps } from "deco-sites/admin/actions/workflows/start.ts";
import { PublishExecutionId } from "deco-sites/admin/loaders/blocks/published.ts";
import type { Manifest } from "deco-sites/admin/runtime.ts";
import {
  assertUserHasAccessToSite,
  authContextBySite,
} from "../../utils/auth.ts";
import { AppContext } from "deco-sites/admin/apps/admin.ts";
import { type Resolvable } from "@deco/deco";
```

## Error Handling

**Patterns:**
- Use `throw new Error(message)` for most cases
- Use `throw Error(e)` when rethrowing caught errors
- Include descriptive error messages with context
- Wrap in try-catch when needed, with specific error handling

**Examples:**
```typescript
// Standard error with context
throw new Error("Invalid repo name: " + repoName);
throw new Error("Site and repo are not the same");
throw new Error(`Failed to fetch with status ${response.status}`);

// Rethrowing caught errors
try {
  // code
} catch (error: any) {
  if (error.name === "AbortError") return;
  throw error;
}

// Logging errors before rethrowing
console.error("error when trying to async publish, falling back to sync version", err);
```

## Logging

**Framework:** `console` object directly (no logging library)

**Patterns:**
- `console.error()` for error conditions
- `console.log()` for debug output and test utilities
- Use template literals for multi-part messages
- Include context/labels for clarity

**Examples from codebase:**
```typescript
console.error("error when trying to async publish, falling back to sync version", err);
console.log("Testing listObjects...");
console.log(prettyDom(doc));
```

## Comments

**When to Comment:**
- JSDoc comments for public APIs (loaders, actions, types)
- Inline comments for non-obvious logic
- TODO/FIXME for known issues or future work
- Comments explaining intent, not code (avoid "this sets x to y")

**JSDoc/TSDoc:**
- Used on loader and action exports
- Includes `@title` for UI-facing labels
- Includes `@description` for UI-facing descriptions
- Field-level JSDoc: `/** Field description */` inline above property
- Parameter descriptions in loader/action Props interfaces

**Examples:**
```typescript
/**
 * @title Error patterns
 * @description Top error patterns for a site. This tool gets the error from production domain, not from the environment.
 */
export default async function errorPatterns(...) { }

export interface Props {
  /** Site name */
  site: string;
  /** Environment name */
  name?: string;
  /**
   * @description if true so the path will be checked agaisnt the coming from request instead of using urlpattern.
   */
  isHref?: boolean;
}
```

**TODO/FIXME Examples:**
```typescript
// TODO: we need to figure out a better way to raise the load event
// TODO: Remove after we migrate everything to name
// FIXME (@mcandeia) hopefully people won't change their default branches
// TODO: try understand and fix this type
```

## Function Design

**Size:**
- Prefer smaller focused functions
- Single responsibility principle
- Long-running setup code can exceed typical limits if necessary

**Parameters:**
- Use destructuring for objects: `{ site, blockId, revision }`
- Prefix underscore for intentionally unused params: `_req: Request, _ctx: AppContext`
- Type-annotate all parameters

**Return Values:**
- Type-annotate all return values
- Async functions use `Promise<T>`
- Server mutations often return `AsyncIterableIterator<Step>` for progress tracking
- Nullable returns use union: `T | null`

**Examples:**
```typescript
export default async function Revision<
  key extends BlockKeys<Manifest> & string = BlockKeys<Manifest> & string,
>(
  { site, blockId, revision }: Props,
  _req: Request,
  { supabaseClient }: AppContext,
): Promise<BlockState<ResolvableOf<key>> | null> { }

export interface Props {
  blockId: string;
  revision: string;
  site: string;
  release?: string;
  value?: Resolvable;
  async?: boolean;
}
```

## Module Design

**Exports:**
- One default export per module (component or function)
- Named exports for types and interfaces
- Re-export auth context: `export { authContextBySite as authContext }`
- Loaders and actions export Props interface for type safety

**Barrel Files:**
- Located at directory level for aggregating exports
- Not always present - imports are often specific to file

**Example from `components/ui/Embedded.tsx`:**
```typescript
export const isPerformanceMetricEvent = (
  e: MessageEvent<any>,
): e is MessageEvent<PerformanceMetricEvent> =>
  e.data.type === "editor::performance-metric";

export interface PerformanceMetricEvent {
  type: "editor::performance-metric";
  args: any;
}

function Embedded(props: Props) { /* ... */ }
export default Embedded;
```

## TypeScript-Specific Patterns

**Type Assertions:**
- Use `@ts-expect-error` comments for known issues
- Preserve intent with explanatory comments
- Use `satisfies` keyword for type checking without narrowing

**Generic Constraints:**
- Applied liberally for type-safe cross-platform code
- Example: `<key extends BlockKeys<Manifest> & string = BlockKeys<Manifest> & string>`

**Nullish Coalescing:**
- Prefer `??` over `||` for defaults
- `const value = config?.value ?? fallback`

---

*Convention analysis: 2026-02-14*
