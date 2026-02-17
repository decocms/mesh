# Phase 9: Preview Bridge - Research

**Researched:** 2026-02-16
**Domain:** iframe postMessage consolidation, click-to-select overlays, live prop editing, edit/interact mode toggle
**Confidence:** HIGH

## Summary

Phase 9 consolidates iframe communication into a single reliable path, removes dead code, and makes click-to-select plus live prop editing work end-to-end. The codebase currently has **two parallel iframe communication paths**: (1) `useIframeBridge` in PreviewPanel which handles the ready handshake, page-config sending, block selection, and block-click events via `useSyncExternalStore`, and (2) `useEditorMessages` in PageComposer which duplicates the send functionality via a disconnected `iframeRef`. The composer's `iframeRef` (line 74) is never attached to any DOM element -- it's a dead ref -- while the real iframe is managed by PreviewPanel's `useIframeBridge.setIframeRef`.

The protocol types (`editor-protocol.ts`) already define a clean typed message union (`EditorMessage` | `SiteMessage`) with the `"deco:"` prefix convention. However, there is **no site-side client code** -- the starter template's route files (`home.tsx`, `$.tsx`) render sections statically from JSON with no postMessage listener, no `data-block-id` attributes, and no overlay injection. The site needs a thin client-side script that: (1) sends `deco:ready` on load, (2) listens for `deco:page-config` and `deco:update-block` messages, (3) renders hover overlays and emits `deco:block-clicked` on click. This script can be injected at runtime or provided as a package.

The edit/interact mode toggle is a new concept not present in the codebase. It needs to be added to PreviewPanel's toolbar area (next to the URL bar). In edit mode, the injected overlay script intercepts clicks for section selection. In interact mode, clicks pass through normally, and the editor watches for navigation events to silently follow internal page changes.

**Primary recommendation:** Remove the dead `iframeRef` + `useEditorMessages` from PageComposer, route all sends through `useIframeBridge` (lifting the bridge result to the composer), formalize the protocol types as the shared contract, build the site-side overlay client, and add the edit/interact mode toggle.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Click-to-select interaction:**
  - Hover state: semi-transparent colored overlay on the section area (not outline border)
  - Selected state: no persistent visual in the preview -- the sidebar prop editor opening is the indication
  - Nested sections: always select the innermost (deepest) section under the cursor
  - Click-away deselects: clicking outside any section closes the prop editor and clears selection

