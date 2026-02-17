# Blocks Framework Specification

This document explains how to make any TypeScript site compatible with the deco CMS editor. After following this spec, your site will support visual editing with click-to-select, live prop hot-swap, and a full postMessage protocol between the editor and your site rendered inside an iframe.

**Audience:** AI agents and developers integrating sites with deco CMS.

**Two integration paths exist:**

1. **Vite Plugin (auto-inject)** -- zero editor code in your site; just add `decoEditorBridgePlugin()` to your Vite config and render `data-block-id` attributes.
2. **Explicit Client Bridge** -- import `initEditorBridge()` and `useEditorProps()` for direct control over bridge state and live prop hot-swap.

Choose one. Never use both simultaneously.

---

## Quick Start Decision Tree

```
Do you use Vite as your build tool?
  |
  +-- YES: Use decoEditorBridgePlugin() in vite.config.ts
  |         - Bridge script auto-injected into HTML during dev
  |         - For live prop updates: listen for CustomEvents
  |           (deco:page-config, deco:update-block) or write a hook
  |         - Example: anjo.chat uses this approach
  |
  +-- NO:  Use initEditorBridge() + useEditorProps()
           - Import at module level in route files
           - Hook provides automatic prop hot-swap via useSyncExternalStore
           - Example: starter template uses this approach

CRITICAL: NEVER use both approaches simultaneously.
  - decoEditorBridgePlugin() injects its own bridge script
  - initEditorBridge() creates a separate bridge instance
  - Both send deco:ready -> duplicate events, broken behavior
```

---

## .deco/ Directory Conventions

The `.deco/` directory at the project root stores all CMS configuration as JSON files. It is the single source of truth for block definitions, page configurations, and loader definitions.

```
.deco/
├── blocks/                          # Block definitions (scanner-generated)
│   ├── sections--Hero.json          # Section block
│   ├── sections--Footer.json
│   └── sections--Features.json
├── pages/                           # Page configurations
│   ├── page_home.json               # Default locale
│   ├── page_home.en-US.json         # English variant
│   └── page_home.pt-BR.json         # Portuguese variant
└── loaders/                         # Loader definitions
    └── loaders--products.json
```

### ID Conventions

**Block IDs** use `{category}--{ComponentName}`, derived from the component's file path:
- `sections/Hero.tsx` -> `sections--Hero`
- `sections/Footer.tsx` -> `sections--Footer`

**Loader IDs** follow the same pattern:
- `loaders/productList.ts` -> `loaders--productList`

**Page filenames:**
- Default: `{pageId}.json` (e.g., `page_home.json`)
- Locale variant: `{pageId}.{locale}.json` (e.g., `page_home.en-US.json`)
- Locale pattern: `[a-z]{2}(-[A-Z]{2})?` (e.g., `en`, `en-US`, `pt-BR`)

---

## Block Definition Format

Block definitions are stored in `.deco/blocks/{id}.json`. The canonical format is defined by the `BlockDefinition` TypeScript interface in `packages/mesh-plugin-site-editor/server/scanner/types.ts`:

```typescript
interface BlockDefinition {
  /** Unique ID derived from component path, e.g., "sections--Hero" */
  id: string;
  /** Source component path, e.g., "sections/Hero.tsx" */
  component: string;
  /** Human-readable label, e.g., "Hero Banner" */
  label: string;
  /** Category derived from directory, e.g., "Sections" */
  category: string;
  /** Description from JSDoc or manually provided */
  description: string;
  /** JSON Schema for the component's props */
  schema: JSONSchema7;
  /** Default prop values (empty initially) */
  defaults: Record<string, unknown>;
  /** Scan metadata */
  metadata: {
    /** ISO timestamp of last scan */
    scannedAt: string;
    /** How this block was discovered */
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    /** Original TypeScript type name for the props */
    propsTypeName: string | null;
    /** Fields manually edited by user (preserved during re-scan) */
    customized: string[];
  };
}
```

