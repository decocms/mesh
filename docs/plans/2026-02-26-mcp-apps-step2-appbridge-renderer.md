# Implementation Plan: MCP Apps Step 2 — AppBridge-based Renderer Component

**Date:** 2026-02-26  
**Status:** Draft  
**Depends on:** Step 0 (SDK installed), Step 1 (types.ts, csp-injector.ts, resource-loader.ts)

## Overview

This step replaces **both** the old `MCPAppModel` (512 lines) and `MCPAppRenderer` (223 lines) with a single `MCPAppRenderer` component (~150–200 lines) that delegates all JSON-RPC plumbing to the SDK's `AppBridge` and `PostMessageTransport`.

### LOC Impact

| File | Old Lines | New Lines | Change |
|------|-----------|-----------|--------|
| `mcp-app-model.ts` | 512 | 0 (deleted) | -512 |
| `mcp-app-renderer.tsx` | 223 | ~180 | -43 |
| **Total** | **735** | **~180** | **-555 (~75% reduction)** |

---

## What AppBridge Handles vs What Mesh Code Handles

Understanding this boundary is the key design decision of this step.

### AppBridge handles (we delete all custom code for this)

| Concern | Old Mesh Code | SDK Replacement |
|---------|---------------|-----------------|
| JSON-RPC message parsing & routing | `handleMessage()`, `isJsonRpcRequest/Response/Notification` type guards, `switch(request.method)` | `Protocol` base class parses, validates (Zod schemas), and routes automatically |
| Request/response correlation | `pendingRequests` Map, manual ID tracking, `requestId` counter | `Protocol.request()` / `Protocol.setRequestHandler()` with built-in correlation |
| Initialization handshake | `initializeApp()`, `attemptInitialize()`, `sendRequestWithTimeout()` — 60 lines | `AppBridge._oninitialize()` + `oninitialized` setter — automatic |
| Retry logic | `initializeAttempts`, `maxInitializeAttempts`, exponential backoff `setTimeout` | SDK handles version negotiation; transport is reliable once `connect()` resolves |
| State machine | `MCPAppState` enum (`idle→loading→initializing→ready→error`), `setState()` | Replaced by single `oninitialized` callback (binary: initializing or ready) |
| Raw `postMessage` serialization | `iframe.contentWindow.postMessage(JSON.stringify(...))` | `PostMessageTransport.send()` handles serialization + source validation |
| Message source validation | `event.source !== this.iframe.contentWindow` check | `PostMessageTransport` constructor takes `eventSource` and validates internally |
| Protocol version negotiation | Not implemented (custom protocol) | `SUPPORTED_PROTOCOL_VERSIONS`, automatic in `_oninitialize` |
| Host context during init | Manual `hostContext` construction, sent in `ui/initialize` params | `HostOptions.hostContext` passed to constructor, automatically included in init response |

### Mesh code handles (kept or adapted)

| Concern | Implementation |
|---------|----------------|
| CSP injection into HTML | `injectCSP()` from `csp-injector.ts` (Step 1) — called before setting `srcDoc` |
| Iframe rendering & sizing | React component with `<iframe srcDoc>`, `height` state, `overflow-hidden` container |
| Host capabilities declaration | Mesh-specific: which capabilities Mesh supports (tool calls, resources, links, messages) |
| Tool call proxying | `callTool` prop → `bridge.oncalltool` handler (thin adapter) |
| Resource read proxying | `readResource` prop → `bridge.onreadresource` handler (thin adapter) |
| Link opening | `bridge.onopenlink` → validate http/https URL, then `window.open(url, "_blank", "noopener,noreferrer")` |
| Message forwarding | `bridge.onmessage` → `onMessage` prop callback |
| Size change handling | `bridge.onsizechange` → clamped `setHeight()` |
| Loading/error UI | `isLoading` + `error` state with spinner and error display |
| Cleanup on unmount | `bridge.teardownResource({}).catch(() => {})` then `bridge.close()` (fire-and-forget teardown) |
| Theme detection | `matchMedia("(prefers-color-scheme: dark)")` → `McpUiHostContext.theme` |
| Tool input/result delivery | `bridge.sendToolInput()` + `bridge.sendToolResult()` after `oninitialized` |

