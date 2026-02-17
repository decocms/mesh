---
phase: 08-loaders-page
plan: 01
subsystem: ui
tags: [react, tanstack-query, table, collapsible, schema-tree, prop-editor]

# Dependency graph
requires:
  - phase: 07-sections-page
    provides: "SchemaTree component, table-rows with collapsible categories pattern, selfClient scan trigger pattern"
provides:
  - "Table-rows loaders list with collapsible categories, connected sections column, CMS_LOADER_SCAN trigger"
  - "Two-column loader detail with SchemaTree left, readonly PropEditor right, connected sections badge"
  - "computeLoaderSectionMap helper for cross-referencing pages to find loader consumers"
  - "sectionMap query key for caching connected sections data"
affects: [09-preview-bridge, 10-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Connected sections map via page/block cross-reference with LoaderRef detection"
    - "useQuery select option for extracting specific loader's sections from shared sectionMap cache"

key-files:
  created: []
  modified:
    - "packages/mesh-plugin-site-editor/client/lib/loader-api.ts"
    - "packages/mesh-plugin-site-editor/client/lib/query-keys.ts"
    - "packages/mesh-plugin-site-editor/client/components/loaders-list.tsx"
    - "packages/mesh-plugin-site-editor/client/components/loader-detail.tsx"

key-decisions:
  - "Reuse sectionMap query key across list and detail views for cache sharing"
  - "Use select option in useQuery for detail view to extract specific loader sections from shared map"
  - "Connected sections derived from page blocks at query time, not stored in loader definitions"

patterns-established:
  - "Cross-reference pattern: walk all pages/blocks to find LoaderRef consumers for a given loader"
  - "Section name derivation from blockType: strip sections-- prefix, replace -- with /"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 08 Plan 01: Loaders Page Summary

**Table-rows loaders list with collapsible categories, connected sections column, CMS_LOADER_SCAN trigger, and two-column detail with SchemaTree and readonly PropEditor**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T11:00:47Z
- **Completed:** 2026-02-16T11:03:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Loaders list upgraded from card-based layout to dense table-rows with collapsible categories matching sections page
- Connected sections column shows which sections consume each loader (first 2 names + "+N more" truncation)
- CMS_LOADER_SCAN trigger wired via selfClient with toast feedback and query invalidation
- Loader detail rewritten to two-column layout: SchemaTree for outputSchema, readonly PropEditor for inputSchema
- Expandable connected sections badge in loader detail metadata bar

## Task Commits

Each task was committed atomically:

1. **Task 1: Add connected sections helper and query key** - `c42d39749` (feat)
2. **Task 2: Rewrite loaders-list.tsx and loader-detail.tsx** - `8482eadff` (feat)

## Files Created/Modified
- `packages/mesh-plugin-site-editor/client/lib/loader-api.ts` - Added computeLoaderSectionMap() for cross-referencing pages to find loader consumers
- `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` - Added sectionMap query key under loaders
- `packages/mesh-plugin-site-editor/client/components/loaders-list.tsx` - Full rewrite: table-rows, collapsible categories, 4 columns, scan trigger, connected sections
- `packages/mesh-plugin-site-editor/client/components/loader-detail.tsx` - Full rewrite: two-column layout, SchemaTree, readonly PropEditor, connected sections badge

## Decisions Made
- Reuse sectionMap query key across list and detail views for cache sharing (detail uses `select` to extract specific loader's sections)
- Connected sections derived from page blocks at query time rather than stored in loader definitions
- Section name derived from blockType by stripping "sections--" prefix and replacing "--" with "/"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Loaders page complete with same quality as sections page
- Phase 08 has only 1 plan, so phase is complete
- Ready for Phase 09 (preview bridge) or Phase 10 (validation)

## Self-Check: PASSED

- All 4 modified files exist on disk
- Commit c42d39749 (Task 1) found in git log
- Commit 8482eadff (Task 2) found in git log

---
*Phase: 08-loaders-page*
*Completed: 2026-02-16*
