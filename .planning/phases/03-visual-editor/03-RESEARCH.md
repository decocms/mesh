# Phase 3: Visual Editor - Research

**Researched:** 2026-02-14
**Domain:** iframe + postMessage visual editing, drag-and-drop section reordering, undo/redo
**Confidence:** HIGH

## Summary

Phase 3 transforms the existing page editor (Phase 1 metadata form) and prop editor (Phase 2 @rjsf form) into a full visual editing experience. The core architecture is well-established: an iframe renders the user's actual running site (via tunnel URL), and the editor communicates with it via a typed postMessage protocol. The existing admin-cx codebase (`/Users/guilherme/Projects/admin-cx`) provides a battle-tested reference implementation of this exact pattern -- with inline editor overlays injected into the iframe, section selection via `editor::click` messages, viewport toggling, and section reordering via `editor::focus` messages.

The new implementation in Mesh differs from admin-cx in three critical ways: (1) it uses React 19 instead of Preact, (2) it communicates with the site via a new typed protocol (not the legacy `editor::click`/`editor::focus` protocol), and (3) it stores page configuration in `.deco/pages/*.json` files via SITE_BINDING (READ_FILE/PUT_FILE) instead of the legacy decofile system. The page data model already has a `blocks: unknown[]` array that needs a concrete type definition -- each block instance needs a unique ID, a reference to its block definition, and a props object.

The drag-and-drop requirement (EDIT-03) needs a library choice. Admin-cx uses `@dnd-kit/core@6.1.0` + `@dnd-kit/sortable@8.0.0`, which works well but is the legacy API. The new `@dnd-kit/react@0.2.x` package exists but is pre-1.0 and could be unstable. The safe choice for Mesh (React 19) is to use the proven `@dnd-kit/core` + `@dnd-kit/sortable` packages at their latest stable versions (6.x/8.x), which have been confirmed working with React 19 in the admin-cx test fixtures.

