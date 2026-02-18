# Phase 14: History Panel - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a history panel that shows the git commit log for the current page file. User can click a commit to preview that historical version in the iframe. User can "Revert here" to restore that version as the current state. No diff view between commits — that's out of scope.

</domain>

<decisions>
## Implementation Decisions

### Panel location
- Opens in the **right-side detail panel** (the panel that already shows block/section details) — not the section list sidebar, not an overlay
- Accessible via a "History" button/tab in the composer toolbar or detail panel header

### Commit list display
- Shows: commit hash (short, 7 chars), date (relative e.g. "2 hours ago"), commit message
- Chronological, most recent first
- Sourced from GIT_LOG for the current page's JSON file path

### Historical preview
- Clicking a commit loads that page JSON via GIT_SHOW and sends it to the iframe preview
- The iframe shows the historical version (read-only inspection mode)
- A "Back to current" button returns to live editing mode

### Revert here
- Writes the historical JSON to disk via PUT_FILE (existing tool)
- Then calls GIT_COMMIT with a generated revert message (e.g. "revert: restore page to [short hash]")
- After commit: section list refreshes, diff badges clear (the revert is now the committed state)

### Claude's Discretion
- Exact UI for the History button to open the panel
- Pagination / load more for long histories (default 50 from GIT_LOG is fine for now)
- Loading state while fetching GIT_LOG
- How to indicate which commit is "current HEAD"

</decisions>

<specifics>
## Specific Ideas

- The right-side detail panel is already used for block/section details — History replaces that content when open
- Short hash display (7 chars) keeps the list readable

</specifics>

<deferred>
## Deferred Ideas

- Visual diff between commits — out of scope for now
- Side-by-side comparison of two commits — out of scope

</deferred>

---

*Phase: 14-history-panel*
*Context gathered: 2026-02-18*
