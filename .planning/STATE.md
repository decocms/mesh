# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Any TypeScript site gets a production-grade CMS with visual editing and resilient data in minutes
**Current focus:** v1.1 Polish & Integration — make v1.0 work end-to-end

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-15 — Milestone v1.1 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 13
- Average duration: 4min
- Total execution time: 0.8 hours

## Accumulated Context

### Decisions

Carried from v1.0:
- SITE_BINDING tools go through site MCP, not SELF MCP
- useSyncExternalStore pattern required by ban-use-effect lint rule
- Page variants at file level (`page_home.en-US.json`), not component-level i18n
- Props ARE the content; i18n only for UI chrome (form states, modal text)
- Composer has disconnected `iframeRef` — `useIframeBridge` in PreviewPanel handles all iframe comms
- `placeholderData` in React Query prevents iframe unmount on locale switch

### Pending Todos

None.

### Blockers/Concerns

- Composer `iframeRef` + `useEditorMessages` are dead code — all iframe comms go through PreviewPanel's `useIframeBridge`
- Sections and loaders pages depend on `.deco/blocks/` and `.deco/loaders/` existing in the connected site

## Session Continuity

Last session: 2026-02-15
Stopped at: Defining v1.1 requirements
Resume file: None
