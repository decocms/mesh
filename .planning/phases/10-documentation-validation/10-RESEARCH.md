# Phase 10: Documentation & Validation - Research

**Researched:** 2026-02-16
**Domain:** Blocks framework specification + end-to-end validation
**Confidence:** HIGH

## Summary

Phase 10 has two deliverables: (1) a comprehensive BLOCKS_FRAMEWORK.md specification that enables AI agents and developers to make any TypeScript site deco-compatible, and (2) end-to-end validation of the deco CMS site editor using anjo.chat as the reference site.

The research confirms that all source material for the spec exists in the codebase: the `.deco/` directory conventions are well-established with JSON files in `blocks/`, `pages/`, and `loaders/` subdirectories; the postMessage protocol is fully typed in `editor-protocol.ts`; and there are two working integration approaches (Vite plugin auto-injection and explicit `initEditorBridge()`). The anjo.chat site already has `.deco/` scaffolding, uses `decoEditorBridgePlugin()`, and renders `data-block-id` attributes. Validation is a matter of connecting the pieces and fixing any bugs that surface.

**Primary recommendation:** Write the spec by extracting and documenting from actual source code (not inventing). Use the starter template as the canonical "happy path" example, with anjo.chat as a real-world integration showing the CustomEvents approach. Structure the Claude skill as a project-level command file (`.claude/commands/deco/blocks-framework.md`) that contains the full spec inline.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Spec document structure
- Goal-first organization: start with "what you're trying to achieve" (make a site deco-compatible), then explain how each piece fits -- top-down narrative
- Audience is both AI agents and developers -- clear structure for machine parsing, but also human-readable
- Include full JSON Schema examples for blocks (e.g., a real Hero section) so agents can pattern-match
- Cover both integration paths: (1) making an existing site deco-compatible, and (2) what the starter template provides out of the box

#### Integration guide tone
- Explained walkthrough for initEditorBridge() -- step-by-step: what it does, where it goes, what each part means, then the code
- Full postMessage protocol specification -- document every message type, payload shape, and expected response (someone could reimplement the bridge)
- Include a troubleshooting / common mistakes section with fixes (missing data-block-id, wrong message origin, etc.)
- Include a machine-checkable compatibility checklist -- structured with file paths to verify, attributes to check, so an agent could automate verification

#### Validation scope
- Scripted verification checklist -- the executor follows step-by-step, recording pass/fail for each item
- Core flow only: connect, scan, preview, click-to-select, prop editing (Phases 1-9 features). Multi-site switching (09.1) excluded
- If validation reveals bugs in the deco CMS site editor: fix everything -- the goal is a working end-to-end demo
- anjo.chat already has .deco/ scaffolding from prior manual setup -- no initial setup needed in the plan

#### Spec file location
- Canonical version in the mesh repo (apps/mesh/docs/ or similar)
- Full copy in the starter template -- same BLOCKS_FRAMEWORK.md, one source of truth, no condensed version
- Also exposed as a Claude Code skill (/deco:blocks-framework) for agent discoverability
- Cross-references with the Astro docs site (apps/docs/) -- spec links to docs for deeper topics, docs links back to spec

### Claude's Discretion
- Exact file path within apps/mesh/ for the canonical spec
- How to structure the Claude skill (wrapper vs direct content)
- Ordering of troubleshooting items by likelihood
- Specific pass/fail criteria thresholds for the validation checklist

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SPEC-01 | Agent-readable skill document exists that explains `.deco/` directory conventions, block definition format, `data-block-id` attributes, postMessage protocol, and `initEditorBridge()` integration -- sufficient for any AI agent to make a site deco-compatible | All five topics fully documented in source code: `.deco/` conventions in scanner types + page-api; block format in `BlockDefinition` interface; `data-block-id` in starter template routes + inject-bridge; protocol in `editor-protocol.ts`; `initEditorBridge()` in `editor-client.ts`. Two integration paths exist: Vite plugin (auto-inject) and explicit client-side bridge. |
| VAL-01 | anjo.chat works end-to-end as a reference implementation -- connection setup, sections listing, loader listing, live preview, click-to-select, and prop editing all functional | anjo.chat has `.deco/` scaffolding (9 block defs, 2 page configs), uses `decoEditorBridgePlugin()` in vite.config.ts, renders `data-block-id` on all section wrappers. Missing: `initEditorBridge()` and `useEditorProps` from starter-template pattern (uses its own `useEditorBlocks` CustomEvents approach). No loaders exist in anjo.chat. Validation needs to verify the Vite-plugin-injected bridge handles all message types including `deco:update-block` CustomEvent dispatch. |
</phase_requirements>