### Real Example: sections--Hero.json (from anjo.chat)

```json
{
  "id": "sections--Hero",
  "type": "section",
  "description": "Hero section with badge, headline, and subtitle",
  "category": "sections",
  "schema": {
    "type": "object",
    "properties": {
      "badge": {
        "type": "string",
        "description": "Badge text"
      },
      "title1": {
        "type": "string",
        "description": "First line of title"
      },
      "title2": {
        "type": "string",
        "description": "Second line of title"
      },
      "subtitle": {
        "type": "string",
        "description": "Subtitle text"
      }
    }
  },
  "defaults": {
    "badge": "Brazil's First AI-Powered Angel Match",
    "title1": "Nothing is heavy",
    "title2": "with wings",
    "subtitle": "Connect with Brazil's most experienced angel investors."
  },
  "metadata": {
    "customized": [],
    "scannedAt": "2026-02-14T00:00:00.000Z",
    "scanMethod": "ts-morph",
    "propsTypeName": null
  },
  "label": "Hero",
  "component": "app/components/sections/hero.tsx"
}
```

**Note on legacy formats:** Older hand-crafted block files may use different field names (`type`, `title`, `filePath`) instead of the scanner's canonical fields (`component`, `label`, `category`). The scanner output (the `BlockDefinition` interface above) is authoritative. When creating new block definitions, always follow the scanner format.

---

## Page Configuration Format

Page configurations are stored in `.deco/pages/{pageId}.json`. The canonical format is defined by the `Page` interface in `packages/mesh-plugin-site-editor/client/lib/page-api.ts`:

```typescript
interface BlockInstance {
  /** Unique ID for this block instance on the page */
  id: string;
  /** Reference to block definition in .deco/blocks/ (e.g., "sections--Hero") */
  blockType: string;
  /** User-edited props for this instance */
  props: Record<string, unknown>;
}

interface Page {
  id: string;
  path: string;
  title: string;
  locale?: string;
  blocks: BlockInstance[];
  metadata: {
    description: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

### Real Example: page_home.json (from anjo.chat)

```json
{
  "id": "page_home",
  "path": "/",
  "title": "anjo.chat -- Match de Anjos com IA",
  "blocks": [
    {
      "id": "block_header",
      "blockType": "sections--Header",
      "props": {
        "brandName": "anjo.chat",
        "navLinks": [
          { "label": "Inicio", "href": "/" }
        ],
        "ctaLabel": "Seja um Anjo"
      }
    },
    {
      "id": "block_hero",
      "blockType": "sections--Hero",
      "props": {
        "badge": "Primeiro Match de Anjos com IA do Brasil",
        "title1": "Nada e pesado",
        "title2": "com asas",
        "subtitle": "Conecte-se com os investidores anjo mais experientes do Brasil."
      }
    }
  ],
  "metadata": {
    "description": "Match de investidores anjo com IA para startups brasileiras",
    "createdAt": "2026-02-14T00:00:00.000Z",
    "updatedAt": "2026-02-16T20:00:00.000Z"
  }
}
```

The `blocks` array defines the page layout top-to-bottom. Each block's `blockType` must reference an existing block definition ID from `.deco/blocks/`. The `props` object contains the user-edited content for that specific instance.

### Loader References in Props

Block props can reference loaders for dynamic data. A loader reference has this shape:

```typescript
interface LoaderRef {
  /** LoaderDefinition ID from .deco/loaders/ */
  __loaderRef: string;
  /** Optional: pick a specific field from loader output */
  field?: string;
  /** Configured input parameter values */
  params?: Record<string, unknown>;
}
```

Example prop value: `{ "__loaderRef": "loaders--products", "params": { "limit": 10 } }`

---

## data-block-id Attribute

This is THE critical rendering requirement. Every section wrapper element MUST have a `data-block-id` attribute set to the block's unique ID from the page configuration. Without it, click-to-select and hover overlays silently fail -- there is no error, the editor just cannot find your sections.

### Required Rendering Pattern

```tsx
// For each block in the page config:
<div data-block-id={block.id}>
  <Section {...block.props} />