- **Edit/Interact mode toggle:**
  - A toggle next to the preview URL bar with a cursor icon switches between edit mode and interact mode
  - Edit mode (default): clicks select sections for editing
  - Interact mode: clicks work normally (links, buttons, etc.)
  - Internal page navigation in interact mode: auto-switch the page editor silently (update URL bar + load that page's sections)
  - External link navigation: allow it, disable the editor, provide a way to go back

- **Live editing feedback:**
  - Instant hot-swap: send new props immediately via postMessage, preview re-renders in place with no transition
  - No visual indicator during prop application -- the visual change itself is the feedback
  - Discard prop edits during iframe navigation -- user re-edits after the new page loads
  - Trust live state on save -- no full page reload to confirm persisted data

- **Error & edge states:**
  - Iframe disconnect (dev server crash): dim the preview with an overlay message + manual reconnect button
  - Section render error after prop change: show the error in-place where the section would be
  - Navigation detection handles internal vs external links differently (see edit/interact mode above)

- **Dead code cleanup:**
  - Audit and clean: don't just remove known dead refs -- audit all iframe-related code across the composer for anything unused
  - Consolidate duplicates: merge any duplicate iframe communication paths into the single useIframeBridge source of truth
  - Formalize postMessage protocol: create a shared typed message union that both admin and iframe client use
  - Protocol types live in the plugin package (mesh-plugin-site-editor)

### Claude's Discretion
- Exact overlay color and opacity for hover state
- Cursor icon design for the edit/interact toggle
- Reconnect retry strategy for iframe disconnect
- Error display format for failed section renders

### Deferred Ideas (OUT OF SCOPE)
- **Agent onboarding skill**: A skill that an agent can execute to add CMS/blocks framework support to any existing codebase. Deferred to Phase 10 or follow-up.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.0.0 | UI framework | Already in use across the entire codebase |
| useSyncExternalStore | (React built-in) | Subscribe to external events without useEffect | Required by project rules (useEffect banned) |
| postMessage API | (browser built-in) | Cross-origin iframe communication | The only way to communicate with cross-origin iframes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | (already present) | Async state for page data | Already wired in PageComposer for page/block queries |
| @rjsf/core | (already present) | JSON Schema prop editor forms | Already used in PropEditor component |
| sonner | (already present) | Toast notifications for errors | Error feedback for iframe disconnect, save failures |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Runtime script injection (postMessage eval) | npm package `@decocms/editor-client` | Package requires site changes; injection works immediately with any site |
| useSyncExternalStore for message handling | Custom event emitter | useSyncExternalStore is idiomatic React 19 and already used in useIframeBridge |
| Semi-transparent overlay for hover | CSS outline border | User decision locks semi-transparent overlay |

**Installation:**
No new dependencies needed. All required libraries are already present.

## Architecture Patterns

### Current State (What Exists)

```
page-composer.tsx
  ├── iframeRef = useRef<HTMLIFrameElement>(null)    ← DEAD (never attached to DOM)
  ├── { send } = useEditorMessages(iframeRef)        ← DEAD (sends to null ref)
  ├── Lines 158-166: sends deco:page-config via dead send()
  ├── Lines 244-249: sends deco:update-block via dead send()
  ├── Lines 306-311: sends deco:update-block via dead send()
  ├── Lines 327-332: sends deco:update-block via dead send()
  └── <PreviewPanel ... />
        └── useIframeBridge({ page, selectedBlockId, onBlockClicked })
              └── iframeRef = useRef() ← REAL (attached to iframe via setIframeRef)
              └── Handles: ready handshake, page-config send, select-block send, block-clicked receive
```

**Problem:** PageComposer sends `deco:update-block` and `deco:page-config` through a dead `iframeRef` that is never attached to the iframe element. The real iframe ref lives inside `useIframeBridge` in PreviewPanel. These messages are silently lost.

### Target State (After Phase 9)

```
page-composer.tsx
  ├── useIframeBridge() lifted up OR send() callback passed from PreviewPanel
  ├── All sends go through the single bridge
  └── <PreviewPanel ... />
        └── iframe with overlay injection
        └── Edit/interact mode toggle

editor-protocol.ts              ← Shared typed protocol (already exists, extend)
  ├── EditorMessage union        (editor → iframe)
  ├── SiteMessage union          (iframe → editor)
  └── New: navigation, mode, overlay messages

site-side client script          ← NEW (runs inside iframe)
  ├── Sends deco:ready on load
  ├── Listens for deco:page-config, deco:update-block, deco:select-block
  ├── Renders hover overlays (semi-transparent colored)
  ├── Emits deco:block-clicked on click
  ├── Handles edit mode (intercept clicks) vs interact mode (pass-through)
  └── Reports navigation events back to editor
```

### Pattern 1: Lifting useIframeBridge to PageComposer
**What:** Move the `useIframeBridge` call from PreviewPanel up to PageComposer, and pass the `iframeRef`/`setIframeRef`/`send` down to PreviewPanel as props.
**When to use:** This is the consolidation strategy -- one bridge, one owner.
**Why:** PageComposer needs `send()` for prop updates and block operations. Currently it creates a dead duplicate. Lifting up means one source of truth.
```typescript
// page-composer.tsx
const { iframeRef, ready, send, setIframeRef } = useIframeBridge({
  page: localPage,
  selectedBlockId,
  onBlockClicked: setSelectedBlockId,
});

// Pass to PreviewPanel
<PreviewPanel
  setIframeRef={setIframeRef}
  ready={ready}
  // ... other props
/>

// Remove: iframeRef = useRef, useEditorMessages import, dead send calls
```

### Pattern 2: Site-Side Overlay Client (Edit Mode)
**What:** A self-contained script injected into the iframe that handles section hover overlays, click-to-select, and message handling.
**When to use:** When the iframe loads and sends `deco:ready`, or when the editor switches to edit mode.
**Key design:**
```typescript
// Runs inside iframe -- injected via postMessage or included in site template

// 1. Find all sections with data-block-id
function findSections(): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  document.querySelectorAll("[data-block-id]").forEach((el) => {
    map.set(el.getAttribute("data-block-id")!, el as HTMLElement);
  });
  return map;
}

// 2. Create hover overlay (semi-transparent colored, NOT outline)
function createOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    background: rgba(59, 130, 246, 0.1);  /* blue-500 at 10% */
    border: 2px solid rgba(59, 130, 246, 0.4);
    border-radius: 4px;
    z-index: 9999;
    transition: all 0.15s ease;
  `;
  return overlay;
}

