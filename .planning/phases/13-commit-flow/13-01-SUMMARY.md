---
phase: 13-commit-flow
plan: 01
subsystem: ui
tags: [react, hono, anthropic, git, site-editor, commit-flow]

# Dependency graph
requires:
  - phase: 12-pending-changes-ui
    provides: usePendingChanges hook, isDirty flag, pendingChanges query key pattern

provides:
  - CommitDialog inline component (generating/editing/committing states)
  - git-api.ts client helpers (getDiff, gitCommit, generateCommitMessage)
  - POST /api/plugins/site-editor/commit-message server route calling Claude Haiku
  - Commit button in PageComposer toolbar wired to full flow
affects:
  - 14-history-panel (git tooling patterns, toolbar layout)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server-side Anthropic API call via raw fetch (no @ai-sdk/anthropic dep)
    - HonoApp type extracted from ServerPlugin['routes'] to avoid direct hono dep in plugin
    - key-based CommitDialog remount pattern replaces useEffect for message sync

key-files:
  created:
    - packages/mesh-plugin-site-editor/client/lib/git-api.ts
    - packages/mesh-plugin-site-editor/client/components/commit-dialog.tsx
    - packages/mesh-plugin-site-editor/server/tools/commit-message.ts
  modified:
    - packages/mesh-plugin-site-editor/server/index.ts
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx

key-decisions:
  - "Anthropic API called via direct fetch on server side (no @ai-sdk/anthropic needed)"
  - "HonoApp type extracted from ServerPlugin['routes'] parameter type to avoid direct hono dep"
  - "CommitDialog uses key-based remount pattern when transitioning generating->editing to sync textarea"
  - "Commit + Discard buttons both hidden during CommitDialog to avoid conflicting actions"

patterns-established:
  - "Server routes in ServerPlugin.routes registered via registerXxxRoute(app, ctx) helpers"
  - "Client git helpers in lib/git-api.ts follow same graceful-null pattern as branch-api.ts"

requirements-completed:
  - COMMIT-01
  - COMMIT-02
  - COMMIT-03

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 13 Plan 01: Commit Flow Summary

**Inline commit flow with Claude Haiku message generation: Commit button in toolbar calls GIT_DIFF, POSTs to server-side Anthropic route, shows editable textarea, then GIT_COMMIT on confirm**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-18T16:56:21Z
- **Completed:** 2026-02-18T17:11:44Z
- **Tasks:** 6
- **Files modified:** 5

## Accomplishments
- `git-api.ts` client helpers: `getDiff()`, `gitCommit()`, `generateCommitMessage()` — all gracefully return null on failure
- `POST /api/plugins/site-editor/commit-message` server route calls Claude Haiku via raw fetch — falls back to empty string without ANTHROPIC_API_KEY
- `CommitDialog` inline component with three states: generating (spinner), editing (editable textarea + Commit/Cancel), committing (button spinner)
- PageComposer toolbar updated: Commit button appears alongside Discard when `gitIsDirty`; clicking it runs the full AI generation → confirm → commit → invalidate flow

## Task Commits

Each task was committed atomically:

1. **Tasks 1 & 2: git-api.ts client helpers** - `d8f4766cf` (feat)
2. **Task 3: commit-message server route** - `8310eac3e` (feat)
3. **Task 4: register route in server/index.ts** - `9bac9b69d` (feat)
4. **Task 5: CommitDialog component** - `1e66b923c` (feat)
5. **Task 6: PageComposer wire-up + hono type fix** - `b245eb7a7` (feat)

## Files Created/Modified
- `packages/mesh-plugin-site-editor/client/lib/git-api.ts` - getDiff, gitCommit, generateCommitMessage helpers
- `packages/mesh-plugin-site-editor/client/components/commit-dialog.tsx` - Inline commit dialog component
- `packages/mesh-plugin-site-editor/server/tools/commit-message.ts` - Server route for Haiku message generation
- `packages/mesh-plugin-site-editor/server/index.ts` - Added routes property to serverPlugin
- `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` - CommitState, handlers, toolbar changes

## Decisions Made
- Used raw `fetch` to call Anthropic API on the server side — no `@ai-sdk/anthropic` needed, no new npm packages
- Extracted `HonoApp` type from `ServerPlugin['routes']` parameter to avoid a direct `hono` import in the plugin (hono is only a devDependency of `@decocms/bindings`)
- Used key-based CommitDialog remount when transitioning `generating` → `editing` to initialize textarea state without `useEffect`
- Both Commit and Discard buttons hidden when CommitDialog is shown to avoid conflicting UI states

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `hono` direct import causing TypeScript error**
- **Found during:** Task 3 (commit-message.ts creation) / verified at Task 6
- **Issue:** `import type { Hono } from "hono"` fails because `hono` is not a direct dependency of `mesh-plugin-site-editor` (only a devDep of `@decocms/bindings`)
- **Fix:** Extracted `HonoApp` type from `ServerPlugin['routes']` parameter type: `type HonoApp = NonNullable<Parameters<NonNullable<ServerPlugin["routes"]>>[0]>`; also changed `c.req.json<T>()` to `(await c.req.json()) as T` (untyped generic not accepted without hono types)
- **Files modified:** `packages/mesh-plugin-site-editor/server/tools/commit-message.ts`
- **Verification:** `bun tsc --noEmit` passes with zero errors
- **Committed in:** `b245eb7a7` (Task 6 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type error in commit-message.ts)
**Impact on plan:** Required for TypeScript correctness. No scope creep, no behavioral change.

## Issues Encountered
- A pre-existing staged change to `page-composer.tsx` (from Phase 14 work) was included in the Task 5 commit. This is harmless — the change passes `send` and `localPage` to `PageHistory`, which is correct Phase 14 work already authored.

## User Setup Required
Optional: Set `ANTHROPIC_API_KEY` environment variable in the Mesh server to enable Claude Haiku commit message generation. Without it, the route returns `{ message: "" }` and the textarea appears empty for manual entry.

## Next Phase Readiness
- Phase 14 (history panel) can proceed — `PageHistory` component and `history-api.ts` helpers are already in place
- The git tooling pattern (client helpers in `lib/git-api.ts`, optional tool calls via toolCaller) is established

## Self-Check: PASSED

All created files confirmed on disk. All task commits verified in git log.

---
*Phase: 13-commit-flow*
*Completed: 2026-02-18*
