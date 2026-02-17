---
phase: 01-plugin-shell
plan: 02
subsystem: ui
tags: [preact, iframe, tunnel, preview, mesh-plugin]

# Dependency graph
requires:
  - phase: 01-plugin-shell-01
    provides: "SITE_BINDING definition and plugin package skeleton"
provides:
  - "PreviewPanel component with iframe-based site preview"
  - "useTunnelUrl hook resolving tunnel URL from connection metadata"
affects: [03-local-dev-connection, phase-3-visual-editing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Connection metadata for plugin-specific config (previewUrl field)"
    - "Iframe sandbox with allow-scripts allow-same-origin for site preview"

key-files:
  created:
    - "packages/mesh-plugin-site-editor/client/components/preview-panel.tsx"
    - "packages/mesh-plugin-site-editor/client/lib/use-tunnel-url.ts"
  modified: []

key-decisions:
  - "Tunnel URL sourced from connection.metadata.previewUrl rather than connection.url (MCP endpoint != preview endpoint)"
  - "No responsive viewport toggle yet -- deferred to Phase 3 EDIT-04"

patterns-established:
  - "Preview URL via connection metadata: plugins read custom config from connection.metadata"

# Metrics
duration: 1min
completed: 2026-02-14
---

# Phase 1 Plan 2: Preview Panel Summary

**Iframe-based PreviewPanel component with useTunnelUrl hook resolving preview URL from connection metadata**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-14T12:18:08Z
- **Completed:** 2026-02-14T12:18:59Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- PreviewPanel renders a full-size iframe when tunnel URL is available
- Empty state shows clear instructions to run `deco link` when no tunnel is configured
- useTunnelUrl hook reads `previewUrl` from connection metadata using usePluginContext

## Task Commits

Each task was committed atomically:

1. **Task 1: Create preview panel and tunnel URL hook** - `a0e32de86` (feat)

## Files Created/Modified
- `packages/mesh-plugin-site-editor/client/components/preview-panel.tsx` - Iframe preview component with empty state fallback
- `packages/mesh-plugin-site-editor/client/lib/use-tunnel-url.ts` - Hook resolving tunnel URL from connection metadata

## Decisions Made
- Used `connection.metadata.previewUrl` as the tunnel URL source rather than `connection.url`, since the MCP connection URL (the MCP server endpoint) is different from the site preview URL (the dev server visible in the browser)
- Kept the hook simple with no async resolution for Phase 1 -- the URL is synchronously available from connection metadata

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PreviewPanel is ready to be integrated into the site-editor client routes (Plan 01 Task 2 creates the router)
- The `deco link` CLI command needs to write `previewUrl` to connection metadata for the preview to work end-to-end

## Self-Check: PASSED

- [x] preview-panel.tsx exists
- [x] use-tunnel-url.ts exists
- [x] SUMMARY.md exists
- [x] Commit a0e32de86 exists

---
*Phase: 01-plugin-shell*
*Completed: 2026-02-14*
