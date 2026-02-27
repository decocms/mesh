# Implementation Plan: MCP Apps Step 1 — Types, Helpers, CSP & Resource Loader

**Date:** 2026-02-26  
**Status:** Draft  
**Context:** Reimplementing MCP Apps support using `@modelcontextprotocol/ext-apps` SDK after branch reset and SDK installation.

## Overview

Step 1 creates the thin types/helpers layer. The old custom implementation had ~718 lines across types, CSP injector, and resource loader. With the SDK providing protocol types, we reduce to ~350 lines of Mesh-specific code plus re-exports.

## Prerequisites

- `@modelcontextprotocol/ext-apps` installed in `apps/mesh`
- Branch reset completed (old mcp-apps code removed or to be replaced)

---

## 1. Create `apps/mesh/src/mcp-apps/types.ts`

**Target:** ~30–50 lines (mostly re-exports)  
**Old:** 385 lines

### What to Eliminate (SDK provides)

| Old | SDK Replacement |
|-----|-----------------|
| `DisplayMode`, `Theme`, `DeviceCapabilities` | `McpUiDisplayMode`, `McpUiTheme` (device in `McpUiHostContext`) |
| `HostCapabilities`, `HostContext` | `McpUiHostCapabilities`, `McpUiHostContext` |
| `MCP_APP_MIME_TYPE`, `MCP_APP_URI_SCHEME`, `UI_RESOURCE_URI_KEY` | `RESOURCE_MIME_TYPE`, `RESOURCE_URI_META_KEY` (URI scheme is `ui://`) |
| `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcNotification`, `JsonRpcError`, `JsonRpcMessage` | SDK handles internally |
| `UIInitializeParams`, `UIInitializeResult`, `UIToolInputParams`, etc. | `McpUiInitializeRequest`, `McpUiInitializeResult`, `McpUiToolInputNotification`, etc. |
| `isJsonRpcRequest`, `isJsonRpcResponse`, `isJsonRpcNotification` | SDK message routing |
| `ToolMetaWithUI`, `hasUIResource`, `getUIResourceUri`, `isUIResourceUri` | Keep as thin wrappers using SDK constants |

### What to Keep (Mesh-specific)

- **`MCP_APP_DISPLAY_MODES`** — Mesh layout dimension presets (collapsed, expanded, view, fullscreen)
- **`MCPAppDisplayModeKey`** — Type for display mode keys
- **`hasUIResource`**, **`getUIResourceUri`**, **`isUIResourceUri`** — Thin helpers using `RESOURCE_URI_META_KEY` and `ui://` scheme

### Skeleton Implementation

```typescript
/**
 * MCP Apps Types — Thin re-export layer
 *
 * Re-exports SDK types for convenience. Defines Mesh-specific display mode
 * dimensions and metadata helpers.
 */

// Re-export SDK types
export type {
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiDisplayMode,
  McpUiInitializeResult,
  McpUiResourceMeta,
  McpUiResourceCsp,
  McpUiHostStyles,
  McpUiTheme,
} from "@modelcontextprotocol/ext-apps";

export {
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
} from "@modelcontextprotocol/ext-apps";

// Mesh-specific: display mode dimension presets
export const MCP_APP_DISPLAY_MODES = {
  collapsed: { minHeight: 150, maxHeight: 300 },
  expanded: { minHeight: 300, maxHeight: 600 },
  view: { minHeight: 400, maxHeight: 800 },
  fullscreen: { minHeight: 600, maxHeight: 1200 },
} as const;

export type MCPAppDisplayModeKey = keyof typeof MCP_APP_DISPLAY_MODES;

// Mesh-specific: metadata helpers (use SDK constants internally)
const UI_RESOURCE_URI_SCHEME = "ui://";

export interface ToolMetaWithUI {
  [key: string]: unknown;
}

export function hasUIResource(meta: unknown): meta is ToolMetaWithUI {
  // Use RESOURCE_URI_META_KEY, check for string value
}

export function getUIResourceUri(meta: unknown): string | undefined {
  // Use hasUIResource + RESOURCE_URI_META_KEY
}

export function isUIResourceUri(uri: string): boolean {
  return uri.startsWith(UI_RESOURCE_URI_SCHEME);
}
```

