# Phase 10 Validation Results

Date: 2026-02-17
Test site: ../hypercouple (local STDIO connection)

## Runtime Validation (Manual Testing)

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| V-01 | Connection Setup | PASS | Inline wizard validates path, creates STDIO connection, transitions to connected state |
| V-02 | Tunnel / Preview URL | SKIP | Not tested — hypercouple uses local dev server, tunnel detection not exercised |
| V-03 | Block Scanning | PASS | Scanner discovers components, writes `.deco/blocks/` JSON files |
| V-04 | Sections List View | PASS | Blocks visible with category grouping, collapsible categories work |
| V-05 | Section Detail View | PASS | Two-column layout renders SchemaTree + PropEditor correctly |
| V-06 | Loaders List (Empty) | PASS | Loaders page renders without errors (empty state) |
| V-07 | Live Preview | KNOWN ISSUE | Bridge/STDIO connection disconnects intermittently — separate infrastructure concern |
| V-08 | Click-to-Select | KNOWN ISSUE | Depends on stable bridge connection (V-07) |
| V-09 | Prop Editing Live | KNOWN ISSUE | Depends on stable bridge connection (V-07) |
| V-10 | Save to Git | KNOWN ISSUE | Depends on stable bridge connection (V-07) |

## Bugs Fixed (this session)

### BUG-01: PluginLayout binding check blocks new STDIO connections
- File: `apps/mesh/src/web/layouts/plugin-layout.tsx`
- Symptom: Connection created but plugin stays on empty state
- Root cause: `configuredConnection` looked up from binding-filtered `validConnections`; new STDIO connections have empty tools array so `connectionImplementsBinding` returns false
- Fix: Look up from `allConnections` directly instead of `validConnections`

### BUG-02: pluginId undefined on static plugin routes
- File: `packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx`
- Symptom: Connection created (step 1) but config never saved (step 2 fails silently)
- Root cause: `useParams({ strict: false })` returns undefined for `pluginId` on static routes like `/site-editor` (only `/$pluginId` catch-all has it); `PROJECT_PLUGIN_CONFIG_UPDATE` fails zod validation
- Fix: Added URL path fallback: `params.pluginId ?? location.pathname.split("/").filter(Boolean)[2] ?? ""`

### BUG-03: Sidebar navigation ignores plugin sub-paths
- Files: `packages/bindings/src/core/plugins.ts`, `apps/mesh/src/web/hooks/use-project-sidebar-items.tsx`, `apps/mesh/src/web/index.tsx`, `packages/mesh-plugin-site-editor/client/index.tsx`
- Symptom: Clicking Sections or Loaders in sidebar always shows Pages page
- Root cause: All sidebar group items navigated to plugin root URL with no sub-path support
- Fix: Added `path` field to `RegisterRootSidebarItemParams`, set paths on CMS items (`/`, `/sections`, `/loaders`), updated navigation to append item path

### BUG-04: Block detail crashes on blocks without metadata
- File: `packages/mesh-plugin-site-editor/client/components/block-detail.tsx`
- Symptom: "Cannot read properties of undefined (reading 'scanMethod')" when clicking a section
- Root cause: Block JSON files from hypercouple don't have `metadata` field; code accessed `block.metadata.scanMethod` without null check
- Fix: Added optional chaining (`block.metadata?.scanMethod`, etc.) with conditional rendering

## Known Issues

### KNOWN-01: STDIO bridge disconnects intermittently
- Symptom: MCP connection drops after short period, breaking preview/editing features
- Scope: Infrastructure-level issue with STDIO connection management, not site-editor plugin
- Impact: Blocks V-07 through V-10 validation
- Workaround: Reconnect manually; items V-01 through V-06 work independently of bridge stability

## Code-Level Validation (Static Analysis)

All 10 items previously passed code-level validation (TypeScript compilation, code path analysis).
See git history for full static analysis results.