**Primary recommendation:** Build the postMessage protocol as a typed message bus, implement the site-side overlay injection as a self-contained script (following admin-cx's `inlineEditor.ts` pattern), and use @dnd-kit for sortable sections. The undo/redo system should use a simple snapshot-based command stack rather than individual operation commands, since the page config JSON is small enough to snapshot entirely.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.1.0 | Drag-and-drop primitives | Already used in admin-cx, proven with React via Preact compat; well-documented and maintained |
| @dnd-kit/sortable | ^8.0.0 | Sortable list preset | Thin layer over @dnd-kit/core for vertical list reordering -- exactly what section reordering needs |
| @dnd-kit/utilities | ^3.2.2 | CSS transform utilities | Required for sortable animations |
| @rjsf/core | ^6.1.2 | JSON Schema forms | Already in the plugin (Phase 2). Renders prop editor forms from block schemas |
| @rjsf/validator-ajv8 | ^6.1.2 | Form validation | Already in the plugin (Phase 2) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | ^5.0.0 | Generate unique block instance IDs | Already a peer dep; used for page IDs in Phase 1 |
| sonner | (already present) | Toast notifications | Save confirmations, error feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit | @dnd-kit/react@0.2.x | Newer API but pre-1.0, less documentation; risk of breaking changes |
| @dnd-kit | @atlaskit/pragmatic-drag-and-drop | Framework-agnostic, works great with React 19; but not in the Mesh or admin-cx codebase, adds learning curve |
| @dnd-kit | HTML5 native drag-and-drop | No dependency; but terrible DX, no keyboard accessibility, inconsistent across browsers |
| Snapshot undo/redo | Operation-based command pattern | Better for large documents; overkill for page configs that are <10KB JSON |

**Installation:**
Add to `mesh-plugin-site-editor/package.json` dependencies:
```json
"@dnd-kit/core": "^6.1.0",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

## Architecture Patterns

### Recommended Component Structure
```
client/
  components/
    preview-panel.tsx          # EXISTING -- extend with postMessage + viewport toggle
    prop-editor.tsx            # EXISTING -- no changes needed
    page-editor.tsx            # EXISTING -- replace metadata form with visual editor layout
    page-composer.tsx          # NEW -- orchestrator: section list + iframe + prop sidebar
    section-list-sidebar.tsx   # NEW -- sortable section list with @dnd-kit
    block-picker.tsx           # NEW -- modal to add sections from block library
    viewport-toggle.tsx        # NEW -- mobile/tablet/desktop buttons
    rjsf/templates.tsx         # EXISTING -- no changes needed
    rjsf/widgets.tsx           # EXISTING -- no changes needed
  lib/
    page-api.ts                # EXISTING -- extend updatePage to handle blocks
    block-api.ts               # EXISTING -- no changes needed
    use-tunnel-url.ts          # EXISTING -- no changes needed
    use-editor-messages.ts     # NEW -- postMessage send/receive hook
    use-undo-redo.ts           # NEW -- snapshot-based undo/redo hook
    editor-protocol.ts         # NEW -- typed message definitions
    query-keys.ts              # EXISTING -- may add new keys
    router.ts                  # EXISTING -- may update page editor route
```

### Pattern 1: Typed postMessage Protocol
**What:** All messages between editor and iframe are typed TypeScript discriminated unions. A single `useEditorMessages` hook handles send/receive.
**When to use:** All editor-iframe communication.
**Example:**
```typescript
// Source: Derived from admin-cx inlineEditor.ts pattern + Payload CMS Live Preview pattern

// editor-protocol.ts
export type EditorMessage =
  | { type: "deco:page-config"; page: PageConfig }
  | { type: "deco:update-block"; blockId: string; props: Record<string, unknown> }
  | { type: "deco:select-block"; blockId: string }
  | { type: "deco:set-viewport"; width: number };

export type SiteMessage =
  | { type: "deco:ready"; version: number }
  | { type: "deco:block-clicked"; blockId: string; rect: DOMRect }
  | { type: "deco:blocks-rendered"; blocks: Array<{ id: string; rect: DOMRect }> };

// useEditorMessages hook
function useEditorMessages(iframeRef: RefObject<HTMLIFrameElement>) {
  const send = useCallback((msg: EditorMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  const subscribe = useCallback((handler: (msg: SiteMessage) => void) => {
    const listener = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!e.data?.type?.startsWith("deco:")) return;
      handler(e.data as SiteMessage);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return { send, subscribe };
}
```

### Pattern 2: Site-Side Overlay Injection (Click-to-Edit)
**What:** The editor injects a script into the iframe that adds hover overlays and click handlers to section elements. This follows admin-cx's `inlineEditor.ts` exactly.
**When to use:** EDIT-05 (click-to-edit overlays).
**Key insight from admin-cx:** The site renders sections with `data-resolve-chain` or `data-manifest-key` attributes on `<section>` elements. The injected script traverses `body > section` elements, adds hover overlays with edit/delete/move/duplicate buttons, and sends `editor::click` postMessages back to the parent.
**For Mesh:** Sites need to render a `data-block-id` attribute on each section's wrapper element. The injected overlay script looks for these attributes instead of `data-resolve-chain`.
```typescript
// Simplified overlay injection -- runs inside iframe
document.querySelectorAll("[data-block-id]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    parent?.postMessage({
      type: "deco:block-clicked",
      blockId: el.getAttribute("data-block-id"),
      rect: el.getBoundingClientRect(),
    }, "*");
  });
});
```

### Pattern 3: Snapshot-Based Undo/Redo
**What:** The entire page config (JSON, typically <10KB) is snapshotted on every edit. An undo stack and redo stack store serialized snapshots.
**When to use:** EDIT-07 (undo/redo across prop edits, section reordering, section add/remove).
**Why snapshot vs command:** Page configs are small JSON objects. Command pattern requires defining inverse operations for every action type (prop change, reorder, add, remove). Snapshot pattern handles all operations uniformly with zero additional code per operation type. The tradeoff (higher memory) is negligible at <10KB per snapshot * 100 max history = 1MB.
```typescript
// use-undo-redo.ts
function useUndoRedo<T>(initial: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const push = useCallback((next: T) => {
    setPast((p) => [...p, present]);
    setPresent(next);
    setFuture([]); // clear redo stack on new action
  }, [present]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    setFuture((f) => [present, ...f]);
    setPresent(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }, [past, present]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    setPast((p) => [...p, present]);
    setPresent(future[0]);
    setFuture((f) => f.slice(1));
  }, [future, present]);

  return { value: present, push, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
```

### Pattern 4: @dnd-kit Sortable Section List
**What:** A vertical sortable list using DndContext + SortableContext + useSortable from @dnd-kit.
**When to use:** EDIT-03 (drag-and-drop section reordering).
**Source:** admin-cx `ArrayFieldTemplate.tsx` uses this exact pattern.
```typescript
import { DndContext, DragEndEvent, MouseSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

function SortableSectionItem({ block }: { block: BlockInstance }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {block.label}
    </div>
  );
}

function SectionListSidebar({ blocks, onReorder }: Props) {
  const sensors = useSensors(useSensor(MouseSensor));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };
  return (
    <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map(block => <SortableSectionItem key={block.id} block={block} />)}
      </SortableContext>
    </DndContext>
  );
}
```

### Pattern 5: Page Composer Layout (Three-Panel Editor)
**What:** The visual editor uses a three-panel layout: left sidebar (section list), center (iframe preview), right sidebar (prop editor). The page-editor route is replaced with this layout.
**When to use:** This is the main visual editor view for `/pages/$pageId`.
**Source:** Admin-cx Preview.tsx uses similar layout pattern.
```
+-------------------+-------------------------+-------------------+
|  Section List     |     iframe Preview      |   Prop Editor     |
|  (sortable)       |     (tunnel URL)        |   (@rjsf form)    |
|                   |                         |                   |
|  [+ Add Section]  |  [viewport toggle bar]  |  [schema-driven]  |
+-------------------+-------------------------+-------------------+
```

### Anti-Patterns to Avoid
- **Direct iframe DOM manipulation from editor:** Never reach into iframe DOM. Always communicate via postMessage. Cross-origin iframes make this impossible anyway.
- **Storing undo/redo in server state:** The undo/redo stack is ephemeral client-side state. It exists only during the editing session. Saves persist to git; undo/redo does not.
- **Debouncing postMessage sends:** For live preview (EDIT-04, <1s latency), send immediately. Debounce the *save-to-git* operation, not the preview update.
- **Building a custom form renderer:** The PropEditor with @rjsf already works (Phase 2). Do not replace it. Just wire its `onChange` to the postMessage send + undo stack push.
- **Monolithic PageComposer component:** As documented in architecture research -- compose from independent pieces connected via shared state (React context or props).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sortable list DnD | Custom HTML5 drag handlers | @dnd-kit/sortable | Keyboard accessibility, animations, touch support, vertical constraint -- all built in |
| JSON Schema forms | Custom form generator | @rjsf/core (already present) | Edge cases: arrays, nested objects, enums, oneOf/anyOf -- @rjsf handles them all |
| Unique IDs | UUID generation, counters | nanoid (already present) | Collision-resistant, URL-safe, fast |
| Section overlay positioning | Manual DOM rect tracking | `getBoundingClientRect()` via postMessage | Overlay rects come from the iframe side (where the elements live). The editor just positions absolutely based on reported rects. |

**Key insight:** The visual editor is primarily *orchestration* -- connecting existing pieces (iframe, @rjsf form, @dnd-kit sortable, SITE_BINDING tools). The novel code is the postMessage protocol and the undo/redo stack. Everything else is glue.

## Common Pitfalls

### Pitfall 1: Cross-Origin iframe postMessage
**What goes wrong:** If the tunnel URL (e.g., `https://tunnel-xyz.deco.dev`) has a different origin than the Mesh admin, `postMessage` with a specific `targetOrigin` will silently fail if origins don't match.
**Why it happens:** The `targetOrigin` parameter in `postMessage(msg, targetOrigin)` must match the iframe's origin or be `"*"`.
**How to avoid:** Use `"*"` as targetOrigin for development. For production, pass the tunnel origin explicitly. Admin-cx uses `"*"` throughout (confirmed in `inlineEditor.ts` and `Preview.tsx`).
**Warning signs:** Messages sent but never received; no errors in console.