## Standard Stack

This phase is primarily documentation and manual validation -- no new libraries are needed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Markdown | N/A | BLOCKS_FRAMEWORK.md specification format | Universal, parseable by both humans and agents |
| Claude Code commands | N/A | Skill exposure via `.claude/commands/` | Claude Code's native project-level command system |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | N/A | N/A | N/A |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `.claude/commands/` wrapper | Inline full spec in command | Wrapper adds indirection; inline is simpler but larger file. Recommend inline since the spec IS the skill content. |
| `docs/BLOCKS_FRAMEWORK.md` | `apps/mesh/docs/BLOCKS_FRAMEWORK.md` | Top-level `docs/` is simpler; `apps/mesh/docs/` scopes to the main app. Recommend `docs/BLOCKS_FRAMEWORK.md` at repo root for discoverability. |

## Architecture Patterns

### Recommended Spec File Locations

```
mesh/
├── docs/
│   └── BLOCKS_FRAMEWORK.md          # Canonical spec (repo root docs/)
├── packages/starter-template/
│   └── BLOCKS_FRAMEWORK.md          # Full copy for template users
├── .claude/
│   └── commands/
│       └── deco/
│           └── blocks-framework.md   # Claude skill (invokable as /deco:blocks-framework)
```

**Rationale for `docs/` at repo root:** The spec is not specific to `apps/mesh/` (it's about the framework contract between sites and the editor). Placing it at `docs/BLOCKS_FRAMEWORK.md` makes it discoverable from the repo root. The `apps/mesh/docs/` directory does not exist yet and would need to be created either way.

### Pattern 1: Claude Code Project Command

**What:** Claude Code supports project-level commands in `.claude/commands/`. A file at `.claude/commands/deco/blocks-framework.md` becomes invokable as `/deco:blocks-framework`.

**When to use:** When the spec should be available as an agent skill without external context.

**Recommended structure:** The command file should contain the full spec content directly. Claude Code commands are markdown files whose content is injected as context when invoked. No wrapper logic needed -- the content IS the skill.

```markdown
---
description: Blocks framework specification for making TypeScript sites deco-compatible
---

# Blocks Framework Specification
[Full spec content here]
```

### Pattern 2: Two Bridge Integration Approaches

**What:** The codebase supports two ways for a site to integrate with the deco editor:

1. **Vite Plugin (auto-inject, zero-code):** `decoEditorBridgePlugin()` from `@decocms/vite-plugin` injects a `<script>` into every HTML response. The script handles the full postMessage protocol (ready handshake, click detection, hover, mode switching, heartbeat). The site only needs `data-block-id` attributes on section wrappers. For live prop hot-swap, the injected bridge dispatches `CustomEvent`s (`deco:page-config`, `deco:update-block`) that the site can listen to.

2. **Explicit Client Bridge (starter template pattern):** Import `initEditorBridge()` from `editor-client.ts` at module level in route files. Use `useEditorProps(blockId, staticProps)` hook for automatic prop hot-swap via `useSyncExternalStore`. This approach gives the site direct access to the bridge state.

**Both approaches coexist.** The Vite plugin's bridge script and the explicit `initEditorBridge()` both send `deco:ready` -- but only one should be active. The Vite plugin checks `window.self === window.top` and no-ops outside iframes. The explicit client checks `window === window.parent`.

**Critical detail for spec:** anjo.chat uses approach 1 (Vite plugin) + its own `useEditorBlocks()` hook that listens for `CustomEvent`s. The starter template uses approach 2 (explicit bridge + `useEditorProps`). The spec must document both.

### Pattern 3: .deco/ Directory Convention

**What:** The `.deco/` directory at the project root stores all CMS configuration as JSON files:

```
.deco/
├── blocks/
│   ├── sections--Hero.json        # Block definition
│   ├── sections--Footer.json
│   └── ...
├── pages/
│   ├── page_home.json             # Page config (default locale)
│   ├── page_home.en-US.json       # Page variant (locale)
│   └── ...
└── loaders/
    ├── loaders--products.json     # Loader definition
    └── ...
```

**ID convention:** Block IDs use `{category}--{ComponentName}` (e.g., `sections--Hero`). Derived from file path: `sections/Hero.tsx` -> `sections--Hero`. Loader IDs follow the same pattern: `loaders--productList`.

**Page filename convention:** `{pageId}.json` for default, `{pageId}.{locale}.json` for variants. Locale pattern: `[a-z]{2}(-[A-Z]{2})?`.

### Pattern 4: Block Definition Schema (Canonical)

Based on the actual `BlockDefinition` TypeScript interface in `packages/mesh-plugin-site-editor/server/scanner/types.ts`:

```json
{
  "id": "sections--Hero",
  "component": "app/components/sections/hero.tsx",
  "label": "Hero",
  "category": "sections",
  "description": "Hero section with badge, headline, and subtitle",
  "schema": {
    "type": "object",
    "properties": {
      "badge": { "type": "string", "description": "Badge text" },
      "title1": { "type": "string", "description": "First line of title" },
      "title2": { "type": "string", "description": "Second line of title" },
      "subtitle": { "type": "string", "description": "Subtitle text" }
    }
  },
  "defaults": {
    "badge": "Default badge text",
    "title1": "Default title",
    "title2": "line two",
    "subtitle": "Default subtitle"
  },
  "metadata": {
    "scannedAt": "2026-02-14T00:00:00.000Z",
    "scanMethod": "ts-morph",
    "propsTypeName": "HeroProps",
    "customized": []
  }
}
```

**Note:** The starter template's block format uses slightly different field names (`type`, `title`, `filePath`) vs the scanner output (`component`, `label`, `category`). The scanner's `BlockDefinition` interface is the canonical format. The spec should document the scanner format as authoritative.

### Anti-Patterns to Avoid

- **Documenting hypothetical features:** Only document what exists in the codebase today. Do not speculate about planned features.
- **Divergent spec copies:** The starter template copy and the canonical copy must be identical. Use a task that copies the file, not maintains two versions.
- **Mixing validation concerns:** Validation tests the CMS editor integration, not anjo.chat's application code. Bug fixes go in `packages/mesh-plugin-site-editor/` or `packages/vite-plugin-deco/`, not in anjo.chat's business logic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Protocol documentation | Manual list of messages | Extract from `EditorMessage` and `SiteMessage` TypeScript unions in `editor-protocol.ts` | Source of truth is the code; manual docs drift |
| Block schema examples | Fabricated examples | Real examples from anjo.chat `.deco/blocks/` (e.g., `sections--Hero.json`) | Real examples prove the spec matches reality |
| Compatibility checklist | Prose descriptions | Machine-parseable checklist with file paths and attribute checks | Decision requires machine-checkable format |

**Key insight:** The spec's accuracy depends on extracting from source code, not writing from memory. Every protocol message, every field name, every convention should be verified against the actual TypeScript types and JSON files.

## Common Pitfalls

### Pitfall 1: Block Definition Format Inconsistency
**What goes wrong:** The starter template's manually-created block JSONs use different field names (`type`, `title`, `filePath`) than the scanner-generated ones (`component`, `label`, `category`). The spec documents one format, but files in the wild use another.
**Why it happens:** The starter template was hand-crafted early; the scanner was built later with a refined schema.
**How to avoid:** Document the `BlockDefinition` interface from `scanner/types.ts` as the canonical format. Note that older hand-crafted files may use legacy field names. The scanner output is authoritative.
**Warning signs:** Spec examples don't match actual files in `.deco/blocks/`.

### Pitfall 2: Two Bridge Approaches Cause Confusion
**What goes wrong:** A developer tries to use both the Vite plugin bridge AND `initEditorBridge()` simultaneously, causing duplicate `deco:ready` messages and double event handling.
**Why it happens:** The spec doesn't clearly delineate when to use which approach.
**How to avoid:** The spec must have a clear decision tree: "If you use `decoEditorBridgePlugin()` in vite.config.ts, the bridge is auto-injected -- do NOT also call `initEditorBridge()`. Use `CustomEvent` listeners or write your own hook. If you want explicit control, skip the Vite plugin and use `initEditorBridge()` + `useEditorProps()`."
**Warning signs:** Two `deco:ready` messages in the console, events firing twice.

### Pitfall 3: Missing data-block-id Attributes
**What goes wrong:** Click-to-select and hover overlays don't work because section wrapper divs don't have `data-block-id` attributes.
**Why it happens:** The developer renders the section component directly without wrapping it in a `<div data-block-id={block.id}>`.
**How to avoid:** The spec should emphasize this as the critical rendering requirement. The compatibility checklist should verify `data-block-id` attributes exist in the rendered DOM.
**Warning signs:** Sections render correctly but clicking them in the editor does nothing.

### Pitfall 4: Validation Bug Fixes Scope Creep
**What goes wrong:** Validation reveals issues in anjo.chat's application code that are unrelated to the CMS integration, and the executor spends time "fixing" site bugs instead of CMS bugs.
**Why it happens:** Boundary between "CMS integration bug" and "site bug" is unclear.
**How to avoid:** Decision is locked: validation fixes bugs in the CMS/plugin, not in anjo.chat's application code. If an anjo.chat-specific issue blocks validation, document it as a known issue and work around it.
**Warning signs:** Changes being made in `anjo.chat/app/components/` rather than `mesh/packages/`.

### Pitfall 5: postMessage Origin Security
**What goes wrong:** The bridge uses `window.parent.postMessage(msg, "*")` with wildcard origin. In production, this could be a security concern.
**Why it happens:** Development convenience -- the editor and site may be on different origins.
**How to avoid:** The spec should document this as a known limitation and recommend origin validation for production deployments. The troubleshooting section should mention that cross-origin restrictions can prevent bridge injection.
**Warning signs:** Bridge script fails silently when iframe is cross-origin and injection is attempted.

### Pitfall 6: Validation Depends on Local Services Running
**What goes wrong:** The validation checklist assumes certain services are running (mesh dev server, anjo.chat dev server, MCP connections configured) but doesn't specify setup.
**Why it happens:** The executor doesn't have the exact startup sequence documented.
**How to avoid:** The validation plan should include exact startup commands and prerequisites before the first test step.
**Warning signs:** First validation step fails because the development environment isn't configured.

## Code Examples

### Editor Protocol Messages (from source)

Source: `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/lib/editor-protocol.ts`

**Editor -> Site (EditorMessage):**
```typescript
| { type: "deco:page-config"; page: Page }           // Send full page config to site
| { type: "deco:update-block"; blockId: string; props: Record<string, unknown> }  // Update single block props
| { type: "deco:select-block"; blockId: string }      // Scroll to and highlight a block
| { type: "deco:set-viewport"; width: number }        // Set viewport width
| { type: "deco:deselect" }                           // Clear block selection
| { type: "deco:set-mode"; mode: "edit" | "interact" } // Switch edit/interact mode
| { type: "deco:ping" }                               // Heartbeat ping
```

**Site -> Editor (SiteMessage):**
```typescript
| { type: "deco:ready"; version: number }             // Bridge initialized, ready for communication
| { type: "deco:block-clicked"; blockId: string; rect: DOMRect }  // User clicked a section
| { type: "deco:blocks-rendered"; blocks: Array<{ id: string; rect: DOMRect }> }  // Rendered block positions
| { type: "deco:block-hover"; blockId: string | null; rect: DOMRect | null }  // Hover over/off a section
| { type: "deco:navigated"; url: string; isInternal: boolean }  // Navigation in interact mode
| { type: "deco:click-away" }                         // Click outside any section
| { type: "deco:section-error"; blockId: string; error: string }  // Section render error
| { type: "deco:pong" }                               // Heartbeat response
```

### Minimal Site Integration (Vite Plugin Path)

```typescript
// vite.config.ts
import { decoEditorBridgePlugin } from "@decocms/vite-plugin";
export default defineConfig({
  plugins: [decoEditorBridgePlugin(), /* ... */],
});

// route file (e.g., app/routes/home.tsx)
import pageConfig from "../../.deco/pages/page_home.json";

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

### Explicit Bridge Integration (Starter Template Path)

```typescript
// route file
import { initEditorBridge, useEditorProps } from "../lib/editor-client";
initEditorBridge(); // Module-level, no-op outside iframes

function SectionRenderer({ block, registry }) {
  const props = useEditorProps(block.id, block.props);  // Live prop hot-swap
  const Section = registry[block.blockType];
  if (!Section) return null;
  return (
    <div data-block-id={block.id}>
      <Section {...props} />
    </div>
  );
}
```

### Page Config JSON Structure

Source: `/Users/guilherme/Projects/anjo.chat/.deco/pages/page_home.json`

```json
{
  "id": "page_home",
  "path": "/",
  "title": "Page Title",
  "blocks": [
    {
      "id": "block_hero",
      "blockType": "sections--Hero",
      "props": {
        "badge": "Badge text",
        "title1": "First line",
        "title2": "Second line",
        "subtitle": "Subtitle text"
      }
    }
  ],
  "metadata": {
    "description": "Page description",
    "createdAt": "2026-02-14T00:00:00.000Z",
    "updatedAt": "2026-02-16T20:00:00.000Z"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual block JSON files | ts-morph scanner auto-generates from TypeScript types | Phase 2 (block-scanner) | Scanner output is canonical; manual files may have legacy field names |
| `inject-bridge.ts` (editor injects into iframe) | `decoEditorBridgePlugin()` (Vite auto-injects) | Phase 9 | Sites no longer need same-origin for bridge injection; Vite plugin works for SSR and SPA |
| Editor controls all bridge logic | Site can also use `initEditorBridge()` + `useEditorProps()` | Phase 9 | Two valid approaches; spec must cover both |

## Discretionary Recommendations

### Canonical Spec File Path

**Recommendation:** `docs/BLOCKS_FRAMEWORK.md` at repo root.

**Rationale:** The `apps/mesh/docs/` directory does not exist. Creating it scopes the spec under the mesh app, but the framework spec is broader -- it defines the contract any site must follow, independent of the mesh server. A top-level `docs/` directory makes it more discoverable. The docs site at `apps/docs/` is an Astro site with MDX content; the spec should cross-reference but not live inside the Astro content structure.

### Claude Skill Structure

**Recommendation:** Direct content in `.claude/commands/deco/blocks-framework.md`. No wrapper, no `cat` of external file. The command file IS the spec.

**Rationale:** Claude Code commands inject their markdown content as context when invoked. A wrapper that says "read docs/BLOCKS_FRAMEWORK.md" adds a tool call roundtrip and may fail if the file path changes. Instead, the command file should contain the complete spec. This means the canonical file and the skill file have the same content, and they should be kept in sync (or one should be the source). Since the user wants "one source of truth," the plan should copy from canonical to skill during the spec writing task, not maintain two independent files.

**Alternative considered:** Having the skill file reference the canonical file with a short description. Rejected because it breaks the "self-contained for agents" requirement.

### Troubleshooting Order (by likelihood)

Based on the integration patterns observed:

1. **Missing `data-block-id` attributes** -- Most common, causes click-to-select and hover to silently fail
2. **Both bridge approaches active simultaneously** -- Duplicate events, confusing behavior
3. **Vite plugin not in dev mode** -- `decoEditorBridgePlugin()` only runs in `serve` mode (`apply: "serve"`), missing from production builds (this is correct behavior but confusing for debugging)
4. **Cross-origin iframe restrictions** -- Bridge injection fails silently for cross-origin iframes; the Vite plugin approach avoids this
5. **Block IDs in page JSON don't match rendered `data-block-id`** -- Prop edits go to wrong section or no section
6. **Missing `.deco/` directory or incorrect block format** -- Scanner generates correct format; manual creation may have errors
7. **Wrong postMessage origin** -- Wildcard `*` avoids this in dev, but custom origin checks would break

### Validation Pass/Fail Criteria

**Recommendation:** Binary pass/fail for each checklist item. Overall: all items must pass. If any item fails, the executor must fix the underlying bug and re-test that item.

Items should be structured as:
```
[ ] ITEM-ID: Description of expected behavior
    Action: [what to do]
    Expected: [what should happen]
    Pass criteria: [specific observable result]
```

## Open Questions

1. **anjo.chat bridge approach compatibility**
   - What we know: anjo.chat uses `decoEditorBridgePlugin()` (Vite auto-inject) + its own `useEditorBlocks()` hook listening for CustomEvents. It does NOT use `initEditorBridge()` or `useEditorProps()`.
   - What's unclear: The Vite plugin's BRIDGE_SCRIPT handles `deco:update-block` by dispatching a `CustomEvent`. anjo.chat's `useEditorBlocks()` only listens for `deco:page-config` and `deco:update-block` CustomEvents. This should work for prop editing. But: does the `deco:page-config` CustomEvent get dispatched at the right time during initial connection? Need to validate.
   - Recommendation: This is a validation concern. The executor will discover if it works or doesn't during the validation checklist, and fix if needed.

2. **Loader listing for anjo.chat**
   - What we know: anjo.chat has zero loader files (no `app/loaders/` directory). The VAL-01 requirement includes "loader listing" as a validation item.
   - What's unclear: Should the validation check show an empty loaders list, or should anjo.chat add a sample loader?
   - Recommendation: Validate that the loaders panel shows an empty state correctly when no loaders exist. This IS valid behavior. Do not add fake loaders to anjo.chat.

3. **Starter template block format divergence**
   - What we know: Manually-created block JSONs in the starter template use `type`, `title`, `filePath` fields. Scanner-generated blocks use `component`, `label`, `category`. The `BlockDefinition` TypeScript interface is the authoritative schema.
   - What's unclear: Will the editor correctly read both formats, or does it expect one?
   - Recommendation: The spec should document the `BlockDefinition` format. If the starter template's manual files cause issues during validation, update them to match the scanner output format.

## Sources

### Primary (HIGH confidence)
- `packages/mesh-plugin-site-editor/client/lib/editor-protocol.ts` -- Full EditorMessage and SiteMessage type definitions
- `packages/mesh-plugin-site-editor/client/lib/inject-bridge.ts` -- Injectable bridge source code (bridgeMain function)
- `packages/mesh-plugin-site-editor/server/scanner/types.ts` -- BlockDefinition, LoaderDefinition, PageConfig canonical interfaces
- `packages/starter-template/app/lib/editor-client.ts` -- initEditorBridge(), useEditorProps() implementation
- `packages/starter-template/app/routes/home.tsx` -- SectionRenderer pattern with data-block-id
- `packages/vite-plugin-deco/index.ts` -- decoEditorBridgePlugin() with inline BRIDGE_SCRIPT
- `packages/mesh-plugin-site-editor/client/lib/use-iframe-bridge.ts` -- Editor-side bridge lifecycle
- `packages/mesh-plugin-site-editor/client/lib/page-api.ts` -- Page types (Page, BlockInstance, LoaderRef)
- `/Users/guilherme/Projects/anjo.chat/.deco/blocks/sections--Hero.json` -- Real block definition example
- `/Users/guilherme/Projects/anjo.chat/.deco/pages/page_home.json` -- Real page config example
- `/Users/guilherme/Projects/anjo.chat/app/routes/home.tsx` -- Real site integration with useEditorBlocks()
- `/Users/guilherme/Projects/anjo.chat/vite.config.ts` -- decoEditorBridgePlugin() usage

### Secondary (MEDIUM confidence)
- `.planning/phases/09-preview-bridge/09-01-SUMMARY.md` -- Phase 9 summary confirming bridge architecture

### Tertiary (LOW confidence)
- None -- all findings verified from source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no libraries needed, just documentation
- Architecture: HIGH -- all source code read and verified, two integration paths clearly understood
- Pitfalls: HIGH -- derived from actual code review (format inconsistencies, dual bridge approaches, missing attributes)

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- documentation of existing code)