---

## File to Create: `apps/mesh/src/mcp-apps/mcp-app-renderer.tsx`

### Props Interface

```typescript
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpUiDisplayMode, McpUiMessageRequest } from "@modelcontextprotocol/ext-apps";

interface MCPAppRendererProps {
  /** Prepared HTML content (CSP already injected by caller) */
  html: string;
  /** Resource URI (for display/logging) */
  uri: string;
  /** Tool that triggered this app */
  toolName?: string;
  /** Complete tool arguments */
  toolInput?: Record<string, unknown>;
  /** Tool execution result (CallToolResult shape) */
  toolResult?: CallToolResult;
  /** Display mode hint */
  displayMode?: McpUiDisplayMode;
  /** Minimum iframe height in px */
  minHeight?: number;
  /** Maximum iframe height in px */
  maxHeight?: number;
  /** Proxy tool calls to the MCP server */
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  /** Proxy resource reads to the MCP server */
  readResource: (uri: string) => Promise<ReadResourceResult>;
  /** Forward messages from the app to the conversation */
  onMessage?: (params: McpUiMessageRequest["params"]) => void;
  /** Additional CSS class */
  className?: string;
}
```

**Key changes from old props:**
- `connectionId` removed — the `callTool`/`readResource` closures already capture routing context
- `toolResult` typed as SDK's `CallToolResult` instead of custom `UIToolsCallResult`
- `onMessage` uses SDK's `McpUiMessageRequest["params"]` instead of custom `UIMessageParams`
- Display mode uses SDK's `McpUiDisplayMode` (`"inline" | "fullscreen" | "pip"`)

### Skeleton Implementation

