---
phase: 19-diagnostic-backend
plan: "01"
subsystem: database
tags: [kysely, sqlite, ssrf, security, diagnostic, migration]

# Dependency graph
requires: []
provides:
  - "diagnostic_sessions table migration (035) with pre-auth nullable org/project FKs"
  - "DiagnosticSessionStorage class with create, findByToken, findRecentByNormalizedUrl, updateAgentStatus, updateResults, updateSessionStatus, associateOrg, deleteExpired"
  - "SSRF validator (normalizeUrl, validateUrl, isPrivateIp) blocking private IP ranges, localhost, non-HTTP protocols"
  - "Shared TypeScript types for diagnostic system (DiagnosticSession, AgentStatus, DiagnosticResult, etc.)"
affects:
  - "19-02: public Hono endpoint uses DiagnosticSessionStorage and validateUrl"
  - "19-03: diagnostic agents write to DiagnosticSessionStorage"
  - "21: associateOrg used post-login to link session to organization"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-auth sessions pattern: nullable organization_id/project_id filled retroactively post-login"
    - "SSRF prevention via DNS resolution check before any outbound HTTP request"
    - "Progressive agent status updates via updateAgentStatus (read-modify-write JSON column)"
    - "URL cache key via normalizedUrl (lowercase host, stripped trailing slash and hash)"

key-files:
  created:
    - apps/mesh/migrations/035-diagnostic-sessions.ts
    - apps/mesh/src/diagnostic/types.ts
    - apps/mesh/src/storage/diagnostic-sessions.ts
    - apps/mesh/src/diagnostic/ssrf-validator.ts
    - apps/mesh/src/diagnostic/ssrf-validator.test.ts
  modified:
    - apps/mesh/migrations/index.ts
    - apps/mesh/src/storage/types.ts

key-decisions:
  - "Built normalized string manually (not URL.toString()) — URL spec always appends trailing slash to root paths, which would break cache key consistency"
  - "Protocol rejection happens before URL parsing — catches data:/javascript:/ftp: URIs before the https:// prefix is applied"
  - "Used crypto.getRandomValues(Uint8Array) + btoa for token generation — avoids Node crypto import, works in Bun/edge"
  - "ColumnType comparison workaround: cast cutoff string to unknown as Date for Kysely created_at filter"

patterns-established:
  - "SSRF guard pattern: normalizeUrl (sync) + validateUrl (async DNS) — always call validateUrl on user-submitted URLs before any fetch"
  - "JSON column storage pattern: JSON.stringify on write, parseJson helper on read (handles both string and pre-parsed values)"
  - "Pre-auth session pattern: nullable org/project FKs, associateOrg fills them post-login"

requirements-completed:
  - DIAG-11
  - DIAG-01
  - DIAG-12

# Metrics
duration: 6min
completed: 2026-02-25
---

# Phase 19 Plan 01: Diagnostic Backend Foundation Summary

**diagnostic_sessions Kysely migration, DiagnosticSessionStorage CRUD class, and SSRF validator (48 tests) blocking all private IP ranges and non-HTTP protocols**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-25T10:50:40Z
- **Completed:** 2026-02-25T10:57:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created `diagnostic_sessions` table migration with token, url, normalized_url, status, agents (JSON), results (JSON), nullable organization_id/project_id, and expires_at for 7-day TTL
- Implemented `DiagnosticSessionStorage` with all required operations: create, findByToken, findRecentByNormalizedUrl (24h cache), updateAgentStatus, updateResults, updateSessionStatus, associateOrg, deleteExpired
- Created SSRF validator blocking 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 0/8, ::1, fc00/7, fe80/10, IPv4-mapped IPv6, localhost, and non-HTTP protocols — 48 tests all pass
- Defined complete shared types for the diagnostic system (DiagnosticSession, AgentStatus, SessionStatus, WebPerformanceResult, SeoResult, TechStackResult, CompanyContextResult, DiagnosticResult)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema, storage, and shared types** - `3c2d8e50b` (feat)
2. **Task 2: SSRF validator with DNS resolution check and tests** - `47c5cd236` (feat)