// 3. On hover, position overlay over section bounds
// 4. On click, find deepest [data-block-id] ancestor and emit deco:block-clicked
// 5. Click outside any section → emit deco:deselect
```

### Pattern 3: Edit/Interact Mode Toggle
**What:** A UI toggle next to the URL bar in PreviewPanel that switches between edit mode (clicks select sections) and interact mode (clicks pass through normally).
**When to use:** Always visible in the preview toolbar.
**Behavior:**
- **Edit mode (default):** Overlay script active, clicks intercepted for selection, links disabled
- **Interact mode:** Overlay script dormant, clicks pass through, navigation monitored
- Mode communicated to iframe via `deco:set-mode` message
```typescript
// New message types to add to editor-protocol.ts
| { type: "deco:set-mode"; mode: "edit" | "interact" }

// From iframe back to editor (navigation detection in interact mode)
| { type: "deco:navigated"; url: string; isInternal: boolean }
```

### Pattern 4: Navigation Handling in Interact Mode
**What:** When user navigates within the site in interact mode, the editor silently follows.
**When to use:** Interact mode only.
**Behavior:**
1. Iframe detects navigation (popstate, link click intercept, or load event)
2. Sends `deco:navigated` with the new URL and whether it's internal
3. Editor updates: URL bar, loads new page's sections if internal
4. External navigation: editor dims, shows "Go back" button
```typescript
// Site-side: detect navigation
window.addEventListener("popstate", () => {
  parent?.postMessage({
    type: "deco:navigated",
    url: window.location.href,
    isInternal: isInternalUrl(window.location.href),
  }, "*");
});
```

### Pattern 5: Iframe Disconnect Detection
**What:** Detect when the dev server crashes or iframe becomes unreachable.
**When to use:** Continuous monitoring while preview is active.
**Approach:** Use the `ready` state from useIframeBridge. When the iframe reloads (handleIframeLoad resets readyRef to false), start a timeout. If `deco:ready` doesn't come back within N seconds, show disconnect overlay.
```typescript
// In PreviewPanel or useIframeBridge
// On iframe load → reset ready → start timeout
// If deco:ready received → clear timeout
// If timeout fires → set disconnected state → show overlay
```

### Anti-Patterns to Avoid
- **Multiple iframe refs:** Never have two refs pointing at (or attempting to point at) the same iframe. One bridge, one ref, one owner.
- **Sending messages to dead refs:** The current `useEditorMessages(iframeRef)` in PageComposer sends to a null ref. All sends must go through the live bridge.
- **Direct iframe DOM access from editor:** Never `iframeRef.current.contentDocument`. Always use postMessage. Cross-origin makes this impossible anyway.
- **Polling for iframe state:** Don't poll. Use the event-driven `deco:ready` handshake and `load` event listener.
- **Mixing edit and interact behaviors:** Mode must be a clear binary state communicated to the iframe. Don't try to "partially" intercept clicks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-origin messaging | Custom WebSocket/shared worker bridge | window.postMessage | Standard API, already working in useIframeBridge |
| Overlay positioning | Manual scroll-offset tracking | getBoundingClientRect + IntersectionObserver | Built-in APIs handle scroll, resize, and transforms |
| Navigation detection | MutationObserver on iframe URL | popstate + beforeunload + click intercept | Standard browser events cover all navigation types |
| JSON Schema form rendering | Custom prop editor | @rjsf/core (already present) | Already works, just needs wiring to live send |

**Key insight:** This phase is primarily about *plumbing consolidation* and *building the site-side counterpart*. The editor-side protocol and bridge already exist but have dead code and a missing client. The novel work is: (1) removing the dead path, (2) building the overlay client that runs in the iframe, and (3) adding edit/interact mode.

## Common Pitfalls

### Pitfall 1: Dead iframeRef Sends Silently Failing
**What goes wrong:** PageComposer's `send()` calls (lines 163, 246, 308, 329) go to a ref that's never attached. These `deco:update-block` and `deco:page-config` messages are silently lost.
**Why it happens:** Two separate iframe communication paths were created during Phase 3 -- `useIframeBridge` for the handshake/ready flow and `useEditorMessages` for ad-hoc sends. But only `useIframeBridge`'s ref is connected to the DOM.
**How to avoid:** Remove the dead `iframeRef` and `useEditorMessages` import from PageComposer. Lift `useIframeBridge` to PageComposer so it owns the bridge and passes `setIframeRef` to PreviewPanel.
**Warning signs:** Prop changes in the editor don't reflect in the iframe preview (the current state of the codebase).

### Pitfall 2: No Site-Side Client Means No Interaction
**What goes wrong:** The iframe loads the user's site but has no code to listen for `deco:*` messages or send `deco:ready`. Without this, the bridge never completes the handshake.
**Why it happens:** Phase 3 built the editor side but not the site side. The starter template renders static JSON without any editor awareness.
**How to avoid:** Build a site-side client script. Two delivery options:
1. **Runtime injection:** Editor sends a script via `deco:inject` message after iframe loads. Requires `allow-scripts allow-same-origin` in sandbox (already present).
2. **Package inclusion:** Site template imports `@decocms/editor-client` which auto-initializes when loaded in an iframe.
**Recommendation:** Start with option 2 (npm package) since `allow-same-origin` + `postMessage("*")` means runtime injection of eval-able code would work but is fragile. A proper import is cleaner and debuggable.
**Warning signs:** Preview shows the site but clicking sections does nothing; bridge never reports `ready`.

### Pitfall 3: Nested Section Selection (Deepest vs. Topmost)
**What goes wrong:** User clicks a button inside a Hero section. The click could select the Hero (parent section), the button's container, or nothing at all.
**Why it happens:** Event bubbling means click events fire on every ancestor. If multiple elements have `data-block-id`, you get the wrong one.
**How to avoid:** In the click handler, walk up the DOM from `event.target` and find the **nearest** (deepest/innermost) ancestor with `data-block-id`. This satisfies the user's locked decision of "always select the innermost section."
```typescript
function findDeepestSection(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  while (el) {
    if (el.hasAttribute("data-block-id")) return el;
    el = el.parentElement;
  }
  return null;
}
```
**Warning signs:** Clicking inside a section selects the wrong section or parent layout.

### Pitfall 4: Edit Mode Must Block ALL Interactive Elements
**What goes wrong:** In edit mode, user clicks a link/button inside a section and navigates away instead of selecting the section.
**Why it happens:** The overlay only intercepts clicks on the overlay itself. If the overlay doesn't cover the full section, or if interactive elements have higher z-index, clicks pass through.
**How to avoid:** In edit mode, add a transparent overlay over each section that captures ALL click events. The overlay must have `pointer-events: all` and sit above the section content. The section content gets `pointer-events: none`. Admin-cx uses this exact approach via CSS `pointer-events: none` on all `<a>` elements.
**Warning signs:** Clicking a button in a section triggers the button's action instead of selecting the section.

### Pitfall 5: Iframe Load Reset During HMR
**What goes wrong:** The dev server's HMR triggers an iframe reload. The bridge's `readyRef` resets to `false`, but the editor doesn't re-send page config after the new `deco:ready`.
**Why it happens:** `handleIframeLoad` in `useIframeBridge` already resets `readyRef`. The `useSyncExternalStore` subscription already handles `deco:ready` by re-sending page config. But if HMR does a soft reload (no full page reload), the `load` event may not fire.
**How to avoid:** The site-side client should send `deco:ready` on HMR reconnect (Vite's HMR `afterUpdate` event). This way the bridge always gets the handshake regardless of reload type.
**Warning signs:** Preview goes stale after a code change in the dev server until manual page refresh.

### Pitfall 6: External Navigation Detection in Interact Mode
**What goes wrong:** User clicks an external link in interact mode. The iframe navigates to a different origin. The editor loses all communication (cross-origin restrictions prevent postMessage from the new origin back to the editor).
**Why it happens:** Once the iframe navigates to an external origin, the site-side client script is gone. The new page doesn't have the deco client.
**How to avoid:** Intercept link clicks in the site-side client BEFORE navigation. For external links, send `deco:navigated` with `isInternal: false` BEFORE allowing the navigation (or prevent it and let the editor handle it). The editor can then show a "back to site" button.
**Warning signs:** Clicking external links in interact mode causes the editor to freeze with no way to return.

## Code Examples

### Extended Protocol Types (editor-protocol.ts)
```typescript
// Source: Current editor-protocol.ts + new messages needed for Phase 9

