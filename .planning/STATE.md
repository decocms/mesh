# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Any TypeScript site gets a production-grade CMS with visual editing and resilient data in minutes
**Current focus:** v1.1 Polish & Integration — make v1.0 work end-to-end

## Current Position

Phase: 6 - Connection Setup
Plan: 1 of 2 complete
Status: Executing phase 6
Last activity: 2026-02-15 — Completed 06-01 (validation tool + empty state)

Progress: [░░░░░░░░░░] 0% (0/5 phases complete)

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 13
- Average duration: 4min
- Total execution time: 0.8 hours

**v1.1 Target:**
- Estimated plans: 7
- Estimated duration: ~0.5 hours

## Accumulated Context

### Decisions

Carried from v1.0:
- SITE_BINDING tools go through site MCP, not SELF MCP
- useSyncExternalStore pattern required by ban-use-effect lint rule
- Page variants at file level (`page_home.en-US.json`), not component-level i18n
- Props ARE the content; i18n only for UI chrome (form states, modal text)
- Composer has disconnected `iframeRef` — `useIframeBridge` in PreviewPanel handles all iframe comms
- `placeholderData` in React Query prevents iframe unmount on locale switch

From v1.1 roadmap:
- Connection setup moves to inline wizard (no project settings redirect)
- Preview URL auto-detection eliminates manual tunnel URL entry
- Sections and loaders pages need actual list/detail views (not just scaffolding)
- Preview bridge cleanup consolidates all iframe comms in PreviewPanel (remove dead code)
- anjo.chat is the validation target for all integration work

From pre-phase-6 bugfix:
- PluginLayout now trusts project config connectionId directly (no binding check on lookup) — new STDIO connections don't have tools populated yet
- Static plugin routes (`/site-editor`) don't have `$pluginId` param — always use URL path fallback (`location.pathname.split("/")[2]`) when reading pluginId

From phase 6 plan 1:
- Validation checks dir existence, tsconfig.json, package.json in order (fail-fast)
- Phase state machine (form/connecting/success) replaces boolean flags in empty state
- 1.5s success confirmation before query invalidation transitions view

### Pending Todos

None.

### Blockers/Concerns

- Phase 6-9 must complete before Phase 10 validation
- anjo.chat must have `.deco/blocks/` and `.deco/loaders/` from prior manual setup

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 06-01-PLAN.md
Resume file: .planning/phases/06-connection-setup/06-01-SUMMARY.md
