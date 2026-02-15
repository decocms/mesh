# Milestones: deco.cx v2

## v1.0 — Plugin Foundation (Completed 2026-02-14)

**Goal:** Build the core site-editor Mesh plugin with pages, blocks, visual editing, loaders, and publishing.

**Phases:** 5 (01-plugin-shell through 05-publishing)
**Plans executed:** 13
**Total execution time:** ~0.8 hours

**What shipped:**
- Mesh plugin skeleton with SITE_BINDING, sidebar nav (Pages/Sections/Loaders)
- Page CRUD with git-based JSON storage in `.deco/pages/`
- Tunnel-based iframe preview panel
- ts-morph block scanner with JSON Schema generation
- @rjsf property editor forms from auto-generated schemas
- Three-panel visual editor (section list, iframe preview, prop editor)
- DnD section reordering via @dnd-kit
- Live preview via postMessage protocol
- Undo/redo for all editing operations
- Loader editor UI with prop binding via LoaderRef
- Branch-based draft/publish workflow
- Version history with diff view and one-click revert
- React 19 + Vite + Tailwind starter template

**Post-milestone work (outside GSD):**
- i18n page variants (locale-aware page files, locale switcher in composer)
- Editor bridge for anjo.chat (postMessage handlers, click-to-select)
- anjo.chat sections rewritten to props-only pattern

**Key learnings:**
- SITE_BINDING tools go through site MCP, not SELF MCP
- useSyncExternalStore pattern required by ban-use-effect lint rule
- Page variants need page-level files (not component-level i18n)
- Props ARE the content; i18n only for UI chrome