import type { Page } from "./page-api";

export const DECO_MSG_PREFIX = "deco:" as const;

/** Messages sent from the Mesh editor to the site iframe */
export type EditorMessage =
  | { type: "deco:page-config"; page: Page }
  | { type: "deco:update-block"; blockId: string; props: Record<string, unknown> }
  | { type: "deco:select-block"; blockId: string }
  | { type: "deco:deselect" }
  | { type: "deco:set-viewport"; width: number }
  | { type: "deco:set-mode"; mode: "edit" | "interact" };

/** Messages sent from the site iframe to the Mesh editor */
export type SiteMessage =
  | { type: "deco:ready"; version: number }
  | { type: "deco:block-clicked"; blockId: string; rect: DOMRect }
  | { type: "deco:blocks-rendered"; blocks: Array<{ id: string; rect: DOMRect }> }
  | { type: "deco:block-hover"; blockId: string | null; rect: DOMRect | null }
  | { type: "deco:navigated"; url: string; isInternal: boolean }
  | { type: "deco:click-away" }
  | { type: "deco:section-error"; blockId: string; error: string };
```

### Consolidated useIframeBridge (Lifted to PageComposer)
```typescript
// The existing useIframeBridge already handles most of the logic.
// The key change is: lift it from PreviewPanel to PageComposer.

