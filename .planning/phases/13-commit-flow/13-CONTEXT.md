# Phase 13: Commit Flow - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Commit button to the editor toolbar that appears only when there are pending changes. Clicking it generates a commit message via Claude Haiku, shows an editable textarea for the user to review/tweak, then executes GIT_COMMIT on confirm. After commit, diff badges clear.

</domain>

<decisions>
## Implementation Decisions

### Commit button location
- In the **toolbar** (top of composer), next to Discard button — only visible/enabled when pending changes exist

### AI message flow
- Click Commit → AI generates message (Claude Haiku) → show editable textarea with generated message → user can edit → click Confirm → GIT_COMMIT executes
- User sees the message BEFORE committing and can change it

### AI model
- **Claude Haiku** via Anthropic SDK — already in the mesh stack, no new dependencies
- Use the diff (GIT_DIFF output) as context for message generation

### Post-commit
- After successful GIT_COMMIT: diff status badges clear (re-run GIT_STATUS → empty → no badges)
- Commit button hides/disables again

### Claude's Discretion
- Exact prompt sent to Haiku (should include the diff and ask for a conventional commit message)
- Loading state UI during Haiku call
- Error handling if Haiku call fails (allow manual message entry)
- Where the confirm modal/inline form appears

</decisions>

<specifics>
## Specific Ideas

- The Haiku prompt should produce something like "feat(pages): update hero section copy and add new CTA" style messages
- The textarea should be pre-filled with the AI message but fully editable

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-commit-flow*
*Context gathered: 2026-02-18*