</div>
```

The bridge script walks up the DOM from click/hover targets looking for `data-block-id` attributes. If your section components are not wrapped with this attribute, the bridge cannot map DOM interactions back to block instances.

### Full Rendering Example

```tsx
import pageConfig from "../../.deco/pages/page_home.json";

const sectionRegistry: Record<string, React.ComponentType<any>> = {
  "sections--Hero": Hero,
  "sections--Features": Features,
  "sections--Footer": Footer,
};

export default function Home() {
  return (
    <main>
      {pageConfig.blocks.map((block) => {
        const Section = sectionRegistry[block.blockType];
        if (!Section) return null;
        return (
          <div key={block.id} data-block-id={block.id}>
            <Section {...block.props} />
          </div>
        );
      })}
    </main>
  );
}
```

---

## Integration Path 1: Vite Plugin (Auto-Inject)

The `decoEditorBridgePlugin()` from `@decocms/vite-plugin` auto-injects the editor bridge into your site during development. This is the zero-code approach -- your site needs no editor-specific imports.

### What it does

The plugin injects a `<script>` tag containing the full bridge logic into every HTML response during Vite's dev server. The script:

1. Checks if the page is inside an iframe (`window.self !== window.top`). If not, it does nothing.
2. Sends `deco:ready` to the parent editor window.
3. Sets up click and hover handlers that detect `data-block-id` attributes.
4. Handles all incoming editor messages (mode switching, block selection, prop updates).
5. Dispatches `CustomEvent`s for `deco:page-config` and `deco:update-block` so the site can listen for live updates.

### Where it goes

Add to the `plugins` array in your `vite.config.ts`:

```typescript
// vite.config.ts
import { decoEditorBridgePlugin } from "@decocms/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    decoEditorBridgePlugin(),
    // ... your other plugins
  ],
});
```

### What each part means

- **`apply: "serve"`** -- The plugin only runs during `vite dev` (serve mode), never in production builds. This is intentional and correct.
- **`transformIndexHtml`** -- For SPA apps using `index.html`, injects the bridge script into `<body>`.
- **`configureServer` middleware** -- For SSR frameworks (React Router, etc.), intercepts HTML responses and injects the bridge before `</body>`. This runs AFTER framework SSR middleware.
- **`window.self === window.top` guard** -- The injected script no-ops when not in an iframe, so it has zero impact on direct browser access.

### Live Prop Hot-Swap with CustomEvents

The injected bridge dispatches `CustomEvent`s on `window` when it receives page config or block updates from the editor:

- `deco:page-config` -- `event.detail` contains the full `Page` object. Dispatched on initial editor connection and page navigation.
- `deco:update-block` -- `event.detail` contains `{ blockId: string, props: Record<string, unknown> }`. Dispatched when the user edits a prop in the editor sidebar.

Your site listens for these events to update the UI in real time:

```typescript
// Example: Custom hook for Vite plugin approach
function useEditorBlocks(staticBlocks: BlockInstance[]) {
  const [blocks, setBlocks] = useState(staticBlocks);

  useEffect(() => {
    function handlePageConfig(e: CustomEvent) {
      setBlocks(e.detail.blocks);
    }
    function handleUpdateBlock(e: CustomEvent) {
      setBlocks(prev =>
        prev.map(b =>
          b.id === e.detail.blockId ? { ...b, props: e.detail.props } : b
        )
      );
    }

    window.addEventListener("deco:page-config", handlePageConfig);
    window.addEventListener("deco:update-block", handleUpdateBlock);
    return () => {
      window.removeEventListener("deco:page-config", handlePageConfig);
      window.removeEventListener("deco:update-block", handleUpdateBlock);
    };
  }, []);

  return blocks;
}
```

**Note:** The anjo.chat reference site uses this approach -- `decoEditorBridgePlugin()` in vite.config.ts plus a custom `useEditorBlocks()` hook listening for CustomEvents.

---

## Integration Path 2: Explicit Client Bridge (Starter Template)

The explicit bridge gives your site direct access to bridge state through a module-level singleton and a React hook. This is the approach used by the starter template.

### What it does

`initEditorBridge()` initializes the postMessage protocol, manages page state internally, and exposes it through `useSyncExternalStore`. `useEditorProps()` returns live-updating props for a specific block -- when the editor sends prop changes, the hook triggers a React re-render automatically.

### Where it goes

Import and call `initEditorBridge()` at module level in your route files. It runs once and is a no-op outside iframes and on the server.

### initEditorBridge()

Module-level singleton initialization. Safe to call multiple times.

```typescript
import { initEditorBridge, useEditorProps } from "../lib/editor-client";

