---
phase: 21-auth-handoff
plan: "01"
subsystem: api
tags: [hono, better-auth, onboarding, organizations, projects, diagnostic]

# Dependency graph
requires:
  - phase: 19-diagnostic-backend
    provides: DiagnosticSessionStorage.findByToken + associateOrg, DiagnosticSession types
  - phase: 19-diagnostic-backend
    provides: createDiagnosticRoutes factory pattern for pre-MeshContext routes
provides:
  - GET /api/onboarding/resolve — returns suggestedOrgName from AI context + matching orgs by email domain
  - POST /api/onboarding/claim — creates/joins org, creates project for storefront URL, associates diagnostic session
  - API_ONBOARDING path prefix in shouldSkipMeshContext
affects:
  - 21-02
  - 21-03
  - frontend onboarding claim UI

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createOnboardingRoutes(db, auth) factory — same pattern as createDiagnosticRoutes for pre-MeshContext auth-aware routes"
    - "getSessionUser(c) helper — manual session extraction via authInstance.api.getSession without MeshContext"
    - "slugify duplicated locally in routes/onboarding.ts to avoid auth/index.ts initialization side effects"

key-files:
  created:
    - apps/mesh/src/api/routes/onboarding.ts
  modified:
    - apps/mesh/src/api/utils/paths.ts
    - apps/mesh/src/api/app.ts

key-decisions:
  - "slugify function duplicated locally in onboarding.ts — importing from auth/index.ts triggers complex initialization side effects (Better Auth config, plugins, DB connection)"
  - "extractCompanyName heuristic: parse 'CompanyName is ...' pattern from AI description, fallback to URL hostname"
  - "Org creation retry up to 3 attempts with random 4-char hex suffix on slug conflict"
  - "Project creation non-fatal — session association proceeds even if project creation fails"
  - "setActiveOrganization call non-fatal — client can call it separately if needed"

patterns-established:
  - "Auth-aware pre-MeshContext routes: use authInstance.api.getSession(headers) for manual session check, return 401 if missing"
  - "Route factory receives (db: Kysely<Database>, authInstance: typeof auth) — same DI pattern as diagnostic routes"

requirements-completed: [AUTH-02, AUTH-04]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 21 Plan 01: Auth Handoff — Onboarding API Routes Summary

**Hono onboarding routes (resolve + claim) with manual Better Auth session validation, org creation/join, project scaffolding, and diagnostic session association**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T12:17:45Z
- **Completed:** 2026-02-25T12:20:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- GET /api/onboarding/resolve extracts company name from AI diagnostic description and finds matching orgs by email domain
- POST /api/onboarding/claim creates org (or joins existing), creates project from storefront URL, associates diagnostic session
- Routes mounted before MeshContext middleware in app.ts — user may not have an active org yet
- `shouldSkipMeshContext` updated with API_ONBOARDING prefix so context injection is bypassed for these routes
- All TypeScript, lint, and format checks pass with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create onboarding API routes (resolve + claim)** - `b936c9760` (feat)
2. **Task 2: Wire onboarding routes into app.ts and update paths** - `441309e5c` (feat)

## Files Created/Modified
- `apps/mesh/src/api/routes/onboarding.ts` - Hono route factory with GET /resolve and POST /claim, manual auth session check, org/project creation logic
- `apps/mesh/src/api/utils/paths.ts` - Added API_ONBOARDING prefix and shouldSkipMeshContext entry
- `apps/mesh/src/api/app.ts` - Imported and mounted createOnboardingRoutes before MeshContext middleware

## Decisions Made
- Duplicated the `slugify` function locally in onboarding.ts rather than importing from auth/index.ts — importing triggers complex initialization with Better Auth plugins, DB connections, and side effects
- The `extractCompanyName` heuristic looks for "CompanyName is ..." / "CompanyName are ..." patterns (common LLM description format), falls back to URL hostname
- Project creation failure is non-fatal — the session is still associated with the org even if the project slug conflicts and all retries fail
- `setActiveOrganization` is attempted but treated as non-fatal — client session needs to be refreshed separately

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial `getSessionOrFail` helper used complex generic type inference (`Parameters<Parameters<typeof app.get>[1]>[0]`) that TypeScript couldn't resolve. Fixed by using `Context` from hono and renaming to `getSessionUser` returning `null` instead of a Response — cleaner and avoids the type inference problem.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Onboarding backend API is complete and ready for frontend integration (Phase 21-02 or 21-03)
- Claim flow requires the user to have a valid Better Auth session (post-login)
- Join flow requires user to already be a member of the target org (no self-join — invite flow not implemented yet)

## Self-Check: PASSED

- FOUND: apps/mesh/src/api/routes/onboarding.ts (459 lines, exceeds 120 min_lines)
- FOUND: .planning/phases/21-auth-handoff/21-01-SUMMARY.md
- FOUND: commit b936c9760 (Task 1)
- FOUND: commit 441309e5c (Task 2)
- FOUND: createOnboardingRoutes exported from onboarding.ts
- FOUND: API_ONBOARDING in paths.ts
- TypeScript check: 0 errors
- Lint: 0 warnings, 0 errors
- Format: no fixes needed

---
*Phase: 21-auth-handoff*
*Completed: 2026-02-25*