// page-composer.tsx
export default function PageComposer() {
  // ... existing state ...

  const { iframeRef, ready, send, setIframeRef } = useIframeBridge({
    page: localPage,
    selectedBlockId,
    onBlockClicked: setSelectedBlockId,
  });

  // Now send() works because iframeRef is attached via setIframeRef in PreviewPanel
  const handlePropChange = (newProps: Record<string, unknown>) => {
    if (!selectedBlockId) return;
    const updatedBlocks = blocks.map((block) =>
      block.id === selectedBlockId ? { ...block, props: newProps } : block,
    );
    pushBlocks(updatedBlocks);
    send({ type: "deco:update-block", blockId: selectedBlockId, props: newProps });
    debouncedSave(updatedBlocks);
  };

  return (
    // ...
    <PreviewPanel setIframeRef={setIframeRef} ready={ready} /* ... */ />
    // ...
  );
}
```

### Site-Side Editor Client (New)
```typescript
// This runs inside the user's site iframe.
// Delivered as an npm package or injected at runtime.

const DECO_PREFIX = "deco:";
let mode: "edit" | "interact" = "edit";
let hoverOverlay: HTMLDivElement | null = null;

function init() {
  // Signal ready to editor
  parent?.postMessage({ type: "deco:ready", version: 1 }, "*");

  // Listen for editor messages
  window.addEventListener("message", handleEditorMessage);

  // Set up edit mode overlays
  setupEditMode();
}

function handleEditorMessage(e: MessageEvent) {
  if (!e.data?.type?.startsWith(DECO_PREFIX)) return;

  switch (e.data.type) {
    case "deco:page-config":
      // Re-render page with new config (framework-specific)
      break;
    case "deco:update-block":
      // Hot-swap props for a specific block
      break;
    case "deco:set-mode":
      mode = e.data.mode;
      mode === "edit" ? setupEditMode() : teardownEditMode();
      break;
    case "deco:select-block":
      // Scroll to block, no persistent visual
      scrollToBlock(e.data.blockId);
      break;
  }
}

