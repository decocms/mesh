---
phase: 01-plugin-shell
plan: 01
subsystem: ui
tags: [mesh-plugin, site-editor, bindings, preact, tanstack-router]

# Dependency graph
requires: []
provides:
  - SITE_BINDING well-known binding with READ_FILE, PUT_FILE, LIST_FILES
  - mesh-plugin-site-editor package with server and client entry points
  - ServerPlugin registered in Mesh server-plugins.ts
  - ClientPlugin registered in Mesh web/plugins.ts with CMS sidebar
affects: [01-02, 01-03, 02-page-crud, 03-section-editor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plugin pattern: ServerPlugin + ClientPlugin with SITE_BINDING binding"
    - "Router pattern: createPluginRouter with 4 routes for pages/sections/loaders"
    - "Sidebar pattern: registerSidebarGroup with CMS label and 3 items"

key-files:
  created:
    - packages/bindings/src/well-known/site.ts
    - packages/mesh-plugin-site-editor/package.json
    - packages/mesh-plugin-site-editor/tsconfig.json
    - packages/mesh-plugin-site-editor/shared.ts
    - packages/mesh-plugin-site-editor/server/index.ts
    - packages/mesh-plugin-site-editor/server/tools/index.ts
    - packages/mesh-plugin-site-editor/client/index.tsx
    - packages/mesh-plugin-site-editor/client/lib/router.ts
    - packages/mesh-plugin-site-editor/client/components/pages-list.tsx
    - packages/mesh-plugin-site-editor/client/components/sections-list.tsx
    - packages/mesh-plugin-site-editor/client/components/loaders-list.tsx
    - packages/mesh-plugin-site-editor/client/components/plugin-header.tsx
    - packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx
  modified:
    - packages/bindings/src/index.ts
    - packages/bindings/package.json
    - apps/mesh/src/server-plugins.ts
    - apps/mesh/src/web/plugins.ts

key-decisions:
  - "Used File06, LayoutAlt03, Database01 icons from @untitledui/icons for Pages, Sections, Loaders sidebar items"
  - "Added ./site export to @decocms/bindings package.json for direct import path"
  - "Used Plugin type (with required setup) rather than ClientPlugin for site-editor since it has routes and sidebar"

patterns-established:
  - "SITE_BINDING: Binder array with READ_FILE, PUT_FILE, LIST_FILES tool binders following object-storage pattern"
  - "Plugin router: 4 routes (/, /pages/$pageId, /sections, /loaders) using createPluginRouter"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 1 Plan 1: Plugin Shell Summary

**SITE_BINDING well-known binding with site-editor plugin skeleton providing CMS sidebar (Pages, Sections, Loaders) and router with 4 routes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T12:17:12Z
- **Completed:** 2026-02-14T12:20:32Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- SITE_BINDING defined as well-known binding with READ_FILE, PUT_FILE, LIST_FILES tool binders
- mesh-plugin-site-editor package created with server and client entry points following existing plugin patterns
- Plugin registered in both Mesh server-plugins.ts and web/plugins.ts
- ClientPlugin declares SITE_BINDING and registers CMS sidebar group with Pages, Sections, Loaders items
- Router defines 4 routes (/, /pages/$pageId, /sections, /loaders) with lazy-loaded stub components

## Task Commits

Each task was committed atomically:

1. **Task 1: Define SITE_BINDING and create plugin package skeleton** - `6b5406563` (feat)
2. **Task 2: Implement ServerPlugin, ClientPlugin, and register in Mesh** - `ffe3137a5` (feat)

## Files Created/Modified
- `packages/bindings/src/well-known/site.ts` - SITE_BINDING definition with READ_FILE, PUT_FILE, LIST_FILES
- `packages/bindings/src/index.ts` - Re-exports for SITE_BINDING and related types
- `packages/bindings/package.json` - Added ./site export path
- `packages/mesh-plugin-site-editor/package.json` - Package manifest with server/client entry points
- `packages/mesh-plugin-site-editor/tsconfig.json` - TypeScript configuration
- `packages/mesh-plugin-site-editor/shared.ts` - PLUGIN_ID and PLUGIN_DESCRIPTION constants
- `packages/mesh-plugin-site-editor/server/index.ts` - ServerPlugin with empty tools array
- `packages/mesh-plugin-site-editor/server/tools/index.ts` - Empty tools placeholder
- `packages/mesh-plugin-site-editor/client/index.tsx` - ClientPlugin with SITE_BINDING, sidebar, routes
- `packages/mesh-plugin-site-editor/client/lib/router.ts` - Plugin router with 4 routes
- `packages/mesh-plugin-site-editor/client/components/pages-list.tsx` - Stub pages component
- `packages/mesh-plugin-site-editor/client/components/sections-list.tsx` - Stub sections component
- `packages/mesh-plugin-site-editor/client/components/loaders-list.tsx` - Stub loaders component
- `packages/mesh-plugin-site-editor/client/components/plugin-header.tsx` - Connection selector header
- `packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx` - Empty state UI
- `apps/mesh/src/server-plugins.ts` - Added siteEditorPlugin to server registry
- `apps/mesh/src/web/plugins.ts` - Added siteEditorPlugin to client registry

## Decisions Made
- Used `Plugin` type (with required `setup`) rather than `ClientPlugin` since the site-editor needs routes and sidebar registration
- Added `./site` export to `@decocms/bindings` package.json for clean import path (`@decocms/bindings/site`)
- Selected File06, LayoutAlt03, Database01 from @untitledui/icons for Pages, Sections, Loaders respectively
- Put peer dependencies (@tanstack/react-router, @tanstack/react-query, nanoid, react) in peerDependencies rather than dependencies

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plugin shell is complete with all entry points and registrations
- Ready for plan 01-02 (file listing) to implement actual page/section/loader data fetching
- Ready for plan 01-03 (server tools) to add CRUD tools to the ServerPlugin

## Self-Check: PASSED

All 13 created files verified. Both task commits (6b5406563, ffe3137a5) found in git log.

---
*Phase: 01-plugin-shell*
*Completed: 2026-02-14*
