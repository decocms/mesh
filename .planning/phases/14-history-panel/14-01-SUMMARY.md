---
phase: 14-history-panel
plan: 01
subsystem: ui
tags: [react, git, iframe, history, page-composer, site-editor]

# Dependency graph
requires:
  - phase: 11-git-tools
    provides: GIT_LOG and GIT_SHOW tools in the local-fs MCP site binding
provides:
  - GIT_LOG/GIT_SHOW history-api.ts helpers (getGitLog, getGitShow, GitLogEntry)
  - PageHistory component with iframe preview of historical versions
  - History panel integrated into PageComposer right panel
affects: [14-02-revert-action]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "handlePreviewCommit: fetch GIT_SHOW then send deco:page-config to iframe"
    - "Amber banner pattern for historical/read-only preview mode"
    - "previewingHash + loadingHash dual-state pattern for per-row loading"

key-files:
  created: []
  modified:
    - packages/mesh-plugin-site-editor/client/lib/history-api.ts
    - packages/mesh-plugin-site-editor/client/components/page-history.tsx
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx

key-decisions:
  - "getGitLog and getGitShow added alongside existing getFileHistory/readFileAt — no removal"
  - "previewingHash tracks which commit is previewed; loadingHash tracks per-row fetch"
  - "Amber banner used for historical version indicator to signal read-only mode"
  - "PageHistory receives send + localPage from PageComposer for iframe bridge access"

patterns-established:
  - "GitLogEntry interface: hash (full), author, date (ISO), message"
  - "handleBackToCurrent: re-send localPage then clear previewingHash"

requirements-completed:
  - HIST-01
  - HIST-02

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 14 Plan 01: History Panel UI Summary

**Git commit history panel with click-to-preview: GIT_LOG commit list in right panel + GIT_SHOW iframe preview via deco:page-config bridge**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T16:56:19Z
- **Completed:** 2026-02-18T16:59:30Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `getGitLog()` and `getGitShow()` helpers to `history-api.ts` alongside existing functions
- Rewrote `PageHistory` component to show git commit list (hash, relative date, message) with iframe preview on click
- Connected `PageHistory` to `PageComposer`'s iframe bridge by passing `send` and `localPage` props

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GIT_LOG and GIT_SHOW helpers** - `dec19d548` (feat)
2. **Task 2: Rewrite PageHistory with iframe preview** - `b7a0773ba` (feat)
3. **Task 3: Pass send and localPage to PageHistory** - `1e66b923c` (feat)

## Files Created/Modified

- `packages/mesh-plugin-site-editor/client/lib/history-api.ts` - Added `GitLogEntry` interface, `getGitLog()`, `getGitShow()` helpers
- `packages/mesh-plugin-site-editor/client/components/page-history.tsx` - Full rewrite: GIT_LOG commit list, click-to-preview via iframe, amber "Viewing" banner with "Back to current"
- `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` - Pass `send` and `localPage` props to `<PageHistory>`

## Decisions Made

- Kept existing `getFileHistory`/`readFileAt`/`revertPage` functions intact — they may be used elsewhere and removal is not in scope
- Used dual state (`previewingHash` + `loadingHash`) to support per-row loading spinner while preventing concurrent fetches
- Amber color scheme for the "Viewing historical version" banner to visually indicate read-only preview mode

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- History panel UI complete and wired to iframe bridge
- Plan 14-02 (Revert action) can execute: `revertPage` in `history-api.ts` is already present and `PageHistory` has a clear extension point to add a "Revert here" button per commit entry

---
*Phase: 14-history-panel*
*Completed: 2026-02-18*
