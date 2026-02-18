---
phase: 12-pending-changes-ui
plan: 01
subsystem: ui
tags: [react, tanstack-query, git, site-editor, diff-badges, useQuery]

# Dependency graph
requires:
  - phase: 11-git-site-binding-tools
    provides: GIT_STATUS, GIT_SHOW, GIT_CHECKOUT tool definitions in SITE_BINDING

provides:
  - pending-changes-api.ts with getGitStatus/getCommittedPage/discardPageChanges helpers
  - usePendingChanges hook computing per-section new/edited/deleted diff status
  - SectionListSidebar diff badges and deleted ghost rows with Undelete button
  - PageComposer Discard Changes toolbar button and handleUndelete support

affects: [13-commit-flow, 14-history-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pendingChanges query key invalidated after every save to keep badges current"
    - "computeSectionStatuses pure function: no side effects, compares by block id + JSON.stringify(props)"
    - "enabled: isDirty guard on GIT_SHOW query avoids unnecessary tool calls when clean"
    - "Ghost rows rendered outside SortableContext (non-draggable) below live section list"

key-files:
  created:
    - packages/mesh-plugin-site-editor/client/lib/pending-changes-api.ts
    - packages/mesh-plugin-site-editor/client/lib/use-pending-changes.ts
  modified:
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts
    - packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx

key-decisions:
  - "XCircle icon sourced from @untitledui/icons (not lucide-react) — page-composer uses @untitledui/icons throughout"
  - "isDirty derived from fileStatus.unstaged != null || fileStatus.staged != null (not untracked check per plan draft) for correctness"
  - "computeSectionStatuses returns empty array when not dirty — no badges shown for clean pages"

patterns-established:
  - "Pending changes API follows branch-api.ts / history-api.ts pattern: plain async, try/catch returning null"
  - "Two-query pattern: status query always enabled, committed-blocks query enabled:isDirty"

requirements-completed: [DIFF-01, DIFF-02, DIFF-03, DIFF-04, DIFF-05]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 12 Plan 01: Pending Changes UI Summary

**Git-aware section diff badges (new/edited/deleted) in the page composer sidebar, with Discard Changes toolbar button and Undelete ghost rows for deleted sections**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T16:44:45Z
- **Completed:** 2026-02-18T16:48:51Z
- **Tasks:** 5
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Created `pending-changes-api.ts` with three gracefully-degrading async helpers wrapping GIT_STATUS, GIT_SHOW, and GIT_CHECKOUT
- Created `usePendingChanges` hook using two chained `useQuery` calls: status check always runs, committed-page fetch only when `isDirty`
- Augmented `SectionListSidebar` with colored diff badges (green=new, yellow=edited) and deleted ghost rows with Undelete button
- Wired `PageComposer` to call `usePendingChanges`, show a Discard Changes button in the toolbar when `gitIsDirty`, and handle `handleUndelete`/`handleDiscard` actions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pending-changes-api.ts** - `8ca280717` (feat)
2. **Task 2: Add pendingChanges query key** - `d5b21211f` (feat)
3. **Task 3: Create usePendingChanges hook** - `4a0c4d268` (feat)
4. **Task 4: Augment SectionListSidebar** - `bf2322ab1` (feat)
5. **Task 5: Wire PageComposer** - `482c6998b` (feat)

## Files Created/Modified

- `packages/mesh-plugin-site-editor/client/lib/pending-changes-api.ts` - getGitStatus, getCommittedPage, discardPageChanges helpers
- `packages/mesh-plugin-site-editor/client/lib/use-pending-changes.ts` - usePendingChanges hook with computeSectionStatuses pure function
- `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` - Added pendingChanges.page(connectionId, pageId) key
- `packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx` - Diff badge support, DeletedSectionGhostRow component, sectionStatuses/onUndelete props
- `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` - usePendingChanges wired, Discard Changes button, handleDiscard, handleUndelete, pendingChanges invalidation after saves

## Decisions Made

- `XCircle` icon imported from `@untitledui/icons` (not `lucide-react`) — PageComposer uses `@untitledui/icons` throughout and `XCircle` is available there
- `isDirty` derived as `fileStatus != null && (fileStatus.unstaged != null || fileStatus.staged != null)` — covers modified, added, and deleted working-tree states
- Empty state check in `SectionListSidebar` now also checks `deletedStatuses.length` so ghost-only pages don't show the empty "No sections yet" state

## Deviations from Plan

None - plan executed exactly as written, with one minor implementation detail clarified (XCircle icon source).

## Issues Encountered

None - TypeScript type checking passed cleanly with `tsc --noEmit` on the site editor package.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 13 (Commit Flow) can begin: the diff badges give users visual confirmation of what will be committed
- `discardPageChanges` helper can be reused by the commit flow UI
- `queryKeys.pendingChanges.page` key is available for Phase 13 to invalidate after committing

---
*Phase: 12-pending-changes-ui*
*Completed: 2026-02-18*