```typescript
import { cn } from "@deco/ui/lib/utils.ts";
import { useRef, useState } from "react";
import {
  AppBridge,
  PostMessageTransport,
  buildAllowAttribute,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type {
  McpUiDisplayMode,
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiMessageRequest,
} from "@modelcontextprotocol/ext-apps";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MCPAppRendererProps {
  html: string;
  uri: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: CallToolResult;
  displayMode?: McpUiDisplayMode;
  minHeight?: number;
  maxHeight?: number;
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  readResource: (uri: string) => Promise<ReadResourceResult>;
  onMessage?: (params: McpUiMessageRequest["params"]) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOST_INFO = { name: "MCP Mesh", version: "1.0.0" } as const;

const HOST_CAPABILITIES: McpUiHostCapabilities = {
  openLinks: {},
  serverTools: {},
  serverResources: {},
  logging: {},
  message: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function buildHostContext(
  displayMode: McpUiDisplayMode,
  maxHeight?: number,
): McpUiHostContext {
  return {
    theme: detectTheme(),
    displayMode,
    availableDisplayModes: ["inline", "fullscreen"],
    ...(maxHeight != null && {
      containerDimensions: { maxHeight },
    }),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MCPAppRenderer({
  html,
  uri,
  toolName,
  toolInput,
  toolResult,
  displayMode = "inline",
  minHeight = 150,
  maxHeight = 600,
  callTool,
  readResource,
  onMessage,
  className,
}: MCPAppRendererProps) {
  const bridgeRef = useRef<AppBridge | null>(null);
  const disposedRef = useRef(false);
  const [height, setHeight] = useState(minHeight);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track bound changes to reset height (without useEffect)
  const prevBoundsRef = useRef({ minHeight, maxHeight });
  if (
    prevBoundsRef.current.minHeight !== minHeight ||
    prevBoundsRef.current.maxHeight !== maxHeight
  ) {
    prevBoundsRef.current = { minHeight, maxHeight };
    setHeight(minHeight);
  }

  // -----------------------------------------------------------------------
  // Iframe ref callback — sets up bridge on mount, tears down on unmount
  // -----------------------------------------------------------------------

  const handleIframeRef = (iframe: HTMLIFrameElement | null) => {
    // Cleanup previous bridge
    if (bridgeRef.current) {
      disposedRef.current = true;
      bridgeRef.current.teardownResource({}).catch(() => {});
      bridgeRef.current.close();
      bridgeRef.current = null;
    }

    if (!iframe) return;

    disposedRef.current = false;

    try {
      const hostContext = buildHostContext(displayMode, maxHeight);

      // 1. Create bridge (null client = manual handlers)
      const bridge = new AppBridge(null, HOST_INFO, HOST_CAPABILITIES, {
        hostContext,
      });
      bridgeRef.current = bridge;

      // 2. Register handlers
      bridge.oncalltool = async (params) => {
        return callTool(params.name, params.arguments ?? {});
      };

      bridge.onreadresource = async (params) => {
        return readResource(params.uri);
      };

      bridge.onopenlink = async ({ url }) => {
        const parsed = (() => { try { return new URL(url); } catch { return null; } })();
        if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Only http and https URLs are allowed");
        }
        window.open(url, "_blank", "noopener,noreferrer");
        return {};
      };

      if (onMessage) {
        bridge.onmessage = async (params) => {
          onMessage(params);
          return {};
        };
      }

      bridge.onsizechange = ({ width, height: h }) => {
        if (disposedRef.current) return;
        if (h != null) {
          setHeight(Math.max(minHeight, Math.min(maxHeight, h)));
        }
      };

      bridge.onloggingmessage = ({ level, data }) => {
        const method = level === "error" ? "error" : "debug";
        console[method](`[MCP App ${toolName ?? uri}]`, data);
      };

      // 3. On initialized — send tool data
      bridge.oninitialized = () => {
        if (disposedRef.current) return;
        setIsLoading(false);
        if (toolInput != null) {
          bridge.sendToolInput({ arguments: toolInput });
        }
        if (toolResult != null) {
          bridge.sendToolResult(toolResult);
        }
      };

      // 4. Create transport and connect
      if (!iframe.contentWindow) {
        console.warn("iframe contentWindow not yet available");
        return;
      }
      const transport = new PostMessageTransport(
        iframe.contentWindow,
        iframe.contentWindow,
      );
      bridge.connect(transport).catch((err) => {
        if (disposedRef.current) return;
        console.error("AppBridge connect failed:", err);
        setError(err instanceof Error ? err.message : "Connection failed");
        setIsLoading(false);
      });
    } catch (err) {
      console.error("Failed to create AppBridge:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-4 text-destructive bg-destructive/10 rounded-lg",
          className,
        )}
      >
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-lg", className)}
      style={{ height: `${height}px` }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading app...</span>
          </div>
        </div>
      )}
      <iframe
        ref={handleIframeRef}
        srcDoc={html}
        sandbox="allow-scripts allow-forms"
        className={cn("w-full h-full border-0", isLoading && "invisible")}
        title={`MCP App: ${toolName ?? uri}`}
      />
    </div>
  );
}
```

**Estimated: ~175 lines.**

---

## Line-by-Line Comparison: What Gets Eliminated

### From `MCPAppModel` (512 lines → 0)

| Lines | Code | SDK Replacement |
|-------|------|-----------------|
| 1–34 | Imports of all custom JSON-RPC types | Not needed — SDK types used at callsite |
| 40–87 | `MCPAppState`, `MCPAppModelEvents`, `MCPAppModelOptions` types | Eliminated — no model class |
| 102–128 | Constructor: CSP injection, host context creation | CSP done by caller; `buildHostContext()` is 10 lines |
| 130–175 | `getState()`, `attach()`: message listener setup, iframe load event, setTimeout retry | `PostMessageTransport` + `bridge.connect()` |
| 177–200 | `detach()`, `dispose()`: cleanup, pending request rejection | `bridge.close()` — one line |
| 202–211 | `sendToolResult()`: manual JSON-RPC notification | `bridge.sendToolResult(result)` — one line |
| 217–256 | `setState()`, `createHostContext()`: theme detection, device detection, capabilities | `buildHostContext()` helper (10 lines) + constructor args |
| 258–318 | `initializeApp()`, `attemptInitialize()`: 3-attempt retry with exponential backoff, timeout | `bridge.oninitialized` callback — SDK handles init handshake |
| 320–353 | `handleMessage()`: source validation, JSON parsing, routing to request/response/notification | `PostMessageTransport` handles source validation + parsing; `Protocol` handles routing |
| 355–369 | `handleResponse()`: pending request map lookup and resolve/reject | `Protocol` base class handles internally |
| 371–423 | `handleRequest()`: method switch for `tools/call`, `resources/read`, `ui/open-link` | Individual setter handlers: `bridge.oncalltool`, `bridge.onreadresource`, `bridge.onopenlink` |
| 425–443 | `handleNotification()`: method switch for `size-changed`, `ui/message` | Setter handlers: `bridge.onsizechange`, `bridge.onmessage` |
| 445–478 | `sendRequestWithTimeout()`: manual JSON-RPC request construction, timeout management | `Protocol.request()` with built-in timeout support |
| 480–511 | `sendResponse()`, `sendNotification()`: manual JSON-RPC serialization + postMessage | `Protocol` handles response sending; `PostMessageTransport.send()` for notifications |

