---
phase: 04-loaders
plan: 02
subsystem: ui
tags: [react-query, loader-ui, prop-binding, dialog, rjsf, loaders]

requires:
  - phase: 04-loaders
    provides: "Loader server tools, client API (listLoaders/getLoader), query keys, LoaderDefinition types"
  - phase: 03-visual-editor
    provides: "Page composer, PropEditor, block-picker dialog pattern, applyPageUpdate flow"
provides:
  - "Loaders list view with category grouping and detail navigation"
  - "Loader detail view with metadata, output schema, and PropEditor for input params"
  - "LoaderPicker modal for binding a loader to a section prop"
  - "LoaderRef type and isLoaderRef guard in page-api"
  - "Page composer integration for loader binding into prop editing flow"
  - "/loaders/$loaderId route in plugin router"
affects: [05-preview, runtime-loader-resolution, loader-execution]

tech-stack:
  added: []
  patterns:
    - "LoaderRef with __loaderRef sentinel key for prop-to-loader binding"
    - "Loader picker follows block-picker Dialog pattern exactly"
    - "Loader binding inline in page composer right panel below PropEditor"

key-files:
  created:
    - packages/mesh-plugin-site-editor/client/components/loaders-list.tsx
    - packages/mesh-plugin-site-editor/client/components/loader-detail.tsx
    - packages/mesh-plugin-site-editor/client/components/loader-picker.tsx
  modified:
    - packages/mesh-plugin-site-editor/client/lib/router.ts
    - packages/mesh-plugin-site-editor/client/lib/page-api.ts
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx

key-decisions:
  - "LoaderRef stored directly in BlockInstance.props with __loaderRef sentinel -- @rjsf sees it as nested object for now"
  - "Loader binding UI placed below PropEditor in right panel rather than inline per-field widget"
  - "Loader detail view is browse-only (no save button) -- actual param config happens at binding time"

patterns-established:
  - "LoaderRef type with __loaderRef, field?, params? for loader-to-prop binding"
  - "isLoaderRef type guard for detecting loader bindings in props"
  - "Loader picker modal reuses Dialog/query pattern from block-picker"

duration: 3min
completed: 2026-02-14
---

# Phase 4 Plan 2: Loader UI and Prop Binding Summary

**Categorized loader browser, detail view with PropEditor, and loader-to-section-prop binding via picker modal in page composer**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T14:05:13Z
- **Completed:** 2026-02-14T14:08:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Full loaders list with category grouping, loading/error/empty states, and navigation to detail view
- Loader detail view showing metadata (scan method, timestamps, type names), collapsible output/input schemas, and PropEditor for input parameters
- LoaderPicker modal with search filtering and category grouping, creating LoaderRef on selection
- Page composer integration showing existing loader bindings with remove, and "Bind loader to {prop}" links for each schema property

## Task Commits

Each task was committed atomically:

1. **Task 1: Loaders list and detail views** - `6bf04b06e` (feat)
2. **Task 2: Loader picker and prop binding** - `b71a254bd` (feat)

## Files Created/Modified
- `client/components/loaders-list.tsx` - Full loader browser with category grouping, Database icon, params badge
- `client/components/loader-detail.tsx` - Loader metadata, output schema, PropEditor for input params
- `client/components/loader-picker.tsx` - Dialog modal for selecting a loader to bind to a section prop
- `client/lib/router.ts` - Added /loaders/$loaderId route
- `client/lib/page-api.ts` - Added LoaderRef interface and isLoaderRef type guard
- `client/components/page-composer.tsx` - Integrated loader binding UI and LoaderPicker modal

## Decisions Made
- LoaderRef is stored directly as a prop value in BlockInstance.props. The @rjsf form will see __loaderRef objects as nested data -- acceptable for now, a custom widget for rendering loader bindings is a future enhancement.
- Loader binding UI is placed as a section below the PropEditor rather than as inline per-field widgets -- simpler implementation that satisfies the "bind loader to prop" requirement.
- Loader detail view is browse-only with no save button -- parameter configuration for actual use happens when binding via the picker in page composer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 4 (Loaders) fully complete -- both infrastructure (04-01) and UI (04-02) done
- LoaderRef bindings stored in page JSON, ready for runtime resolution in Phase 5
- All loader UI components follow established patterns (usePluginContext, useQuery, ref-based sync, no useEffect)

## Self-Check: PASSED

All 6 files verified present. Both task commits (6bf04b06e, b71a254bd) confirmed in git log.

---
*Phase: 04-loaders*
*Completed: 2026-02-14*
