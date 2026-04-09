# Runtime Tool API Refactor: Eliminate Stale Env Closure Bug

**Date:** 2026-04-09
**Status:** Approved

## Problem

The `packages/runtime` tool registration system has a design flaw that causes downstream MCP apps to silently read stale per-request state.

### Root cause

1. `resolveRegistrations()` in `tools.ts` calls tool factory functions once on the first request and caches the result for the process lifetime.
2. Factory functions receive `env` (which contains per-request `MESH_REQUEST_CONTEXT` with state, auth, org info).
3. Downstream tools naturally capture `env` in their `execute` closure — it's the most ergonomic pattern.
4. On subsequent requests, the cached tool definitions still close over the first request's `env`, so tools read stale state.

### Impact

All downstream apps using `withRuntime` with the factory pattern are affected. Confirmed in production: `sites-admin-mcp` serves site `"starting"` for all connections regardless of the `SITE_NAME` in the JWT state, because the first request to the pod happened to be for site `"starting"`.

## Solution

Restructure the tool API so the per-request context is passed directly to `execute` as a second argument, sourced from AsyncLocalStorage. Deprecate the factory pattern that exposes `env` at definition time.

## Design

### 1. New execute/read signatures

Tools, prompts, and resources all get a second `ctx: AppContext` parameter on their handler functions. `ctx` is the per-request `AppContext` retrieved from AsyncLocalStorage — always fresh, never stale.

**Tools:**
```typescript
execute(
  input: { context: z.infer<TSchemaIn>; runtimeContext: AppContext },
  ctx: AppContext
): Promise<...>
```

**Prompts:**
```typescript
execute(
  input: { args: Record<string, string | undefined>; runtimeContext: AppContext },
  ctx: AppContext
): Promise<GetPromptResult>
```

**Resources:**
```typescript
read(
  input: { uri: URL; runtimeContext: AppContext },
  ctx: AppContext
): Promise<ResourceContents>
```

The first argument is unchanged for backward compatibility. Existing tools that only destructure `(input)` or `({ context, runtimeContext })` keep working — extra args are ignored in JS. New tools use `(input, ctx)` to access per-request state.

### 2. withRuntime options: accept direct instances, deprecate factories

**Current type:**
```typescript
tools?: Array<(env: TEnv) => CreatedTool | CreatedTool[] | Promise<...>>
       | ((env: TEnv) => CreatedTool[] | Promise<CreatedTool[]>)
```

**New type (union):**
```typescript
tools?: Array<
  | CreatedTool                                                    // NEW: direct instance
  | ((env: TEnv) => CreatedTool | CreatedTool[] | Promise<...>)   // DEPRECATED: factory
>
| ((env: TEnv) => CreatedTool[] | Promise<CreatedTool[]>)         // DEPRECATED: single factory fn
```

Same change for `prompts` and `resources`.

**Runtime behavior in `resolveRegistrations`:**
- If an array element is a `CreatedTool` (object with `.id` and `.execute`), use it directly.
- If an array element is a function, call it with `env` but log a one-time deprecation warning:
  `[runtime] Passing factory functions to tools/prompts/resources is deprecated. Pass createTool() instances directly.`
- Detection: `typeof element === "function" && !("id" in element)` distinguishes factories from tool objects.

### 3. createTool refactor

`createTool` passes `ctx` as the second argument to the user's execute function:

```typescript
export function createTool(opts) {
  return {
    ...opts,
    execute: (input) => {
      const ctx = createRuntimeContext(input.runtimeContext);
      return opts.execute(
        { ...input, runtimeContext: ctx },
        ctx
      );
    },
  };
}
```

### 4. createPrivateTool: kept but deprecated

```typescript
let warnedPrivateTool = false;

export function createPrivateTool(opts) {
  if (!warnedPrivateTool) {
    console.warn(
      "[runtime] createPrivateTool is deprecated. Use createTool with ensureAuthenticated(ctx) instead."
    );
    warnedPrivateTool = true;
  }
  const execute = opts.execute;
  opts.execute = (input, ctx) => {
    ensureAuthenticated(ctx);
    return execute(input, ctx);
  };
  return createTool(opts);
}
```

### 5. New ensureAuthenticated helper

```typescript
export function ensureAuthenticated(ctx: AppContext): User {
  const reqCtx = ctx.env?.MESH_REQUEST_CONTEXT;
  if (!reqCtx) {
    throw new Error("Unauthorized: missing request context");
  }
  return reqCtx.ensureAuthenticated();
}
```

Exported from `packages/runtime` for inline use in tools.

### 6. Prompt and resource helpers

Same treatment as tools — `createPrompt`, `createPublicPrompt`, `createResource`, `createPublicResource` all pass `ctx` as the second arg to their `execute`/`read` handlers.

### 7. Caching behavior

No change. `resolveRegistrations` continues to cache tool/prompt/resource definitions after first resolution. The cache still serves a purpose for:
- Deprecated factory path: prevents calling factories on every request
- Direct instances: avoids re-flattening arrays and re-resolving async definitions
- The `McpServer` and registrations are created once and reused

The structural fix (passing `ctx` at execution time) eliminates the bug for tools using the new signature. The factory closure bug persists for unmigrated code, but the deprecation warning provides migration pressure.

### 8. Guarantees

| Pattern | Stale state bug? |
|---------|-----------------|
| `(input, ctx) => ctx.env.MESH_REQUEST_CONTEXT.state` | Impossible — `ctx` is per-request from AsyncLocalStorage |
| `(env) => createTool({ execute: () => getConfig(env) })` | Still present — `env` captured at factory time. Deprecation warning logged. |

## Files changed

1. **`packages/runtime/src/tools.ts`** — `createTool`, `createPrivateTool`, `createPrompt`, `createPublicPrompt`, `createResource`, `createPublicResource` signatures and wrappers. `Tool`, `CreatedTool`, `Prompt`, `CreatedPrompt`, `Resource`, `CreatedResource` interfaces. `ToolExecutionContext`, `PromptExecutionContext`, `ResourceExecutionContext` types. `resolveRegistrations` factory detection logic. `registerAll` handler wrappers. New `ensureAuthenticated` export.

2. **`packages/runtime/src/index.ts`** — `CreateMCPServerOptions` type for tools/prompts/resources to accept direct instances in the array. Updated exports for `ensureAuthenticated`.

## Files NOT changed

- `packages/runtime/src/state.ts` — no changes
- `packages/runtime/src/bindings.ts` — no changes
- `apps/mesh/` — uses `defineTool` with `MeshContext`, separate abstraction
- Downstream apps — migrate at their own pace via deprecation warning

## Migration example

**Before (factory pattern — deprecated):**
```typescript
export default withRuntime({
  tools: [
    (env) => createTool({
      id: "list_environments",
      inputSchema: z.object({}),
      execute: async () => {
        const { site } = getConfig(env); // BUG: stale env
        return { environments: await listEnvs(site) };
      },
    }),
  ],
});
```

**After (direct instance — recommended):**
```typescript
export default withRuntime({
  tools: [
    createTool({
      id: "list_environments",
      inputSchema: z.object({}),
      execute: async (input, ctx) => {
        const { site } = getConfig(ctx.env); // SAFE: per-request ctx
        return { environments: await listEnvs(site) };
      },
    }),
  ],
});
```