// Module-level: runs once when the module loads
// No-op if not in an iframe (window === window.parent)
// No-op on the server (typeof window === "undefined")
initEditorBridge();
```

Source: `packages/starter-template/app/lib/editor-client.ts`

What it does internally:
1. Checks `typeof window === "undefined"` (SSR guard) and `window === window.parent` (iframe guard).
2. Sends `deco:ready` with `version: 1` to the parent window.
3. Registers a `message` event listener for all `deco:*` messages.
4. Sets up edit mode handlers (click-to-select, hover detection).
5. On Vite HMR (`import.meta.hot`), re-sends `deco:ready` after updates.

### useEditorProps(blockId, staticProps)

React hook for live prop hot-swap. Uses `useSyncExternalStore` for tear-free reads.

```typescript
function useEditorProps<T extends Record<string, unknown>>(
  blockId: string,
  staticProps: T,
): T
```

- **In the editor iframe:** Returns the editor's version of props, updated in real-time when the user edits values in the sidebar.
- **Outside the editor / on the server:** Returns `staticProps` unchanged.
- **SSR-safe:** Server snapshot always returns `staticProps`.

### SectionRenderer Component Pattern

The starter template uses this pattern to combine `data-block-id` rendering with live prop injection:

```tsx
import { initEditorBridge, useEditorProps } from "../lib/editor-client";
import pageConfig from "../../.deco/pages/page_home.json";

initEditorBridge();

const sectionRegistry: Record<string, React.ComponentType<any>> = {
  "sections--Hero": Hero,
  "sections--Features": Features,
  "sections--Footer": Footer,
};

interface BlockInstance {
  id: string;
  blockType: string;
  props: Record<string, unknown>;
}

function SectionRenderer({
  block,
  registry,
}: {
  block: BlockInstance;
  registry: Record<string, React.ComponentType<any>>;
}) {
  const props = useEditorProps(block.id, block.props);
  const Section = registry[block.blockType];
  if (!Section) return null;
  return (
    <div data-block-id={block.id}>
      <Section {...props} />
    </div>
  );
}

export default function Home() {
  return (
    <main>
      {pageConfig.blocks.map((block) => (
        <SectionRenderer
          key={block.id}
          block={block}
          registry={sectionRegistry}
        />
      ))}
    </main>
  );
}
```

Source: `packages/starter-template/app/routes/home.tsx`

---

## postMessage Protocol Specification

The editor and site communicate via `window.postMessage`. All messages use a `deco:` prefix. The full protocol is defined in `packages/mesh-plugin-site-editor/client/lib/editor-protocol.ts`.

### Editor to Site (EditorMessage)

Messages sent from the Mesh editor to the site iframe:

```typescript
type EditorMessage =
  | { type: "deco:page-config"; page: Page }
  | {
      type: "deco:update-block";
      blockId: string;
      props: Record<string, unknown>;
    }
  | { type: "deco:select-block"; blockId: string }
  | { type: "deco:set-viewport"; width: number }
  | { type: "deco:deselect" }
  | { type: "deco:set-mode"; mode: "edit" | "interact" }
  | { type: "deco:ping" };