### Display Mode Dimensions

| Mode | minHeight | maxHeight |
|------|-----------|-----------|
| collapsed | 150 | 300 |
| expanded | 300 | 600 |
| view | 400 | 800 |
| fullscreen | 600 | 1200 |

All values are numeric pixels to ensure compatibility with Math.min/Math.max in the renderer.

---

## 2. Create `apps/mesh/src/mcp-apps/csp-injector.ts`

**Target:** ~120 lines (keep mostly as-is)  
**Old:** 117 lines

### What to Change

- Import `McpUiResourceCsp` from SDK if CSP config from resource metadata is needed later
- Otherwise keep implementation identical

### What to Keep

- `DEFAULT_CSP` policy string
- `CSPInjectorOptions` interface
- `injectCSP(html, options?)` — inserts `<meta http-equiv="Content-Security-Policy">`
- Options: `allowExternalConnections`, `allowedHosts`, `csp`

### Skeleton (unchanged structure)

```typescript
/**
 * CSP (Content Security Policy) Injector for MCP Apps
 * Mesh-specific security hardening. SDK does not provide CSP injection.
 */

export const DEFAULT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

export interface CSPInjectorOptions {
  csp?: string;
  allowExternalConnections?: boolean;
  allowedHosts?: string[];
}

export function injectCSP(html: string, options: CSPInjectorOptions = {}): string {
  // Same logic as current implementation
}
```

---

## 3. Create `apps/mesh/src/mcp-apps/resource-loader.ts`

**Target:** ~200 lines  
**Old:** 216 lines

### What to Change

- Import `RESOURCE_MIME_TYPE` from `./types.ts` (which re-exports from SDK)
- Replace `MCP_APP_MIME_TYPE` → `RESOURCE_MIME_TYPE`
- Replace `isUIResourceUri` import (unchanged, still from types)
- Use SDK types for resource content shape if available (e.g. `McpUiResourceMeta` for structure)
- **No `getToolUiResourceUri()`** — SDK does not export this; `getUIResourceUri` in types.ts is the Mesh helper for tool metadata

### What to Keep

- `UIResourceContent` interface
- `UIResourceLoadError` class
- `ResourceLoaderOptions` (cacheTTL, maxCacheSize)
- `UIResourceLoader` class with TTL-based caching
- Dev-mode bypass (cacheTTL = 0 when `import.meta.env.DEV`)
- `load()`, `clearCache()`, `invalidate()`

### Skeleton

```typescript
/**
 * Resource Loader for MCP Apps
 * Mesh-specific: fetches UI resources from MCP servers with caching.
 */

import { RESOURCE_MIME_TYPE, isUIResourceUri } from "./types.ts";

export interface UIResourceContent {
  html: string;
  mimeType: string;
  uri: string;
}

export class UIResourceLoadError extends Error { /* ... */ }

export interface ResourceLoaderOptions {
  cacheTTL?: number;
  maxCacheSize?: number;
}

export class UIResourceLoader {
  // Same logic, use RESOURCE_MIME_TYPE for validation
}
```

---

## 4. Tests

### 4.1 `csp-injector.test.ts`

**Action:** Port as-is, adjust imports only.

- Import `injectCSP`, `DEFAULT_CSP` from `./csp-injector`
- No other changes

### 4.2 `resource-loader.test.ts`

**Action:** Port, adjust imports.

- Import `UIResourceLoader`, `UIResourceLoadError` from `./resource-loader`
- MIME type assertions: use `"text/html"` or `RESOURCE_MIME_TYPE` as in current tests (tests use `"text/html"` for simplicity; resource loader accepts both)
- No structural changes