### Pitfall 2: iframe Navigation Breaking postMessage
**What goes wrong:** User clicks a link inside the iframe, iframe navigates to new page, postMessage listener is lost.
**Why it happens:** The injected script/listener exists only in the current document. Page navigation replaces the document.
**How to avoid:** Admin-cx disables links in edit mode (`disableLinks()` / `disableButtons()` in `inlineEditor.ts`). The overlay injection script should set `pointer-events: none` on content and intercept all navigation. After any iframe navigation, re-inject the overlay script.
**Warning signs:** Click-to-edit works initially but stops after clicking a link in the preview.

### Pitfall 3: Undo/Redo Stack Diverging from Saved State
**What goes wrong:** User undoes to a previous state, then saves. The saved state is now behind the undo stack's "present". If the user then redoes, the redo state may conflict with what was saved.
**Why it happens:** The undo stack is client-side; saves go to git. These are independent timelines.
**How to avoid:** On save, clear the undo/redo stack (or mark the save point). Do not allow redo past a save point. The simplest approach: keep the stack but disable redo after a save (clear the future stack).
**Warning signs:** User saves, undoes, redoes -- and the state doesn't match what's on disk.

### Pitfall 4: @dnd-kit Accessibility with Portaled Content
**What goes wrong:** When using @dnd-kit inside a panel that's rendered in a portal or complex layout, keyboard interactions (space/enter to pick up, arrow keys to move) don't work.
**Why it happens:** @dnd-kit relies on focus management and ARIA live regions that can conflict with portals or iframes.
**How to avoid:** Ensure the DndContext is inside the main React tree (not portaled). Use the `restrictToVerticalAxis` modifier. Test keyboard DnD explicitly.
**Warning signs:** Mouse drag works but keyboard drag doesn't.

