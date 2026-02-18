---
phase: 14-history-panel
plan: 02
subsystem: ui
tags: [react, git, revert, history, page-composer, site-editor]

# Dependency graph
requires:
  - phase: 14-01
    provides: PageHistory component, GitLogEntry, history-api.ts with getGitLog/getGitShow
  - phase: 11-git-tools
    provides: GIT_SHOW, PUT_FILE, GIT_COMMIT tools in site binding
provides:
  - revertToCommit(toolCaller, pageId, commitHash) function in history-api.ts
  - Revert button with inline confirmation on each PageHistory commit row
  - onRevert callback wired through PageComposer to close panel and invalidate queries
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "confirmingRevertHash + revertingHash dual-state for per-row confirmation and in-progress tracking"
    - "Graceful GIT_COMMIT degrade: success:true even when GIT_COMMIT throws, if PUT_FILE succeeded"
    - "Query invalidation (pages.detail + history.page) on successful revert for section list refresh"

key-files:
  created: []
  modified:
    - packages/mesh-plugin-site-editor/client/lib/history-api.ts
    - packages/mesh-plugin-site-editor/client/components/page-history.tsx
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx

key-decisions:
  - "revertToCommit calls GIT_SHOW directly (not cached getGitShow helper) to keep function self-contained"
  - "confirmingRevertHash cleared on every handlePreviewCommit call to avoid stale confirmation UI"
  - "Cancel button hidden when activelyReverting (revertingHash === entry.hash) per plan spec"
  - "handleRevert in PageComposer invalidates both pages.detail and history.page so commit list updates"

patterns-established:
  - "Inline two-step confirmation: button -> Are you sure? + Revert / Cancel row"
  - "revertToCommit returns { success, committedWithGit } — two-field result for toast branching"

requirements-completed:
  - HIST-03

# Metrics
duration: 7min
completed: 2026-02-18
---

# Phase 14 Plan 02: Revert Here — PUT_FILE + GIT_COMMIT + Section List Refresh Summary

**Revert action for history panel: GIT_SHOW + PUT_FILE + GIT_COMMIT with inline confirmation UI and automatic section list refresh**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-18T17:46:42Z
- **Completed:** 2026-02-18T17:53:40Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `revertToCommit()` to `history-api.ts`: reads content via GIT_SHOW, writes via PUT_FILE, commits via GIT_COMMIT with graceful degrade when GIT_COMMIT is unavailable
- Added per-commit "Revert here" button to `PageHistory` with two-step inline confirmation (button → "Are you sure? Revert / Cancel") and spinner during active revert
- Wired `onRevert` callback in `PageComposer` that closes the history panel and invalidates `pages.detail` + `history.page` queries so section list and history list both refresh

## Task Commits

Each task was committed atomically:

1. **Task 1: Add revertToCommit to history-api.ts** - `cf257e3cc` (feat)
2. **Task 2: Revert button + confirmation flow in PageHistory** - `35e6a0d16` (feat)
3. **Task 3: Wire onRevert callback in PageComposer** - `f256c52f2` (feat)

## Files Created/Modified

- `packages/mesh-plugin-site-editor/client/lib/history-api.ts` - Added `revertToCommit()` function; existing `revertPage` function unchanged
- `packages/mesh-plugin-site-editor/client/components/page-history.tsx` - Added `onRevert` prop, `confirmingRevertHash`/`revertingHash` state, `handleRevert` async handler, per-row Revert button with confirmation UI, `RefreshCcw01` icon import
- `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` - Added `handleRevert` callback (closes panel + invalidates queries), passed `onRevert={handleRevert}` to `<PageHistory>`

## Decisions Made

- `revertToCommit` calls `toolCaller("GIT_SHOW", ...)` directly rather than using the `getGitShow` helper — keeps the function self-contained and avoids extra null-handling indirection
- Confirmation state (`confirmingRevertHash`) is cleared in `handlePreviewCommit` so clicking Preview on any commit dismisses an open confirmation dialog
- The "Cancel" button is hidden when a revert is actively in progress (`revertingHash === entry.hash`) per plan specification, preventing redundant UI during the async call
- `handleRevert` in `PageComposer` invalidates both `queryKeys.pages.detail` and `queryKeys.history.page` — page detail brings section list current, history list shows the new revert commit at top

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 complete: history panel (list + preview) and revert action both implemented
- HIST-01, HIST-02, HIST-03 requirements fulfilled

## Self-Check: PASSED

- FOUND: packages/mesh-plugin-site-editor/client/lib/history-api.ts
- FOUND: packages/mesh-plugin-site-editor/client/components/page-history.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/page-composer.tsx
- FOUND: .planning/phases/14-history-panel/14-02-SUMMARY.md
- FOUND commit cf257e3cc (feat: add revertToCommit to history-api.ts)
- FOUND commit 35e6a0d16 (feat: Revert button + confirmation in PageHistory)
- FOUND commit f256c52f2 (feat: wire onRevert in PageComposer)

---
*Phase: 14-history-panel*
*Completed: 2026-02-18*