function setupEditMode() {
  // Create hover overlay element
  hoverOverlay = document.createElement("div");
  hoverOverlay.style.cssText = `
    position: fixed; pointer-events: none;
    background: rgba(59, 130, 246, 0.08);
    z-index: 99999; display: none;
    transition: all 0.1s ease-out;
  `;
  document.body.appendChild(hoverOverlay);

  // Intercept all clicks in edit mode
  document.addEventListener("click", handleEditClick, true);
  document.addEventListener("mousemove", handleEditHover, true);
}

function handleEditClick(e: MouseEvent) {
  if (mode !== "edit") return;
  e.preventDefault();
  e.stopPropagation();

  const section = findDeepestSection(e.target);
  if (section) {
    const blockId = section.getAttribute("data-block-id")!;
    parent?.postMessage({
      type: "deco:block-clicked",
      blockId,
      rect: section.getBoundingClientRect(),
    }, "*");
  } else {
    parent?.postMessage({ type: "deco:click-away" }, "*");
  }
}

function handleEditHover(e: MouseEvent) {
  if (mode !== "edit" || !hoverOverlay) return;
  const section = findDeepestSection(e.target);
  if (section) {
    const rect = section.getBoundingClientRect();
    hoverOverlay.style.display = "block";
    hoverOverlay.style.top = `${rect.top}px`;
    hoverOverlay.style.left = `${rect.left}px`;
    hoverOverlay.style.width = `${rect.width}px`;
    hoverOverlay.style.height = `${rect.height}px`;
  } else {
    hoverOverlay.style.display = "none";
  }
}

function findDeepestSection(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  while (el) {
    if (el.hasAttribute("data-block-id")) return el;
    el = el.parentElement;
  }
  return null;
}
```

### Edit/Interact Mode Toggle Component
```typescript
// Sits next to the URL bar in PreviewPanel
import { MousePointer2, Hand } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";

