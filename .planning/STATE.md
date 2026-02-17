# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Any TypeScript site gets a production-grade CMS with visual editing and resilient data in minutes
**Current focus:** v1.1 Polish & Integration — make v1.0 work end-to-end

## Current Position

Phase: 10 - Documentation & Validation
Plan: 1 of 2 complete
Status: In progress
Last activity: 2026-02-17 — Completed 10-01-PLAN.md (blocks framework specification)

Progress: [███████████████████░] 95% (10.5/11 phases complete)

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

From phase 6 plan 2:
- Store projectPath in connection metadata (PluginConnectionEntity doesn't expose connection_headers)
- Server-side reachability check avoids CORS issues from browser
- Polling stops automatically when tunnel detected or no wrangler.toml found

From phase 7 plan 1:
- Controlled Collapsible with Set<string> open state for category collapse tracking
- CMS_BLOCK_SCAN called via selfClient (SELF_MCP_ALIAS_ID), not through toolCaller

From phase 7 plan 2:
- SchemaTree uses cn() for conditional classNames (require-cn-classname lint rule)
- Max depth 5 for schema tree prevents infinite nesting
- Circular $ref detection via visited Set returning placeholder object

From phase 8 plan 1:
- Reuse sectionMap query key across list and detail views for cache sharing
- Use select option in useQuery for detail view to extract specific loader sections from shared map
- Connected sections derived from page blocks at query time, not stored in loader definitions

From phase 9 plan 1:
- Lifted useIframeBridge from PreviewPanel to PageComposer for single bridge ownership
- Site-side editor client uses module-level singleton pattern (no React context needed)
- useEditorProps hook uses useSyncExternalStore with null server snapshot for SSR safety
- SectionRenderer component pattern for hook-based live prop injection in starter template

From phase 9 plan 2:
- Mode state owned by PageComposer as single source of truth, passed to bridge and PreviewPanel
- Numeric state machine (0=loading, 1=ready, 2=disconnected) for useSyncExternalStore compatibility
- notifyRef pattern stores subscribe callback for timer-driven re-renders from handleIframeLoad
- 5-second disconnect timeout balances fast detection with slow dev server startup

From phase 09.1 plan 1:
- Site store uses same useSyncExternalStore pattern as editor-client.ts for consistency
- Dirty state is a simple module-level boolean, not a reactive store, since it only needs synchronous reads
- markDirty/markClean bracket pattern around async save operations in PageComposer

From phase 09.1 plan 2:
- useConnectionId hook added to ClientPlugin interface for non-invasive multi-site support
- PluginLayoutWithOverride wrapper component ensures hooks are called at component top level
- registerFlush/flushPendingSave pattern for save-and-switch flow via ref indirection
- key={connectionId} on PluginContextProvider forces clean remount on site switch

From phase 10 plan 1:
- Spec placed at docs/BLOCKS_FRAMEWORK.md (repo root) for discoverability, not scoped under apps/mesh/
- Claude skill contains full spec inline (not a reference to external file) for self-contained agent use
- Three-copy distribution: canonical docs/ -> Claude skill .claude/commands/ (with frontmatter) -> starter template (identical)

### Roadmap Evolution

- Phase 09.1 inserted after Phase 9: Multi-Site Support — toggle between multiple site connections in the top bar (URGENT)

### Pending Todos

None.

### Blockers/Concerns

- Phase 6-9 must complete before Phase 10 validation
- anjo.chat must have `.deco/blocks/` and `.deco/loaders/` from prior manual setup

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 10-01-PLAN.md (blocks framework specification)
Resume file: .planning/phases/10-documentation-validation/10-01-SUMMARY.md
