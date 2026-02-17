---
phase: 05-publishing
plan: 02
subsystem: ui
tags: [version-history, diff-view, revert, site-binding, mcp-tools, react-query, timeline]

requires:
  - phase: 01-plugin-shell
    provides: "SITE_BINDING with READ_FILE/PUT_FILE/LIST_FILES, plugin header, usePluginContext"
  - phase: 05-publishing
    plan: 01
    provides: "SITE_BINDING with optional branch tools, branch-api pattern, query-keys pattern"
provides:
  - "SITE_BINDING extended with GET_FILE_HISTORY and READ_FILE_AT (optional tools)"
  - "Server tools CMS_FILE_HISTORY and CMS_FILE_READ_AT for AI access"
  - "Client history-api.ts with getFileHistory, readFileAt, revertPage"
  - "PageHistory component with vertical timeline, inline diff, and one-click revert"
  - "PageDiff component with structured property-level comparison"
  - "History panel integrated into page composer toolbar"
affects: [05-publishing, site-editor-plugin]

tech-stack:
  added: []
  patterns: ["Revert as read-old-content + PUT_FILE (non-destructive version creation)", "Structured page diff without external diff library"]

key-files:
  created:
    - packages/mesh-plugin-site-editor/server/tools/page-history.ts
    - packages/mesh-plugin-site-editor/client/lib/history-api.ts
    - packages/mesh-plugin-site-editor/client/components/page-history.tsx
    - packages/mesh-plugin-site-editor/client/components/page-diff.tsx
  modified:
    - packages/bindings/src/well-known/site.ts
    - packages/mesh-plugin-site-editor/server/tools/index.ts
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx

key-decisions:
  - "Revert implemented as read-old-content + PUT_FILE with updated timestamp, creating a new commit rather than destructive rollback"
  - "Property-level structured diff (scalar fields + block comparison by ID) instead of raw JSON diff or external library"
  - "History panel replaces right prop-editor panel via toggle button rather than adding a new route"

patterns-established:
  - "Revert pattern: read historical content via READ_FILE_AT, update metadata.updatedAt, write via PUT_FILE"
  - "Inline confirmation: toggle inline 'Are you sure? Revert / Cancel' instead of modal dialogs"

duration: 4min
completed: 2026-02-14
---

# Phase 5 Plan 2: Version History with Diff View and One-Click Revert Summary

**SITE_BINDING extended with GET_FILE_HISTORY and READ_FILE_AT, page history timeline with property-level diff view and non-destructive one-click revert via PUT_FILE**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T14:31:38Z
- **Completed:** 2026-02-14T14:36:18Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extended SITE_BINDING with GET_FILE_HISTORY and READ_FILE_AT as optional tool binders (9 total)
- Created server tools CMS_FILE_HISTORY and CMS_FILE_READ_AT proxying to MCP
- Built client history-api.ts with getFileHistory, readFileAt, and revertPage helpers
- Built PageHistory component with vertical timeline, relative timestamps, author, message, and inline revert confirmation
- Built PageDiff component with structured property-level comparison (scalar fields, block added/removed/modified)
- Integrated history panel into page composer as a right-panel toggle via Clock icon button

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend SITE_BINDING with history tools and create server tools + client API** - `9a74804bc` (feat)
2. **Task 2: Build page history panel with diff view and integrate into page editor** - `d1d382337` (feat)

## Files Created/Modified
- `packages/bindings/src/well-known/site.ts` - Added GET_FILE_HISTORY and READ_FILE_AT optional tool binders
- `packages/mesh-plugin-site-editor/server/tools/page-history.ts` - CMS_FILE_HISTORY and CMS_FILE_READ_AT server tools
- `packages/mesh-plugin-site-editor/server/tools/index.ts` - Registered 2 new history tools (18 total)
- `packages/mesh-plugin-site-editor/client/lib/history-api.ts` - Client helpers for file history, read-at, and revert
- `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` - Added history.page and history.diff query key groups
- `packages/mesh-plugin-site-editor/client/components/page-history.tsx` - Version history timeline panel
- `packages/mesh-plugin-site-editor/client/components/page-diff.tsx` - Structured property-level diff view
- `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` - Added Clock toggle and PageHistory integration

## Decisions Made
- Revert implemented as read-old-content + PUT_FILE with updated `metadata.updatedAt`. This creates a new commit in the underlying MCP rather than destructively rolling back, preserving the full history chain.
- Used structured property-level diff (comparing scalar fields like title/path and blocks by ID) instead of raw JSON diff or an external diff library. The page JSON is shallow enough that custom comparison provides a more readable output.
- History panel integrated as a right-panel toggle in the page composer rather than a separate route. Clicking the Clock icon replaces the prop editor; clicking again restores it.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Version history and revert capabilities ready for end-to-end testing when MCP supports GET_FILE_HISTORY and READ_FILE_AT tools
- All 05-publishing plans (01, 02, 03) now complete

## Self-Check: PASSED

All 8 files verified on disk. Both commit hashes (9a74804bc, d1d382337) found in git log. SUMMARY.md exists.

---
*Phase: 05-publishing*
*Completed: 2026-02-14*