## Files Created/Modified
- `apps/mesh/migrations/035-diagnostic-sessions.ts` - New migration: diagnostic_sessions table with 4 indexes
- `apps/mesh/migrations/index.ts` - Registered migration 035
- `apps/mesh/src/diagnostic/types.ts` - DiagnosticSession, AgentStatus, DiagnosticResult and all sub-types
- `apps/mesh/src/storage/types.ts` - Added DiagnosticSessionTable and diagnostic_sessions to Database interface
- `apps/mesh/src/storage/diagnostic-sessions.ts` - DiagnosticSessionStorage class (8 methods)
- `apps/mesh/src/diagnostic/ssrf-validator.ts` - normalizeUrl, validateUrl, isPrivateIp (SSRF prevention)
- `apps/mesh/src/diagnostic/ssrf-validator.test.ts` - 48 tests covering all SSRF scenarios

## Decisions Made
- Built normalized URL string manually instead of using `URL.toString()` — the URL Web API always appends a trailing slash to root paths (`https://example.com` → `https://example.com/`), which would create inconsistent cache keys
- Protocol rejection before URL parsing — `data:`, `javascript:`, `ftp:` etc. are caught by checking for a non-http/https protocol prefix before the `https://` prepend step
- Used `crypto.getRandomValues(Uint8Array)` + btoa for token generation to avoid importing Node's `crypto` module
- Cast Kysely `created_at` comparison to `unknown as Date` to satisfy ColumnType strict typing while still passing an ISO string at runtime

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] URL normalization trailing slash issue**
- **Found during:** Task 2 (SSRF validator tests)
- **Issue:** `URL.toString()` always appends `/` to root-path URLs, causing test failures for cache key consistency expectations (`"https://example.com"` received as `"https://example.com/"`)
- **Fix:** Build normalized string manually from parsed URL components: `protocol + "//" + hostname + portPart + pathPart + searchPart`, omitting path when pathname is `"/"`
- **Files modified:** `apps/mesh/src/diagnostic/ssrf-validator.ts`
- **Verification:** 48 tests pass including trailing slash test cases
- **Committed in:** `47c5cd236` (Task 2 commit)

**2. [Rule 1 - Bug] data: URI rejection path**
- **Found during:** Task 2 (SSRF validator tests)
- **Issue:** `data:text/html,...` is not a valid `//`-based URL so the regex `^[a-zA-Z]...:\/\/` didn't match, causing it to receive `https://data:text/...` prepend which the URL constructor rejects as "Invalid URL" instead of "Unsupported protocol"
- **Fix:** Added early protocol detection using `trimmed.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):/)`  before the `://` check, throwing "Unsupported protocol" for any non-http/https scheme
- **Files modified:** `apps/mesh/src/diagnostic/ssrf-validator.ts`
- **Verification:** 48 tests pass including data: and ftp: rejection tests
- **Committed in:** `47c5cd236` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered
- Kysely `ColumnType<Date, Date | string, never>` for `created_at` requires casting ISO strings to `unknown as Date` for comparison operators — documented in code with a comment
- Pre-existing `company-context.ts` errors (missing `@ai-sdk/*` packages) appeared in some TypeScript check runs but are from unrelated code in the diagnostic agents directory from another task; final `bun run check` passes with exit 0

## Next Phase Readiness
- SSRF BLOCKER resolved — public diagnose endpoint (Plan 02) can now safely call validateUrl before any outbound fetch
- DiagnosticSessionStorage ready for Plan 02 (POST /diagnose creates session) and Plan 03 (agents write results)
- Migration 035 ready to run via `bun run --cwd=apps/mesh migrate`
- associateOrg method ready for Phase 21 post-login session claiming

## Self-Check: PASSED

All artifacts verified:
- apps/mesh/migrations/035-diagnostic-sessions.ts - FOUND
- apps/mesh/src/diagnostic/types.ts - FOUND
- apps/mesh/src/storage/diagnostic-sessions.ts - FOUND
- apps/mesh/src/diagnostic/ssrf-validator.ts - FOUND
- apps/mesh/src/diagnostic/ssrf-validator.test.ts - FOUND
- .planning/phases/19-diagnostic-backend/19-01-SUMMARY.md - FOUND
- Commit 3c2d8e50b (Task 1) - FOUND
- Commit 47c5cd236 (Task 2) - FOUND

---
*Phase: 19-diagnostic-backend*
*Completed: 2026-02-25*
