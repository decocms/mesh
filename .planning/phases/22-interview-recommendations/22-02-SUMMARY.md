---
phase: 22-interview-recommendations
plan: "02"
subsystem: api
tags: [hono, kysely, recommendation-engine, virtual-mcp, scoring, onboarding]

requires:
  - phase: 22-interview-recommendations
    plan: "01"
    provides: interviewResults stored in diagnostic session via updateResults()

provides:
  - GET /api/onboarding/recommendations endpoint returning 2-3 scored AgentRecommendation objects
  - InterviewResults and AgentRecommendation type definitions in diagnostic/types.ts
  - Rule-based scoring engine: diagnostic signals + interview keyword matching vs Virtual MCP metadata

affects:
  - 22-03-hire-flow (reads recommendations to render hire UI at ?step=recommendations)

tech-stack:
  added: []
  patterns:
    - Direct Kysely DB query inside createOnboardingRoutes factory (no MeshContext available)
    - Metadata column dual-parse pattern (typeof check before JSON.parse — handles string or Record from Kysely JsonObject type)
    - Batch-load child connections in one query after grouping aggregations by parent ID
    - Score accumulation with reason strings joined as plain-English explanation

key-files:
  created: []
  modified:
    - apps/mesh/src/diagnostic/types.ts
    - apps/mesh/src/api/routes/onboarding.ts

key-decisions:
  - "Virtual MCPs are stored as connections with connection_type=VIRTUAL — query connections table directly, no virtual_mcp table exists"
  - "Decopilot filtered by id.startsWith('decopilot_') — same pattern as isDecopilot() from mesh-sdk but without importing mesh-sdk in this factory module"
  - "metadata column is JsonObject<Record<string,unknown>> — Kysely SELECT returns Record not string, so dual-parse guard (typeof check) is required"
  - "Child connection isConfigured check uses connection_url || connection_headers presence + active status — same signal as existing virtual MCP storage"
  - "InterviewResults type added to DiagnosticResult as optional field — consistent with how interviewResults is stored via updateResults() with string key cast"

patterns-established:
  - "Rule-based scoring: keyword regex test on searchText → diagnostic condition check → score += N + reason push — clean separation of signal detection from scoring"

requirements-completed: [AGNT-01, AGNT-02]

duration: 3min
completed: 2026-02-25
---

# Phase 22 Plan 02: Recommendation Engine + API Endpoint Summary

**Rule-based agent recommendation engine scoring Virtual MCPs against diagnostic results + interview goals, exposed as GET /api/onboarding/recommendations returning top 2-3 scored agents with plain-English explanations**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T12:46:25Z
- **Completed:** 2026-02-25T12:49:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `InterviewResults` and `AgentRecommendation` type definitions to `diagnostic/types.ts` — `DiagnosticResult` now includes optional `interviewResults` field
- Built rule-based scoring engine that matches Virtual MCP title/description/instructions against diagnostic signals (web performance, SEO, content, platform) and interview goals/challenges/priorities
- Registered `GET /api/onboarding/recommendations?token=...&organizationId=...` endpoint inside `createOnboardingRoutes` factory — authenticated, validated, returns `{ recommendations: AgentRecommendation[] }`

## Task Commits

1. **Task 1: Add InterviewResults and AgentRecommendation types** - `93453f421` (feat)
2. **Task 2: Recommendation engine + GET /recommendations endpoint** - `186abcc7d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/mesh/src/diagnostic/types.ts` - Added InterviewResults interface, AgentRecommendation interface, and interviewResults field to DiagnosticResult
- `apps/mesh/src/api/routes/onboarding.ts` - Added RecommendationsQuerySchema, GET /recommendations handler with scoring engine and requiredConnections builder

## Decisions Made

- Virtual MCPs are stored as `connections` with `connection_type = 'VIRTUAL'` — the plan's suggested `virtual_mcp` table doesn't exist. Queried the `connections` table directly with `connection_type = 'VIRTUAL'` filter, then joined `connection_aggregations` for child connections.
- Decopilot filtered using `id.startsWith('decopilot_')` inline — avoids importing `@decocms/mesh-sdk` into the onboarding factory module (which already avoids complex side-effect imports, as established in phase 21).
- `metadata` column is `JsonObject<Record<string,unknown>>` — Kysely's ColumnType SELECT type is `Record`, not `string`. Added dual-parse guard (`typeof raw === 'string'`) to handle both string and object forms safely.
- `isConfigured` for a required connection: checks `connection_url || connection_headers` presence + `status === 'active'` — mirrors how the virtual MCP storage determines if a connection is actually wired.
- `InterviewResults` type also needed in `DiagnosticResult` frontmatter — added as optional field, matching how `interviewResults` key is stored via `updateResults()` with string cast.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed metadata column parse — Kysely JsonObject SELECT type is Record not string**
- **Found during:** Task 2 (recommendation engine implementation)
- **Issue:** Plan showed `JSON.parse(vmcp.metadata)` but `metadata` column is typed as `JsonObject<Record<string,unknown>>` — Kysely returns a `Record` on SELECT, making `JSON.parse` a type error (TS2345)
- **Fix:** Added `typeof raw === 'string'` guard: parse if string, cast if already object
- **Files modified:** apps/mesh/src/api/routes/onboarding.ts
- **Verification:** `bun run check` passes with no TypeScript errors
- **Committed in:** 186abcc7d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** The fix is necessary for TypeScript correctness. No scope creep. Scoring logic and endpoint structure exactly as specified.

## Issues Encountered

- TypeScript error on `JSON.parse(vmcp.metadata)` because `JsonObject<T>` has SELECT type `T` (not `string`). Fixed by dual-parse pattern with typeof guard.

## Next Phase Readiness

- `GET /api/onboarding/recommendations?token=...&organizationId=...` is live and authenticated
- Returns `{ recommendations: AgentRecommendation[] }` with `agentId`, `agentTitle`, `reason`, `score`, `requiredConnections`
- Empty array returned gracefully when no Virtual MCPs exist or none score above 0
- Ready for plan 03 (hire flow) to call this endpoint and render the recommendations UI at `?step=recommendations`

---
*Phase: 22-interview-recommendations*
*Completed: 2026-02-25*