```

#### deco:page-config

**Payload:** `{ type: "deco:page-config"; page: Page }`

Sends the full page configuration to the site. Dispatched on initial editor connection and when the user navigates to a different page. The `page` object follows the `Page` interface (id, path, title, blocks, metadata).

#### deco:update-block

**Payload:** `{ type: "deco:update-block"; blockId: string; props: Record<string, unknown> }`

Updates a single block's props. Sent when the user edits a prop value in the editor sidebar. The `blockId` matches a block instance's `id` in the page config. The `props` object is the complete updated props (not a partial merge).

#### deco:select-block

**Payload:** `{ type: "deco:select-block"; blockId: string }`

Instructs the site to scroll to and highlight the specified block. Sent when the user clicks a section name in the editor sidebar. The bridge finds the element with `data-block-id="{blockId}"` and calls `scrollIntoView({ behavior: "smooth", block: "center" })`.

#### deco:set-viewport

**Payload:** `{ type: "deco:set-viewport"; width: number }`

Sets the viewport width for responsive preview. Sent when the user changes the viewport size in the editor toolbar.

#### deco:deselect

**Payload:** `{ type: "deco:deselect" }`

Clears the current block selection. Sent when the user clicks outside the section list or deselects in the editor.

#### deco:set-mode

**Payload:** `{ type: "deco:set-mode"; mode: "edit" | "interact" }`

Switches between edit and interact modes:
- **edit** -- Clicks select sections (prevented from navigating). Hover shows overlays.
- **interact** -- Site behaves normally. Link clicks report navigation via `deco:navigated`.

#### deco:ping

**Payload:** `{ type: "deco:ping" }`

Heartbeat message. The site must respond with `deco:pong`. Used to detect if the bridge is alive.

---

### Site to Editor (SiteMessage)

Messages sent from the site iframe to the Mesh editor:

```typescript
type SiteMessage =
  | { type: "deco:ready"; version: number }
  | { type: "deco:block-clicked"; blockId: string; rect: DOMRect }
  | {
      type: "deco:blocks-rendered";
      blocks: Array<{ id: string; rect: DOMRect }>;
    }
  | {
      type: "deco:block-hover";
      blockId: string | null;
      rect: DOMRect | null;
    }
  | { type: "deco:navigated"; url: string; isInternal: boolean }
  | { type: "deco:click-away" }
  | { type: "deco:section-error"; blockId: string; error: string }
  | { type: "deco:pong" };
```

#### deco:ready

**Payload:** `{ type: "deco:ready"; version: 1 }`

Sent when the bridge initializes. Tells the editor the site is ready to receive messages. The `version` field is currently `1`. Also re-sent after Vite HMR updates (explicit bridge only).

#### deco:block-clicked

**Payload:** `{ type: "deco:block-clicked"; blockId: string; rect: DOMRect }`

Sent in edit mode when the user clicks on a section in the site. The `blockId` comes from the `data-block-id` attribute. The `rect` contains the section's bounding box (`top`, `left`, `width`, `height`) for overlay positioning.

#### deco:blocks-rendered

**Payload:** `{ type: "deco:blocks-rendered"; blocks: Array<{ id: string; rect: DOMRect }> }`

Reports the positions of all rendered blocks. Used by the editor to draw selection and hover overlays accurately.

#### deco:block-hover

**Payload:** `{ type: "deco:block-hover"; blockId: string | null; rect: DOMRect | null }`

Sent in edit mode on mouse movement. When hovering over a section, sends the block ID and bounding rect. When hovering outside all sections (or on mouse leave), sends `null` for both fields to clear the overlay.

#### deco:navigated

**Payload:** `{ type: "deco:navigated"; url: string; isInternal: boolean }`

Sent in interact mode when the user clicks a link or browser navigation occurs. `isInternal` is `true` if the link stays on the same origin. Also sent on `popstate` events.

#### deco:click-away

**Payload:** `{ type: "deco:click-away" }`

Sent in edit mode when the user clicks outside any section (no `data-block-id` found in the DOM ancestry). The editor uses this to deselect the current section.

#### deco:section-error

**Payload:** `{ type: "deco:section-error"; blockId: string; error: string }`

Reports a render error in a specific section. The editor can display this in the section list or prop editor.

#### deco:pong

**Payload:** `{ type: "deco:pong" }`

Response to `deco:ping`. Confirms the bridge is alive and responsive.

---

## Troubleshooting / Common Mistakes

Ordered by likelihood. Each item: symptom, cause, fix.

### 1. Missing data-block-id Attributes

**Symptom:** Sections render correctly but clicking them in the editor does nothing. Hover overlays do not appear.

**Cause:** The section wrapper `<div>` does not have a `data-block-id` attribute. The bridge walks up the DOM from click/hover targets looking for this attribute. Without it, the bridge sends `deco:click-away` instead of `deco:block-clicked`.

**Fix:** Wrap every section component in a div with `data-block-id={block.id}`:
```tsx
<div data-block-id={block.id}>
  <Section {...block.props} />