### Pitfall 5: Race Condition Between postMessage and Iframe Load
**What goes wrong:** Editor sends `deco:page-config` before the iframe has loaded and set up its listener.
**Why it happens:** iframe loads asynchronously. The editor may render and try to send before the site is ready.
**How to avoid:** Wait for the `deco:ready` message from the iframe before sending any config. Use a handshake: iframe sends `deco:ready`, editor responds with `deco:page-config`. Admin-cx handles this via `Embedded.tsx` which waits for `onLoad` event before sending.
**Warning signs:** Preview shows blank or stale content on initial load; works after switching sections.

## Code Examples

### Block Instance Type (must be defined for Phase 3)
```typescript
// Source: Derived from existing Page interface in page-api.ts
export interface BlockInstance {
  /** Unique ID for this block instance on the page */
  id: string;
  /** Reference to block definition in .deco/blocks/ */
  blockType: string;  // e.g., "sections--Hero"
  /** User-edited props for this instance */
  props: Record<string, unknown>;
}

// Updated Page interface
export interface Page {
  id: string;
  path: string;
  title: string;
  blocks: BlockInstance[];
  metadata: {
    description: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

### Viewport Toggle (EDIT-06)
```typescript
// Source: admin-cx View.tsx VIEWPORTS constant
const VIEWPORTS = {
  mobile: { width: 375, label: "Mobile" },
  tablet: { width: 768, label: "Tablet" },
  desktop: { width: 1440, label: "Desktop" },
} as const;

type ViewportKey = keyof typeof VIEWPORTS;

