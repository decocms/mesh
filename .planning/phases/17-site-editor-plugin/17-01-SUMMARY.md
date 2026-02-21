---
phase: 17-site-editor-plugin
plan: 01
subsystem: ui
tags: [plugin, deco, site-editor, react, typescript, DECO_BLOCKS_BINDING]

# Dependency graph
requires:
  - phase: 16-plugin-deco-blocks
    provides: DECO_BLOCKS_BINDING definition in packages/bindings/src/well-known/deco-blocks.ts
provides:
  - packages/mesh-plugin-site-editor/ workspace package scaffold
  - clientPlugin with DECO_BLOCKS_BINDING, setup, renderHeader, renderEmptyState
  - serverPlugin stub for plan 17-06 to extend
  - PLUGIN_ID and PLUGIN_DESCRIPTION shared constants
affects: [17-02, 17-03, 17-04, 17-05, 17-06]

# Tech tracking
tech-stack:
  added:
    - mesh-plugin-site-editor (new workspace package)
    - "@dnd-kit/core, sortable, modifiers, utilities (peer deps for plan 17-03)"
    - "@rjsf/core, utils, validator-ajv8 (peer deps for plan 17-05)"
    - "@decocms/mesh-plugin-deco-blocks (workspace dep)"
  patterns:
    - ClientPlugin<TBinding> pattern with binding-filtered activation
    - Lazy-loaded plugin components (PluginHeader, PluginEmptyState)
    - Shared constants module (shared.ts) safe for client+server bundles

key-files:
  created:
    - packages/mesh-plugin-site-editor/package.json
    - packages/mesh-plugin-site-editor/tsconfig.json
    - packages/mesh-plugin-site-editor/shared.ts
    - packages/mesh-plugin-site-editor/client/index.tsx
    - packages/mesh-plugin-site-editor/client/components/plugin-header.tsx
    - packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx
    - packages/mesh-plugin-site-editor/server/index.ts
  modified: []

key-decisions:
  - "Plugin uses ClientPlugin<typeof DECO_BLOCKS_BINDING> for binding-filtered activation — tab hides automatically for projects without the binding"
  - "server/index.ts is a stub with empty routes() — extended in plan 17-06"
  - "registerPluginRoutes([]) called with empty array in plan 01 — routes added in plan 17-04"

patterns-established:
  - "Plugin shell pattern: shared.ts constants, client/index.tsx ClientPlugin, server/index.ts ServerPlugin"
  - "Plugin header uses native HTML dropdown to avoid UI package type conflicts"

requirements-completed: [EDT-15]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 17 Plan 01: Site Editor Plugin Scaffold Summary

**ClientPlugin<DECO_BLOCKS_BINDING> shell with connection selector header, empty state, and server stub — packages/mesh-plugin-site-editor ready for plans 17-02 through 17-06**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T19:10:34Z
- **Completed:** 2026-02-21T19:12:03Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Scaffolded packages/mesh-plugin-site-editor/ as a valid Bun workspace package with client/server entry exports
- Created clientPlugin typed with ClientPlugin<typeof DECO_BLOCKS_BINDING> — plugin tab hides automatically for projects without the binding
- Created server stub (serverPlugin) for future route extension in plan 17-06
- TypeScript check passes with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold package.json, tsconfig.json, shared.ts** - `1cdf3013d` (chore)
2. **Task 2: Client plugin entry, header, empty state, server stub** - `a497d8eb7` (feat)

**Plan metadata:** _(to be committed with SUMMARY.md and STATE.md)_

## Files Created/Modified
- `packages/mesh-plugin-site-editor/package.json` - Package manifest with workspace deps and ./client, ./server exports
- `packages/mesh-plugin-site-editor/tsconfig.json` - Extends root tsconfig with react-jsx and bundler resolution
- `packages/mesh-plugin-site-editor/shared.ts` - PLUGIN_ID="site-editor" and PLUGIN_DESCRIPTION constants
- `packages/mesh-plugin-site-editor/client/index.tsx` - clientPlugin with DECO_BLOCKS_BINDING, setup, renderHeader, renderEmptyState
- `packages/mesh-plugin-site-editor/client/components/plugin-header.tsx` - Connection selector (single/multi connection modes)
- `packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx` - Empty state shown when no DECO_BLOCKS_BINDING connection
- `packages/mesh-plugin-site-editor/server/index.ts` - Minimal ServerPlugin stub

## Decisions Made
- Plugin uses binding-filtered ClientPlugin so the tab hides entirely for projects without DECO_BLOCKS_BINDING (cleaner UX than greyed-out state)
- server/index.ts deliberately empty routes() — plan 17-06 will add the commit-message route
- registerPluginRoutes([]) in setup — routes will be wired in plan 17-04 when TanStack Router setup exists

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Package scaffold complete — plans 17-02 through 17-06 can add data layer, routes, and UI components
- clientPlugin exports clientPlugin and serverPlugin — ready to be registered in apps/mesh/src/web/plugins.ts (plan 17-02)
- No blockers

---
*Phase: 17-site-editor-plugin*
*Completed: 2026-02-21*
