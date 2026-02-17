---
phase: 06-connection-setup
plan: 02
subsystem: ui
tags: [tunnel, wrangler, toml, polling, react-query, mcp-tool]

# Dependency graph
requires:
  - phase: 06-connection-setup/01
    provides: "Connection creation flow with FILESYSTEM_VALIDATE_PROJECT"
provides:
  - "FILESYSTEM_READ_TUNNEL_CONFIG SELF MCP tool"
  - "useTunnelDetection hook with background polling"
  - "TunnelInstructions component for user guidance"
  - "Auto-persist tunnel URL to connection metadata"
affects: [03-visual-editor, preview-panel]

# Tech tracking
tech-stack:
  added: [smol-toml]
  patterns: [server-side-reachability-check, polling-with-auto-stop, metadata-persistence]

key-files:
  created:
    - apps/mesh/src/tools/filesystem/read-tunnel-config.ts
    - packages/mesh-plugin-site-editor/client/lib/use-tunnel-detection.ts
    - packages/mesh-plugin-site-editor/client/components/tunnel-instructions.tsx
  modified:
    - apps/mesh/src/tools/filesystem/index.ts
    - apps/mesh/src/tools/index.ts
    - apps/mesh/src/tools/registry.ts
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts
    - packages/mesh-plugin-site-editor/client/components/pages-list.tsx
    - packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx

key-decisions:
  - "Store projectPath in connection metadata (not just in connection_headers args) so PluginConnectionEntity can access it"
  - "Server-side reachability check in tool handler avoids CORS issues from browser"
  - "Polling stops automatically when tunnel detected or no wrangler.toml found"

patterns-established:
  - "Metadata persistence pattern: store critical data in connection metadata for cross-component access"
  - "Server-side reachability pattern: fetch from tool handler, not browser, to avoid CORS"

# Metrics
duration: 7min
completed: 2026-02-15
---

# Phase 6 Plan 2: Tunnel Auto-Detection Summary

**Server-side tunnel config reader + client polling hook + instructions UI for zero-config preview URL detection**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-16T01:39:13Z
- **Completed:** 2026-02-16T01:46:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- FILESYSTEM_READ_TUNNEL_CONFIG tool reads wrangler.toml, computes deterministic tunnel URL (matching CLI algorithm), checks reachability server-side
- useTunnelDetection hook polls every 5s until tunnel reachable or wrangler.toml missing, then stops
- TunnelInstructions component shows "npx deco init" for missing config or "npx deco link" with expected URL when tunnel not running
- Auto-persists detected tunnel URL to connection metadata.previewUrl when tunnel becomes reachable

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FILESYSTEM_READ_TUNNEL_CONFIG tool** - `dded0adc1` (feat)
2. **Task 2: Create tunnel detection hook and instructions component** - `f0b8fbe94` (feat)
3. **Task 3: Integrate tunnel detection into pages list** - `f094096a3` (feat)

## Files Created/Modified
- `apps/mesh/src/tools/filesystem/read-tunnel-config.ts` - SELF MCP tool that reads wrangler.toml, computes tunnel domain, checks reachability
- `packages/mesh-plugin-site-editor/client/lib/use-tunnel-detection.ts` - React Query hook with 5s polling for tunnel detection
- `packages/mesh-plugin-site-editor/client/components/tunnel-instructions.tsx` - UI component with three states: no config, not reachable, reachable
- `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` - Added tunnel.detection query key
- `packages/mesh-plugin-site-editor/client/components/pages-list.tsx` - Integrated tunnel detection banner and auto-persistence
- `packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx` - Store projectPath in connection metadata during creation
- `apps/mesh/src/tools/filesystem/index.ts` - Re-export new tool
- `apps/mesh/src/tools/index.ts` - Register tool in SELF MCP tools array
- `apps/mesh/src/tools/registry.ts` - Add tool name, metadata, and label

## Decisions Made
- Stored projectPath in connection metadata during creation because PluginConnectionEntity type doesn't expose connection_headers -- metadata is the canonical way for plugins to pass data between components
- Server-side reachability check (fetch in tool handler) avoids CORS restrictions that would block browser-side HEAD requests to the tunnel URL
- Used useRef for persistence guard to avoid repeated COLLECTION_CONNECTIONS_UPDATE calls without violating the ban-use-effect rule

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Store projectPath in connection metadata**
- **Found during:** Task 3 (Integrate tunnel detection into pages list)
- **Issue:** Plan assumed connection_headers.args accessible via PluginConnectionEntity, but that type only exposes id, title, icon, description, app_name, app_id, tools, metadata
- **Fix:** Store projectPath in connection metadata during creation in plugin-empty-state.tsx, read from metadata in pages-list.tsx
- **Files modified:** packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx
- **Verification:** TypeScript compiles, projectPath flows correctly through metadata
- **Committed in:** f094096a3 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential fix for data flow. PluginConnectionEntity intentionally limits exposed fields for security/simplicity; metadata is the correct channel for plugin-specific data.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tunnel detection system complete and integrated into pages list
- Preview URL auto-configures when tunnel running, persists across sessions
- Ready for Phase 7+ work on visual editor preview panel integration

---
*Phase: 06-connection-setup*
*Completed: 2026-02-15*