### From `MCPAppRenderer` (223 lines → ~175 lines)

| Lines | Old Code | New Code |
|-------|----------|----------|
| 1–17 | Imports (MCPAppModel, custom types) | Imports (AppBridge, PostMessageTransport, SDK types) |
| 23–53 | `MCPAppRendererProps` interface | Simplified props (no `connectionId`, SDK types) |
| 68–89 | State: `iframeRef`, `modelRef`, `intervalRef`, `prevBoundsRef`, `height`, `isLoading`, `error` | State: `bridgeRef`, `disposedRef`, `height`, `isLoading`, `error`, `prevBoundsRef` — no `intervalRef` |
| 91–99 | Bounds change detection (same) | Same pattern |
| 101–110 | `handleSizeChange`, `handleMessage` callbacks | Inline in bridge setter handlers |
| 112–183 | `handleIframeRef`: create MCPAppModel, attach, **poll state with setInterval** | `handleIframeRef`: create AppBridge, set handlers, connect — **no polling** |
| 186–223 | Render: error state, loading spinner, iframe | Same UI (unchanged) |

---

## State Management

The old implementation had a 5-state machine (`idle → loading → initializing → ready → error`) with polling:

```
Old:  idle → loading → initializing → ready
                 ↘                       ↗
              error ←──── (3 retries) ──┘
      + setInterval(checkState, 100ms) to bridge model → React
```

The new implementation is binary:

```
New:  isLoading=true  ──→  oninitialized  ──→  isLoading=false
                      ──→  catch(err)     ──→  error=message
```

No polling. No retry loop. No state machine. The `oninitialized` callback fires exactly once when the SDK completes the handshake.

---

## Cleanup Strategy

### Old (3 concerns: model + listener + interval)

```typescript
// In handleIframeRef cleanup:
if (intervalRef.current) {
  clearInterval(intervalRef.current);
  intervalRef.current = null;
}
if (modelRef.current) {
  modelRef.current.dispose();   // calls detach() → removes listener, rejects pending
  modelRef.current = null;
}
```

### New (1 concern: bridge)

```typescript
// In handleIframeRef cleanup:
if (bridgeRef.current) {
  bridgeRef.current.teardownResource({}).catch(() => {});
  bridgeRef.current.close();    // closes transport, removes listener
  bridgeRef.current = null;
}
```

The spec says the host MUST call `teardownResource` before closing. Because the ref callback is synchronous and `teardownResource` is async, we fire-and-forget it (`.catch(() => {})`) and then call `bridge.close()` immediately. This satisfies the intent: we signal teardown to the guest before closing the transport. The async nature means we cannot await in a sync ref callback; the iframe is about to be removed.

---

## File to Delete: `apps/mesh/src/mcp-apps/mcp-app-model.ts`

This file is entirely replaced. Every line of `MCPAppModel` maps to SDK functionality:

- Constructor → `new AppBridge(null, hostInfo, capabilities, { hostContext })`
- `attach()` → `bridge.connect(transport)`
- `detach()` / `dispose()` → `bridge.close()`
- `sendToolResult()` → `bridge.sendToolResult()`
- `handleMessage()` → `PostMessageTransport` + `Protocol` routing
- `handleRequest()` → individual setter handlers
- `handleNotification()` → individual setter handlers
- `handleResponse()` → `Protocol` internal correlation
- `sendRequestWithTimeout()` → `Protocol.request()`
- `sendResponse()` → `Protocol` internal
- `sendNotification()` → `Protocol.notification()`
- `createHostContext()` → `buildHostContext()` helper (10 lines)
- `initializeApp()` / `attemptInitialize()` → `oninitialized` callback

---

## Implementation Order

1. **Create** `apps/mesh/src/mcp-apps/mcp-app-renderer.tsx` with the skeleton above
2. **Delete** `apps/mesh/src/mcp-apps/mcp-app-model.ts`
3. **Update** any imports of `MCPAppModel` or old `MCPAppRendererProps` in other files
   - Search for `mcp-app-model` imports across the codebase
   - Search for `MCPAppModel` references
   - Search for old renderer prop types (`UIToolsCallResult`, `UIResourcesReadResult`, `UIMessageParams`)
4. **Clean up** `types.ts`: Remove types only used by the old model (JSON-RPC types, type guards) if Step 1 hasn't already
5. **Run** `bun run fmt`
6. **Run** `bun run check` — fix any type errors
7. **Run** `bun test` — update/add tests as needed

---

## Tests

### Unit Tests for `MCPAppRenderer`

Testing React components with iframes and postMessage is inherently integration-level. Options:

1. **Smoke test**: Verify the component renders without crashing, displays loading state, shows error state on invalid input
2. **Integration test**: Use a mock `PostMessageTransport` to simulate the guest sending `ui/notifications/initialized` and verify `isLoading` transitions to `false`, `sendToolInput` is called, etc.

A minimal test file `mcp-app-renderer.test.tsx` should cover:

- Renders loading spinner initially
- Renders error state when `html` is empty/invalid and bridge fails
- Props are passed through correctly (title attribute, className)

Deep protocol testing is unnecessary — the SDK has its own test suite for `AppBridge` and `PostMessageTransport`.

---

## Edge Cases & Notes

### iframe `sandbox` attribute

The current sandbox is `"allow-scripts allow-forms"`. The SDK provides `buildAllowAttribute(permissions)` for additional permissions (camera, microphone, geolocation, clipboard-write). Future enhancement: accept `McpUiResourcePermissions` in props and combine:

```typescript
const sandbox = "allow-scripts allow-forms";
const allow = buildAllowAttribute(permissions);
// <iframe sandbox={sandbox} allow={allow} ... />
```

This is not included in the initial implementation but is a natural next step when resource metadata includes permission declarations.

### `PostMessageTransport` eventSource validation

The SDK's `PostMessageTransport` validates `event.source === eventSource` internally. This replaces the old manual check `event.source !== this.iframe.contentWindow`. No additional source validation is needed.

### `bridge.connect()` timing

`bridge.connect(transport)` must be called **after** the iframe has loaded enough to have a valid `contentWindow`. The ref callback fires after the iframe element is created but before `srcdoc` content loads. However, `PostMessageTransport` only needs a valid `Window` reference for `postMessage` — the iframe's content script sets up its own listener and initiates the handshake by sending `ui/initialize`. The transport queues outbound messages, so timing is safe.

### No `useEffect`

Per project rules, `useEffect` is banned. The iframe ref callback pattern (`ref={handleIframeRef}`) is the idiomatic alternative: it runs when the DOM node is created/destroyed, which is exactly when we need to set up/tear down the bridge.

### Theme changes

The initial `hostContext` includes the current theme. For live theme changes, the caller can re-render with different props, or future work can add `bridge.setHostContext({ theme: newTheme })`. This is not in scope for Step 2 but is trivially addable since `AppBridge.setHostContext()` handles change detection and notification.

### URL protocol validation for `ui/open-link`

The `onopenlink` handler validates that the URL uses `http:` or `https:` before calling `window.open()`. This prevents `javascript:` or `data:` URLs from being opened, which could be used for XSS or unexpected behavior. Invalid or non-http(s) URLs throw an error that propagates back to the guest.

### `contentWindow` timing