</div>
```

### 2. Both Bridge Approaches Active Simultaneously

**Symptom:** Duplicate events in the console. Editor receives two `deco:ready` messages. Prop updates fire twice.

**Cause:** The site uses both `decoEditorBridgePlugin()` in vite.config.ts AND `initEditorBridge()` in route files. Each creates its own bridge instance.

**Fix:** Choose one approach and remove the other:
- If using Vite plugin: remove all `initEditorBridge()` and `useEditorProps()` calls. Use `CustomEvent` listeners for live updates.
- If using explicit bridge: remove `decoEditorBridgePlugin()` from vite.config.ts.

### 3. Vite Plugin Not in Dev Mode

**Symptom:** Bridge works in `bun run dev` but not in production. Clicking sections does nothing in the deployed site.

**Cause:** `decoEditorBridgePlugin()` has `apply: "serve"` -- it only runs during Vite's dev server, never in production builds. This is correct behavior (production sites should not have the bridge).

**Fix:** No fix needed. The editor bridge is a development-only feature. In production, sites render normally without editor interaction. The CMS editor always connects to the site's dev server.

### 4. Cross-Origin Iframe Restrictions

**Symptom:** The bridge fails silently. No `deco:ready` message reaches the editor. Console may show cross-origin errors.

**Cause:** The site and editor are on different origins, and the browser blocks postMessage or script injection. The Vite plugin approach avoids injection issues (the script is part of the HTML response), but postMessage still requires the correct origin.

**Fix:** During development, ensure the editor and site dev server can communicate. The bridge uses `window.parent.postMessage(msg, "*")` with wildcard origin for development flexibility. If you see cross-origin errors, check that the iframe `src` is accessible.

### 5. Block IDs Mismatch Between Page JSON and Rendered DOM

**Symptom:** Clicking a section in the editor selects the wrong section, or prop edits go to the wrong block.

**Cause:** The `data-block-id` attribute value does not match the `id` field in the page JSON's `blocks` array.

**Fix:** Ensure `data-block-id={block.id}` uses the exact same `id` from the page configuration. Do not generate new IDs at render time.

### 6. Missing .deco/ Directory or Incorrect Block Format

**Symptom:** The sections list in the editor is empty. Block scanning finds nothing.

**Cause:** The `.deco/` directory does not exist, or block JSON files are missing required fields (`id`, `component`, `schema`).

**Fix:** Run the block scanner (`CMS_BLOCK_SCAN` tool) to auto-generate block definitions from your TypeScript components. Verify that each JSON file in `.deco/blocks/` has `id`, `component`, `label`, `category`, `description`, `schema`, `defaults`, and `metadata` fields.

### 7. Wrong postMessage Origin

**Symptom:** Messages sent but never received. No errors in console.

**Cause:** Custom origin checking on either side rejects messages from the other origin.

**Fix:** The bridge uses wildcard `*` as the target origin during development. Do not add custom origin checks unless deploying to production. If you must validate origins, ensure both the editor URL and the site dev server URL are whitelisted.

---

## Machine-Checkable Compatibility Checklist

Use this checklist to verify a site is fully deco-compatible. Each check has a programmatic verification.

```
CHECK-01: .deco/ directory exists at project root
  verify: fs.existsSync('.deco/')