function ViewportToggle({ value, onChange }: { value: ViewportKey; onChange: (v: ViewportKey) => void }) {
  return (
    <div className="flex gap-1">
      {(Object.keys(VIEWPORTS) as ViewportKey[]).map((key) => (
        <Button
          key={key}
          variant={value === key ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(key)}
        >
          {VIEWPORTS[key].label}
        </Button>
      ))}
    </div>
  );
}
```

### PreviewPanel Enhanced with postMessage (EDIT-01 + EDIT-04)
```typescript
// Source: Derived from existing preview-panel.tsx + admin-cx Embedded.tsx
function EnhancedPreviewPanel({ path, page, selectedBlockId, viewport, onBlockClicked }: Props) {
  const { url } = useTunnelUrl();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { send, subscribe } = useEditorMessages(iframeRef);
  const [ready, setReady] = useState(false);

  // Wait for iframe ready, then send page config
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "deco:ready") {
        setReady(true);
        send({ type: "deco:page-config", page });
      }
      if (msg.type === "deco:block-clicked") {
        onBlockClicked(msg.blockId);
      }
    });
  }, [subscribe, page]);

  // Send updates when page config changes (after ready)
  useEffect(() => {
    if (ready) send({ type: "deco:page-config", page });
  }, [page, ready]);

  // Highlight selected block
  useEffect(() => {
    if (ready && selectedBlockId) {
      send({ type: "deco:select-block", blockId: selectedBlockId });
    }
  }, [selectedBlockId, ready]);

  const previewUrl = path !== "/" ? `${url}${path}` : url;
  const iframeWidth = VIEWPORTS[viewport]?.width ?? "100%";

  return (
    <div className="relative w-full h-full flex justify-center bg-muted/30">
      <iframe
        ref={iframeRef}
        src={previewUrl}
        style={{ width: typeof iframeWidth === "number" ? `${iframeWidth}px` : iframeWidth }}
        className="h-full border-0 bg-white shadow-md transition-[width] duration-300"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Site preview"
      />
    </div>
  );
}
```

### Keyboard Shortcut for Undo/Redo
```typescript
// Source: Standard web convention
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if (isMod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [undo, redo]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Admin-cx: `data-resolve-chain` attributes on sections | Mesh: `data-block-id` attributes | Phase 3 (new) | Simpler mapping -- single ID instead of nested resolve chain |
| Admin-cx: `editor::click` / `editor::focus` message types | Mesh: `deco:*` prefixed typed protocol | Phase 3 (new) | Type-safe, discriminated union, no legacy baggage |
| Admin-cx: Preact signals for editor state | Mesh: React 19 useState + useCallback | Phase 3 (new) | Aligns with Mesh platform stack |
| Admin-cx: `encodeProps` in URL query params | Mesh: Full page config via postMessage | Phase 3 (new) | No URL length limits, faster, cleaner |
| Admin-cx: @dnd-kit/core@6 for sections | Mesh: Same @dnd-kit/core@6 | Stable | Proven API, no migration needed |

**Deprecated/outdated:**
- Admin-cx's `Embedded.tsx` pattern (fetch HTML, replace document.innerHTML inside iframe): This was a workaround for the legacy decofile preview system. Not needed in Mesh -- the iframe loads the actual running site directly via tunnel URL.

## Open Questions

1. **Site-side client library distribution**
   - What we know: The site needs a thin script to listen for `deco:*` messages and add `data-block-id` attributes. Admin-cx injects this as inline JS via `inlineEditor.ts`.
   - What's unclear: Should Mesh inject the script at runtime (via postMessage + eval), provide it as an npm package (`@decocms/editor-client`), or expect the site template to include it?
   - Recommendation: Start with runtime injection (like admin-cx `Embedded.tsx` which sends `editor::inject` with a script string). This avoids requiring site changes. Later, offer an npm package as an opt-in upgrade.

2. **Block instance ID stability across saves**
   - What we know: Each BlockInstance needs a unique `id` for DnD and selection. Generated via nanoid on creation.
   - What's unclear: When a page is saved and reloaded, the IDs persist in JSON. But if two editors create blocks simultaneously, can IDs collide?
   - Recommendation: nanoid(8) collision probability is negligible. IDs are per-page (not global). This is not a real concern.

3. **HMR (Hot Module Replacement) in iframe**
   - What we know: When the developer's site has HMR enabled, the iframe may reload/re-render automatically.
   - What's unclear: Does HMR reset the injected overlay script? Does it send a new `deco:ready` message?
   - Recommendation: Listen for iframe `load` events as well as `deco:ready`. If the iframe reloads (HMR), re-inject overlays and re-send page config. The `deco:ready` handshake makes this self-healing.

4. **`@dnd-kit` with React 19**
   - What we know: Admin-cx test fixtures reference @dnd-kit with React compatibility. The library is actively maintained. There's a GitHub issue (#1654) about React 19 "use client" directive.
   - What's unclear: Whether @dnd-kit/core@6 works out-of-the-box with React 19 in a Bun + Vite environment.
   - Recommendation: Test during implementation. If @dnd-kit/core@6 has issues, @dnd-kit/react@0.2.x is the fallback (new API, React 19 native). Worst case, use plain @dnd-kit/core with custom hooks.

## Sources

### Primary (HIGH confidence)
- `/Users/guilherme/Projects/admin-cx/components/pages/block-edit/inlineEditor.ts` -- Existing inline editor overlay injection pattern, 811 lines of battle-tested code
- `/Users/guilherme/Projects/admin-cx/components/spaces/siteEditor/extensions/CMS/views/Preview.tsx` -- Preview iframe implementation with viewport toggle, addressing bar, postMessage protocol
- `/Users/guilherme/Projects/admin-cx/components/spaces/siteEditor/extensions/CMS/views/Edit/useLiveEditorEvents.ts` -- Event handling for section edit/insert/delete/move/duplicate actions via postMessage
- `/Users/guilherme/Projects/admin-cx/components/ui/Embedded.tsx` -- Iframe embedding with script injection, navigation handling, postMessage relay
- `/Users/guilherme/Projects/admin-cx/components/pages/View.tsx` -- Viewport definitions (mobile/tablet/desktop), scale calculations
- `/Users/guilherme/Projects/admin-cx/components/editor/JSONSchema/widgets/ArrayFieldTemplate.tsx` -- @dnd-kit sortable implementation for section reordering
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/` -- All existing Phase 1-2 code (preview-panel, prop-editor, page-api, block-api, etc.)
- `/Users/guilherme/Projects/context/.planning/research/ARCHITECTURE.md` -- Phase 3 architecture patterns, postMessage protocol specification

### Secondary (MEDIUM confidence)
- [Payload CMS Live Preview](https://payloadcms.com/docs/live-preview/overview) -- Confirmed: iframe + postMessage pattern with `useLivePreview` hook and `ready()` handshake
- [@dnd-kit documentation](https://docs.dndkit.com/) -- DndContext, useSortable, SortableContext APIs
- [@dnd-kit React 19 issue #1654](https://github.com/clauderic/dnd-kit/issues/1654) -- Open issue about "use client" directive

### Tertiary (LOW confidence)
- [Undo/Redo Command Pattern implementations](https://www.esveo.com/en/blog/undo-redo-and-the-command-pattern/) -- General pattern reference; snapshot approach chosen based on our specific constraints (small JSON configs)
- [@dnd-kit/react@0.2.x](https://www.npmjs.com/package/@dnd-kit/react) -- Exists as pre-1.0 new API; not recommended as primary choice

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- @dnd-kit already used in admin-cx; @rjsf already in plugin; only new dep is @dnd-kit packages
- Architecture: HIGH -- postMessage + iframe pattern thoroughly documented in admin-cx codebase (4 major files) and validated by Payload CMS, Sanity, DatoCMS
- Pitfalls: HIGH -- Directly observed from admin-cx's workarounds (link disabling, script injection, navigation queuing, load/ready handshake)
- Undo/redo: MEDIUM -- Snapshot approach is well-established pattern but specific integration with save-to-git workflow needs validation during implementation

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable domain, no fast-moving dependencies)