The iframe ref callback can fire before `contentWindow` is available (e.g., if the iframe is created but not yet attached to the DOM, or in edge cases during rapid mount/unmount). The skeleton guards with `if (!iframe.contentWindow) { console.warn(...); return; }` before creating `PostMessageTransport`. Callers should ensure the iframe is rendered with `srcDoc` so that `contentWindow` is typically available; if not, setup is skipped and the bridge is not created.

### Unmount cancellation (`disposedRef`)

Async callbacks (`oninitialized`, `onsizechange`, `connect` catch) can fire after the component has unmounted. A `disposedRef` is set to `true` at the start of cleanup and checked at the top of each callback; if set, the callback returns without updating state. This prevents "Can't perform a React state update on an unmounted component" warnings.

### `getToolUiResourceUri` from SDK

`getToolUiResourceUri` is exported from `@modelcontextprotocol/ext-apps/app-bridge` and should be used by callers (Step 4) to detect UI resources in tool results. It returns the canonical URI format for MCP app UI resources, which is needed when deciding whether a tool result contains an embeddable app.

---

## File Structure After This Step

```
apps/mesh/src/mcp-apps/
├── types.ts                   (from Step 1, ~40 lines)
├── csp-injector.ts            (from Step 1, 117 lines)
├── csp-injector.test.ts       (from Step 1)
├── resource-loader.ts         (from Step 1, 216 lines)
├── resource-loader.test.ts    (from Step 1)
├── types.test.ts              (from Step 1)
├── mcp-app-renderer.tsx       (~175 lines — NEW, replaces 735 lines)
└── mcp-app-model.ts           (DELETED)
```

---

## Verification Checklist

- [ ] `mcp-app-model.ts` deleted
- [ ] `mcp-app-renderer.tsx` compiles with `bun run check`
- [ ] No remaining imports of `MCPAppModel` in the codebase
- [ ] No remaining imports of old types (`UIToolsCallResult`, `UIResourcesReadResult`, `UIMessageParams`, `UISizeChangedParams`) that were only used by the model — or these are aliased/re-exported from SDK types
- [ ] `bun run fmt` applied
- [ ] `bun run lint` passes
- [ ] `bun test` passes (or tests updated)
- [ ] Component renders loading state → ready state in manual browser testing (Step 4+)

---

## Summary

| Metric | Old | New |
|--------|-----|-----|
| Files | 2 (`mcp-app-model.ts` + `mcp-app-renderer.tsx`) | 1 (`mcp-app-renderer.tsx`) |
| Total lines | 735 | ~175 |
| State machine states | 5 (`idle`, `loading`, `initializing`, `ready`, `error`) | 2 (`isLoading`, `error`) |
| Polling intervals | 1 (`setInterval(checkState, 100)`) | 0 |
| Retry logic | 3-attempt exponential backoff | 0 (SDK handles handshake) |
| Manual JSON-RPC code | ~200 lines (parse, route, serialize, correlate) | 0 (SDK `Protocol` class) |
| `window.addEventListener("message")` | Manual setup/teardown | `PostMessageTransport` manages internally |
| Pending request tracking | Custom `Map<id, {resolve, reject}>` | SDK `Protocol` internal |

---

## Critique Decisions

**Adopted:**
- URL protocol validation for `ui/open-link` (Security critic) — restrict to `http:` and `https:`
- `contentWindow` null guard before creating transport (Correctness critic)
- `teardownResource` call before `close()` in cleanup (Documentation critic) — fire-and-forget since ref callback is sync
- `disposedRef` pattern to prevent state updates after unmount (Correctness critic)
- Note that `getToolUiResourceUri` IS exported from SDK (Documentation critic) — callers in Step 4 should use it

**Rejected (with reason):**
- "Add `allow-same-origin` to sandbox" — Intentionally omitted for stronger isolation; `PostMessageTransport` uses `"*"` origin which works with opaque-origin iframes
- "Rate limiting on tool calls from iframe" (Security critic) — Server-side `defineTool` already validates and authorizes; adding client-side rate limits adds complexity without clear benefit at this stage

**Adapted:**
- "Integration tests for AppBridge flow" (Testing critic) — Deferred to post-MVP but added smoke tests for component rendering
