# Requirements: deco.cx v2

**Defined:** 2026-02-14
**Core Value:** Any TypeScript site gets a production-grade CMS with visual editing and resilient data in minutes

## v1.2 Requirements

### Pending Changes

- [ ] **DIFF-01**: User can see deleted sections (removed from page but not committed) in the section list as greyed-out with a "(deleted)" indicator
- [ ] **DIFF-02**: User can see newly added sections (on page but not committed) with a "(new)" badge in the section list
- [ ] **DIFF-03**: User can see modified sections (props changed but not committed) with an "(edited)" indicator in the section list
- [ ] **DIFF-04**: User can restore a deleted section before committing by clicking "Undelete", which removes the deletion from the working tree
- [ ] **DIFF-05**: User can discard all pending changes to a page via a "Discard changes" action that runs git checkout on the page file

### Commit

- [ ] **COMMIT-01**: User can commit all pending page changes via an explicit Commit button in the editor toolbar (no auto-commit)
- [ ] **COMMIT-02**: The CMS auto-generates a commit message describing the changes using a cheap AI model (Gemini Flash or equivalent)
- [ ] **COMMIT-03**: The commit creates a real git commit in the connected site's repository with the AI-generated message

### History

- [ ] **HIST-01**: User can open a history panel for the current page showing a list of git commits that touched that page's JSON file
- [ ] **HIST-02**: User can click any commit in the history to load that version of the page into the iframe preview for inspection
- [ ] **HIST-03**: User can click "Revert here" on any historical version to restore that page state — this writes the historical JSON to disk (triggering auto-save and live preview update) and creates a new git commit on top, preserving the full history

## v2 Requirements

### Commit UX

- **COMMIT-04**: User can edit the AI-generated commit message before confirming
- **COMMIT-05**: Commit panel shows a diff summary (N sections changed, N props edited) before confirming

### History

- **HIST-04**: History panel shows a visual diff of what changed between adjacent commits
- **HIST-05**: User can compare any two commits side-by-side in the preview

## Out of Scope

| Feature | Reason |
|---------|--------|
| Branch management | Creating/switching branches is out of scope — git checkout/commit on current branch only |
| Push to remote | Pushing to GitHub/GitLab is out of scope — local git operations only for v1.2 |
| Conflict resolution | Merge conflicts are out of scope — single-user editing assumed |
| Staging individual props | Per-prop staging is too granular — page-level granularity is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIFF-01 | — | Pending |
| DIFF-02 | — | Pending |
| DIFF-03 | — | Pending |
| DIFF-04 | — | Pending |
| DIFF-05 | — | Pending |
| COMMIT-01 | — | Pending |
| COMMIT-02 | — | Pending |
| COMMIT-03 | — | Pending |
| HIST-01 | — | Pending |
| HIST-02 | — | Pending |
| HIST-03 | — | Pending |

**Coverage:**
- v1.2 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-18 after v1.2 milestone start*