CHECK-02: .deco/blocks/ contains at least one .json file
  verify: glob('.deco/blocks/*.json').length > 0

CHECK-03: Each block JSON has required fields (id, component, schema)
  verify: JSON.parse(blockFile).id && JSON.parse(blockFile).component && JSON.parse(blockFile).schema

CHECK-04: .deco/pages/ contains at least one page JSON
  verify: glob('.deco/pages/*.json').length > 0

CHECK-05: Page JSON has blocks array with blockType and props
  verify: page.blocks.every(b => b.blockType && b.props !== undefined)

CHECK-06: Site renders data-block-id on section wrappers
  verify: document.querySelectorAll('[data-block-id]').length > 0

CHECK-07: Bridge integration active (Vite plugin OR initEditorBridge)
  verify: vite.config includes decoEditorBridgePlugin() OR route files import initEditorBridge

CHECK-08: NOT both bridge approaches active simultaneously
  verify: !(vite.config includes decoEditorBridgePlugin() AND route files import initEditorBridge)

CHECK-09: Block IDs in page JSON match rendered data-block-id values
  verify: page.blocks.every(b => document.querySelector(`[data-block-id="${b.id}"]`))

CHECK-10: Bridge sends deco:ready on load (when in iframe)
  verify: Listen for postMessage with type "deco:ready" after iframe loads
```

---

## Loader Definition Format

Loader definitions are stored in `.deco/loaders/{id}.json`. They define data-fetching functions that blocks can reference via `LoaderRef` props.

```typescript
interface LoaderDefinition {
  /** Unique ID derived from loader path, e.g., "loaders--productList" */
  id: string;
  /** Source file path, e.g., "loaders/productList.ts" */
  source: string;
  /** Human-readable label, e.g., "Product List" */
  label: string;
  /** Category derived from directory, e.g., "Loaders" */
  category: string;
  /** Description from JSDoc */
  description: string;
  /** JSON Schema for loader INPUT parameters (Props type) */
  inputSchema: JSONSchema7;
  /** JSON Schema for loader OUTPUT (return type) */
  outputSchema: JSONSchema7;
  /** Default input parameter values */
  defaults: Record<string, unknown>;
  /** Scan metadata */
  metadata: {
    scannedAt: string;
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    propsTypeName: string | null;
    returnTypeName: string | null;
    customized: string[];
  };
}
```

Source: `packages/mesh-plugin-site-editor/server/scanner/types.ts`

---

## Source Files Reference

| Concept | Source File |
|---------|------------|
| EditorMessage / SiteMessage types | `packages/mesh-plugin-site-editor/client/lib/editor-protocol.ts` |
| BlockDefinition / LoaderDefinition interfaces | `packages/mesh-plugin-site-editor/server/scanner/types.ts` |
| Page / BlockInstance interfaces | `packages/mesh-plugin-site-editor/client/lib/page-api.ts` |
| Injectable bridge (editor-side) | `packages/mesh-plugin-site-editor/client/lib/inject-bridge.ts` |
| Vite plugin with bridge script | `packages/vite-plugin-deco/index.ts` |
| Explicit client bridge | `packages/starter-template/app/lib/editor-client.ts` |
| SectionRenderer pattern | `packages/starter-template/app/routes/home.tsx` |