### 4.3 `types.test.ts`

**Action:** Slim down to Mesh-specific tests only.

**Keep:**
- `MCP_APP_DISPLAY_MODES` — all mode dimensions (update expected values if dimensions change)
- `isUIResourceUri` — valid/invalid URIs
- `hasUIResource` — meta object checks
- `getUIResourceUri` — return values

**Remove:**
- Constants tests for `MCP_APP_URI_SCHEME`, `MCP_APP_MIME_TYPE`, `UI_RESOURCE_URI_KEY` — re-export from SDK; optionally add a single smoke test that they match expected values:
  - `RESOURCE_MIME_TYPE` === `"text/html;profile=mcp-app"`
  - `RESOURCE_URI_META_KEY` === `"ui/resourceUri"`

**Update:**
- Display mode assertions if dimensions change (collapsed 150–300, etc.)

---

## File Structure After Step 1

```
apps/mesh/src/mcp-apps/
├── types.ts              (~40 lines, re-exports + MCP_APP_DISPLAY_MODES + helpers)
├── csp-injector.ts       (~120 lines)
├── csp-injector.test.ts  (~115 lines)
├── resource-loader.ts    (~200 lines)
├── resource-loader.test.ts (~200 lines)
└── types.test.ts        (~90 lines, slimmed down)
```

**Excluded from Step 1:** `mcp-app-model.ts` (Step 2+)

---

## Summary: Eliminated vs Kept

| Category | Old | New |
|----------|-----|-----|
| Protocol types | 200+ lines hand-rolled | Re-export from SDK |
| JSON-RPC types | ~40 lines | Eliminated (SDK internal) |
| Type guards | ~30 lines | Eliminated |
| Constants | ~10 lines | Re-export `RESOURCE_MIME_TYPE`, `RESOURCE_URI_META_KEY` |
| Display modes | ~35 lines | Keep, update dimensions |
| Metadata helpers | ~25 lines | Keep, use SDK constants |
| CSP injector | 117 lines | Keep ~120 lines |
| Resource loader | 216 lines | Keep ~200 lines, use SDK MIME type |
| **Total** | **~718** | **~450** |

---

## Implementation Order

1. Add `@modelcontextprotocol/ext-apps` to `apps/mesh` if not present
2. Create `types.ts` (re-exports + Mesh-specific)
3. Create `csp-injector.ts` (copy and adapt)
4. Create `resource-loader.ts` (copy and adapt imports)
5. Port `csp-injector.test.ts`
6. Port `resource-loader.test.ts`
7. Slim `types.test.ts`
8. Run `bun test apps/mesh/src/mcp-apps`
9. Run `bun run fmt`

---

## Verification Checklist

- [ ] `bun test` passes for mcp-apps
- [ ] `bun run check` passes
- [ ] `bun run fmt` applied
- [ ] No direct imports of removed types from other files (mcp-app-model will be updated in later steps)
- [ ] `RESOURCE_MIME_TYPE` and `RESOURCE_URI_META_KEY` match SDK values

---

## Critique Decisions

**Adopted:**
- All `MCP_APP_DISPLAY_MODES` values are numeric pixels (Correctness critic) — strings like `"80vh"` break `Math.min()` in the renderer
- Keep `hasUIResource`, `getUIResourceUri`, `isUIResourceUri` as thin Mesh helpers (Duplication critic) — they provide a convenient API; callers can also use `getToolUiResourceUri` from SDK for tool output detection
- Standardize imports from `@/mcp-apps/types` for app code (Duplication critic) — single import path makes SDK swappable

**Rejected (with reason):**
- "Remove Mesh helpers entirely, use only SDK" (Duplication critic) — `isUIResourceUri` and `hasUIResource` serve different use cases (URI validation, generic meta checks) than the SDK's `getToolUiResourceUri` (tool result extraction)