interface ModeToggleProps {
  mode: "edit" | "interact";
  onChange: (mode: "edit" | "interact") => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
      <Button
        variant={mode === "edit" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("edit")}
        title="Edit mode - click to select sections"
      >
        <MousePointer2 size={14} />
      </Button>
      <Button
        variant={mode === "interact" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("interact")}
        title="Interact mode - test links and buttons"
      >
        <Hand size={14} />
      </Button>
    </div>
  );
}
```

## Detailed Dead Code Audit

### Confirmed Dead Code (to remove)

| File | Lines | Code | Why Dead |
|------|-------|------|----------|
| `page-composer.tsx` | 74 | `const iframeRef = useRef<HTMLIFrameElement>(null)` | Never attached to any DOM element. PreviewPanel has its own ref via useIframeBridge. |
| `page-composer.tsx` | 75 | `const { send } = useEditorMessages(iframeRef)` | Uses the dead iframeRef above. Sends to null. |
| `page-composer.tsx` | 44 | `import { useEditorMessages } from "../lib/use-editor-messages"` | Only consumer is the dead usage on line 75. |
| `page-composer.tsx` | 158-166 | `if (localPage && blocks !== prevBlocksRef.current) { ... send({ type: "deco:page-config" ... })` | Sends via dead ref. useIframeBridge already sends page-config on page change (lines 65-72 of use-iframe-bridge.ts). |
| `page-composer.tsx` | 244-249 | `send({ type: "deco:update-block", blockId: selectedBlockId, props: newProps })` | Sends via dead ref. After consolidation, this should use the lifted bridge's send(). |
| `page-composer.tsx` | 306-311 | `send({ type: "deco:update-block" ... })` in handleBindLoader | Same issue. |
| `page-composer.tsx` | 327-332 | `send({ type: "deco:update-block" ... })` in handleRemoveLoaderBinding | Same issue. |

### File to Evaluate for Removal

| File | Status | Action |
|------|--------|--------|
| `use-editor-messages.ts` | Likely dead after consolidation | If PageComposer is the only consumer and we remove its usage, this entire file can be deleted. Verify no other imports exist. |

### Files to Keep but Modify

| File | Changes Needed |
|------|---------------|
| `use-iframe-bridge.ts` | Add `deco:set-mode`, `deco:deselect`, `deco:click-away`, `deco:navigated` message handling. Add disconnect detection timeout. |
| `editor-protocol.ts` | Extend with new message types (set-mode, navigated, click-away, deselect, section-error, block-hover). |
| `preview-panel.tsx` | Accept `setIframeRef` as prop instead of calling useIframeBridge. Add mode toggle UI. Add disconnect overlay. |
| `page-composer.tsx` | Lift useIframeBridge here. Remove dead code. Wire deco:click-away to deselect. Wire deco:navigated to page switching. |

## Site-Side Client Delivery Strategy

### Option A: NPM Package (Recommended)
Create a lightweight package (e.g., `@decocms/editor-client` or add to existing `packages/mesh-plugin-site-editor`) that the site template imports. It auto-initializes when it detects it's running inside an iframe with a parent that speaks the `deco:` protocol.

**Pros:** Debuggable, typed, tree-shakeable, works with HMR
**Cons:** Requires site template modification (one import line)

### Option B: Runtime Injection
Editor sends a `deco:inject` message containing the client script as a string. The iframe evaluates it.

**Pros:** Works with any site without modification
**Cons:** Hard to debug, no source maps, security concerns with eval

### Recommendation
**Use Option A (NPM package).** The starter template already needs `data-block-id` attributes on section wrappers (which requires code changes anyway), so adding an import is trivial. The package approach is more maintainable and debuggable.

The package should:
1. Export a `initEditorBridge()` function
2. Auto-detect iframe context (`window !== window.parent`)
3. Be no-op in production (when not in iframe)
4. Handle HMR reconnects (Vite's `import.meta.hot`)

## data-block-id Attribute Strategy

The site-side client needs `data-block-id` attributes on section wrapper elements to identify clickable sections. The starter template currently renders:

```tsx
// Current: home.tsx
{pageConfig.blocks.map((block) => {
  const Section = sectionRegistry[block.blockType];
  return <Section key={block.id} {...block.props} />;
})}
```

This needs to become:
```tsx
// Target: wrap each section in a div with data-block-id
{pageConfig.blocks.map((block) => {
  const Section = sectionRegistry[block.blockType];
  return (
    <div key={block.id} data-block-id={block.id}>
      <Section {...block.props} />
    </div>
  );
})}
```

Alternatively, sections can add the attribute themselves (via a HOC or wrapper component from the editor client package). The wrapper approach is cleaner because it doesn't require modifying every section component.

## Discretion Recommendations

### Overlay Color and Opacity
**Recommendation:** `rgba(59, 130, 246, 0.08)` (Tailwind blue-500 at 8% opacity) for hover overlay background. This is subtle enough to see content through but clearly indicates the hovered area. No border on hover -- just the semi-transparent fill as per user decision.

### Cursor Icon for Edit/Interact Toggle
**Recommendation:** Use `MousePointer2` (lucide-react) for edit mode and `Hand` (lucide-react) for interact mode. These are standard cursor-tool metaphors (Figma uses similar). Both icons are already available via lucide-react which is in the project.

### Reconnect Retry Strategy
**Recommendation:** After detecting iframe disconnect (no `deco:ready` within 5 seconds of iframe load), show a dimmed overlay with "Preview disconnected" message and a "Reconnect" button. Clicking "Reconnect" reloads the iframe (`iframeRef.current.src = iframeRef.current.src`). No automatic retry -- manual only. Automatic retries in a crashing dev server loop would thrash the UI.

### Error Display for Failed Section Renders
**Recommendation:** The site-side client wraps each section render in a try/catch. On error, it replaces the section's content with a red-tinted box (`bg-red-50 border border-red-200`) showing the error message and the section name. This is visible in the preview. The editor side doesn't need to do anything special -- the error is shown in-place where the section would be, as per the user's decision.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Admin-cx: `editor::click` with resolveChain | Mesh: `deco:block-clicked` with blockId | Phase 3 → 9 | Simpler, flat ID-based selection |
| Admin-cx: inject script via innerHTML replacement | Mesh: NPM package auto-init | Phase 9 (new) | Debuggable, typed, HMR-compatible |
| Admin-cx: mode controlled by injected editor::mode | Mesh: UI toggle sending deco:set-mode | Phase 9 (new) | User-controlled mode switching |
| Two parallel iframe comm paths (useEditorMessages + useIframeBridge) | Single useIframeBridge | Phase 9 (cleanup) | No silent message loss |

## Open Questions

1. **Live prop hot-swap mechanism in the iframe**
   - What we know: The editor sends `deco:update-block` with new props. The site needs to re-render that specific section with the new props.
   - What's unclear: How does the site-side client trigger a re-render of a specific React component? React doesn't expose a "re-render this component with new props" API from outside the tree.
   - Options: (a) The client stores current page state and the route component reads from it (reactive store). (b) Use a custom event that a wrapper HOC listens to. (c) The site uses React's `useSyncExternalStore` to subscribe to prop changes from the editor bridge.
   - Recommendation: Option (c) -- provide a `useEditorProps(blockId)` hook from the editor client package. The site's section wrapper calls this hook, which returns the latest props from the editor (or falls back to static props when not in editor mode). This is the cleanest React-idiomatic approach.

2. **Internal vs external URL detection**
   - What we know: Internal pages should be silently followed. External links should be allowed but with editor disabled.
   - What's unclear: How to reliably distinguish internal vs external. URL origin comparison works for same-domain sites, but tunnel URLs may differ from the site's canonical URL.
   - Recommendation: Consider any URL with the same origin as the iframe's initial `src` to be internal. Anything else is external. The editor should provide the base URL to the site-side client as part of the initial config.

3. **data-block-id attribute source**
   - What we know: Sections need `data-block-id` for click targeting.
   - What's unclear: Should this come from a wrapper `<div>`, a HOC, or the section component itself?
   - Recommendation: A wrapper component provided by the editor client package. The site's page renderer wraps each section: `<SectionWrapper blockId={block.id}><Section {...props} /></SectionWrapper>`. This keeps sections clean and the attribute is guaranteed.

## Sources

### Primary (HIGH confidence)
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/lib/use-iframe-bridge.ts` -- Current bridge implementation, 139 lines
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/lib/use-editor-messages.ts` -- Dead duplicate, 44 lines
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/lib/editor-protocol.ts` -- Current protocol types, 36 lines
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/components/page-composer.tsx` -- Main composer, 655 lines, contains dead code
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/components/preview-panel.tsx` -- Preview iframe, 121 lines
- `/Users/guilherme/Projects/mesh/packages/starter-template/app/routes/home.tsx` -- Site route (no editor awareness), 37 lines
- `/Users/guilherme/Projects/mesh/packages/starter-template/app/routes/$.tsx` -- Catch-all route (no editor awareness), 73 lines
- `/Users/guilherme/Projects/admin-cx/components/pages/block-edit/inlineEditor.ts` -- Reference overlay injection implementation

### Secondary (MEDIUM confidence)
- Phase 3 research (`.planning/phases/03-visual-editor/03-RESEARCH.md`) -- Original protocol design rationale and admin-cx pattern analysis

## Metadata

**Confidence breakdown:**
- Dead code audit: HIGH -- Direct code inspection confirms iframeRef is never attached, useEditorMessages sends to null
- Architecture (consolidation): HIGH -- Clear path: lift useIframeBridge, remove dead code, single source of truth
- Site-side client: MEDIUM -- Pattern is well-understood (admin-cx reference), but live prop hot-swap mechanism needs validation during implementation
- Edit/interact mode: MEDIUM -- UI toggle is straightforward, but navigation detection edge cases (external links, iframe cross-origin) need testing
- Overlay implementation: HIGH -- Semi-transparent overlay is standard CSS, deepest-section selection is straightforward DOM traversal

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain, no external dependencies changing)
