# Phase 12: Pending Changes UI - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Augment the existing section list in the page composer to show git diff status badges (new/edited/deleted) by calling GIT_STATUS on the current page file. Add Undelete and Discard Changes actions. No commit UI — that's Phase 13.

</domain>

<decisions>
## Implementation Decisions

### Discard changes button location
- Lives in the **toolbar** (top of composer, same row as Save) — always visible when working tree is dirty

### Diff badge display
- Deleted sections: greyed-out in the section list with a "(deleted)" indicator, with an "Undelete" button
- New sections (untracked file or new section in JSON): "(new)" badge
- Modified sections (props changed): "(edited)" indicator

### Claude's Discretion
- Exact badge styling (color, position relative to section name)
- Polling interval for GIT_STATUS (or trigger on save)
- How to correlate git diff output to individual sections in the JSON (section id matching)
- Whether to use GIT_STATUS alone or GIT_STATUS + GIT_DIFF for section-level granularity
- Empty state (no pending changes): toolbar button hidden or disabled

</decisions>

<specifics>
## Specific Ideas

- The section list already exists in the composer sidebar — badges augment existing entries, not a new UI
- GIT_CHECKOUT with force:true on the page file path = discard all changes for that page

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-pending-changes-ui*
*Context gathered: 2026-02-18*
