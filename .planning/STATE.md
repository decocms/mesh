# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** E-commerce teams get an instant storefront diagnostic and guided onboarding into a team of AI agents that optimize their store.
**Current focus:** Milestone v1.4 — Storefront Onboarding (Phase 19 in progress)

## Current Position

Phase: 19 of 22 in v1.4 (Diagnostic Backend)
Plan: 3 of 3
Status: In Progress
Last activity: 2026-02-25 — completed 19-02 (all 4 diagnostic agents + shared crawler)

Progress: [██░░░░░░░░] 8% (v1.4, 2/3 plans in phase 19 done)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 7 min
- Total execution time: 13 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 19 P01 | 1 | 6 min | 6 min |
| Phase 19 P02 | 1 | 7 min | 7 min |

**Recent Trend:** 7 min/plan

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-auth diagnostic before login — show value first (PageSpeed Insights pattern)
- Diagnostic agents as standalone async functions, NOT MCP tools (MeshContext requires auth)
- Public Hono routes registered before MeshContext middleware via `shouldSkipMeshContext()`
- DIAG-07 through DIAG-10 (traffic, SEO rankings, brand, percentile) are mocked sections in the report UI — same phase as the report, not separate backend work
- Pre-auth state preserved via `?next=` URL param + `sessionStorage` fallback through OAuth redirect
- Agent recommendations are rule-based scoring against live Virtual MCP registry — no hardcoded agent IDs
- [Phase 19]: Built normalized URL string manually instead of URL.toString() to avoid trailing slash on root paths breaking cache key consistency
- [Phase 19]: SSRF validator performs early protocol detection before URL parsing to catch data:/javascript:/ftp: URIs with correct error messages
- [Phase 19]: PSI API embeds CrUX field data in loadingExperience — no separate CrUX API call needed for plan 02 agents
- [Phase 19]: LLM provider packages are optional runtime deps for company context agent — dynamic any-cast imports avoid TypeScript module resolution errors
- [Phase 19]: DIAGNOSTIC_AGENTS registry preserves per-agent typed signatures — seo/tech_stack take CrawlResult, web_performance/company_context take (url, CrawlResult)

### Pending Todos

None yet.

### Blockers/Concerns

- RESOLVED: Phase 19 SSRF validation blocker — SSRF validator implemented and tested (48 tests pass)
- RESOLVED: Phase 19 @ai-sdk/openai availability — using dynamic any-cast imports for optional runtime deps
- Phase 22: Virtual MCP capability metadata schema unknown — may need new tags/requiredConnections field added before recommendation scoring can be implemented

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 19-02-PLAN.md — all 4 diagnostic agents implemented (SEO, tech stack, web performance, company context)
Resume file: None
