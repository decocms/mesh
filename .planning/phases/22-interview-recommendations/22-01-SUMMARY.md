---
phase: 22-interview-recommendations
plan: "01"
subsystem: ui
tags: [react, tanstack-router, ai-sdk, hono, interview, onboarding]

requires:
  - phase: 21-auth-handoff
    provides: onboard-setup claim flow, diagnostic token, org creation/join
  - phase: 19-diagnostic-engine
    provides: diagnostic session storage with updateResults method
  - phase: 20-public-report-ui
    provides: diagnostic session API endpoint at /api/diagnostic/session/:token

provides:
  - Post-login /onboard-interview page with 3-question chat interview via decopilot stream
  - POST /api/onboarding/interview-results endpoint that persists goals/challenges/priorities
  - Redirect from onboard-setup claim success to /onboard-interview (instead of org dashboard)
  - onboardInterviewRoute registered in TanStack Router as public route

affects:
  - 22-02-recommendations (reads interviewResults from diagnostic session)
  - 22-03-hire-flow (navigates to /onboard-interview?step=recommendations after interview)

tech-stack:
  added: []
  patterns:
    - Self-contained decopilot chat using DefaultChatTransport directly (no ChatProvider) — skips Virtual MCP selection, thread management, model selection UI
    - Inline transport creation with prepareSendMessagesRequest for system prompt injection
    - ChatOnFinishCallback receives { message, messages, ... } not just message
    - INTERVIEW_COMPLETE marker + JSON payload in assistant response for structured data extraction

key-files:
  created:
    - apps/mesh/src/web/routes/onboard-interview.tsx
  modified:
    - apps/mesh/src/api/routes/onboarding.ts
    - apps/mesh/src/web/routes/onboard-setup.tsx
    - apps/mesh/src/web/index.tsx
    - apps/mesh/src/web/lib/query-keys.ts

key-decisions:
  - "Interview chat uses DefaultChatTransport directly (not ChatProvider) — avoids Virtual MCP selection, thread management, and model selection UI complexity"
  - "Interview system prompt uses INTERVIEW_COMPLETE marker followed by JSON for reliable structured extraction from LLM response"
  - "First user message seeds diagnostic context to LLM — user triggers it via Start interview button rather than auto-sending on mount (avoids useEffect, React 19 compliant)"
  - "decopilot agent ID constructed as decopilot_${activeOrgId} using session.data.session.activeOrganizationId — same pattern as getDecopilotId()"
  - "interviewResults stored in diagnostic session via sessionStorage.updateResults() with 'interviewResults' key — extends DiagnosticResult without schema migration"
  - "noUncheckedIndexedAccess requires explicit undefined guard before destructuring entries[0]"

patterns-established:
  - "OnboardInterviewPage: conditional guards at top (unauthenticated, missing params), then queries, then derived values, then event handlers, then renders — same pattern as OnboardSetupPage"

requirements-completed: [INTV-01, INTV-02, INTV-03]

duration: 7min
completed: 2026-02-25
---

# Phase 22 Plan 01: Interview Page + Decopilot Chat Integration Summary

**Self-contained 3-question onboarding interview at /onboard-interview using decopilot stream directly, with structured [INTERVIEW_COMPLETE] detection and persistence to diagnostic session**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-25T12:35:52Z
- **Completed:** 2026-02-25T12:42:52Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments

- Created `/onboard-interview` page with full chat UI (assistant messages left-aligned, user messages right-aligned, typing indicator, send-on-Enter)
- Connected interview to decopilot stream endpoint via `DefaultChatTransport` with structured onboarding system prompt injected per message
- Added `POST /api/onboarding/interview-results` endpoint that validates, authenticates, and persists interview results to diagnostic session
- Updated `onboard-setup.tsx` claim redirect to `/onboard-interview?org=...&token=...` so users flow directly to the interview
- Registered `onboardInterviewRoute` in TanStack Router with `org`, `token`, and `step` search params

## Task Commits

1. **Task 1: Interview page + onboarding system prompt + completion persistence** - `a11e107d6` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/mesh/src/web/routes/onboard-interview.tsx` - Post-login interview page with decopilot chat, completion detection, and result persistence (674 lines)
- `apps/mesh/src/api/routes/onboarding.ts` - Added POST /interview-results endpoint with auth check, session verification, and result persistence
- `apps/mesh/src/web/routes/onboard-setup.tsx` - Changed claim success redirect to /onboard-interview instead of org dashboard
- `apps/mesh/src/web/index.tsx` - Registered onboardInterviewRoute as public route
- `apps/mesh/src/web/lib/query-keys.ts` - Added interviewModels query key

## Decisions Made

- Used `DefaultChatTransport` directly instead of ChatProvider — the interview is self-contained and doesn't need thread management, Virtual MCP selection, or model picker UI. Much simpler.
- Structured the LLM output with `[INTERVIEW_COMPLETE]` marker followed by JSON — reliable extraction without requiring function calling or tool use.
- User triggers the first message via "Start interview" button instead of auto-sending on mount — React 19 compatible (no useEffect), gives the user a moment to prepare.
- Interview results are stored in the diagnostic session's `results` JSON using the existing `updateResults()` method with key `interviewResults` — no DB migration needed.
- Added `noUncheckedIndexedAccess` guard: check `entries[0]` for undefined before destructuring, even after length check.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `ChatOnFinishCallback` signature: the callback receives `{ message, messages, isAbort, ... }` not just the message directly. Fixed by destructuring `{ message }` from the callback parameter.
- TypeScript's `noUncheckedIndexedAccess` requires explicit undefined guard before array index destructuring even when length is checked. Added `const firstEntry = entries[0]; if (!firstEntry) return null;`.

## Next Phase Readiness

- Interview page is live at `/onboard-interview?org=<slug>&token=<token>`
- After interview completes, navigates to `?step=recommendations` — ready for plan 02 (recommendation engine) to render content there
- `interviewResults` in diagnostic session is available for the recommendation scoring algorithm
- The `step` param is already in route validation, recommendation UI can be added without route changes

---
*Phase: 22-interview-recommendations*
*Completed: 2026-02-25*
