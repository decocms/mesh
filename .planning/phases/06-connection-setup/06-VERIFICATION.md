---
phase: 06-connection-setup
verified: 2026-02-15T02:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 6: Connection Setup Verification Report

**Phase Goal:** Users can connect their local project to Mesh site-editor from within the plugin UI, with preview URL auto-detected

**Verified:** 2026-02-15T02:00:00Z

**Status:** passed

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

#### From Success Criteria (ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can connect their local project folder from the plugin's empty state via an inline wizard with path input, without being redirected to project settings | ✓ VERIFIED | plugin-empty-state.tsx implements full inline wizard: FILESYSTEM_PICK_DIRECTORY browse button (line 44-63), manual path input (line 204-212), validation + connection creation flow (line 65-141). No redirect — queries invalidated to trigger in-place transition. |
| 2 | Plugin auto-detects the site's running dev server tunnel URL and configures the preview panel without manual URL entry | ✓ VERIFIED | FILESYSTEM_READ_TUNNEL_CONFIG computes tunnel URL from wrangler.toml (read-tunnel-config.ts:91), useTunnelDetection polls every 5s (use-tunnel-detection.ts:58-65), pages-list.tsx auto-persists to metadata.previewUrl when reachable (line 95-113). |
| 3 | Connection wizard validates the selected path contains a valid TypeScript project before completing setup | ✓ VERIFIED | plugin-empty-state.tsx calls FILESYSTEM_VALIDATE_PROJECT before connection creation (line 76-93), checks tsconfig.json + package.json (validate-project.ts:64-70), shows inline error messages for each failure type (line 85-92). |

**Score:** 3/3 success criteria verified

#### From Plan 06-01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking Connect validates the path contains tsconfig.json and package.json before creating a connection | ✓ VERIFIED | FILESYSTEM_VALIDATE_PROJECT checks dirExists → tsconfig.json → package.json (validate-project.ts:60-70), plugin-empty-state.tsx calls validation on line 76-93 before connection creation. |
| 2 | Invalid paths show distinct inline error messages (path not found, missing tsconfig, missing package.json) | ✓ VERIFIED | Three distinct error codes map to user-friendly messages (plugin-empty-state.tsx:85-90): PATH_NOT_FOUND → "Path not found", MISSING_TSCONFIG → "Not a TypeScript project", MISSING_PACKAGE_JSON → "Not a Node project". Error displayed inline (line 214). |
| 3 | Successful connection shows a brief checkmark confirmation before transitioning to pages view | ✓ VERIFIED | Phase state machine transitions to "success" (line 119), renders checkmark SVG + "Connected!" text (line 145-168), waits 1500ms (line 120), then invalidates queries to trigger transition (line 123-134). |
| 4 | Empty state shows a friendly, guiding tone with folder icon and centered card layout | ✓ VERIFIED | Folder icon from @untitledui/icons (line 183), centered layout with max-w-md (line 174), friendly copy "Connect your site" + "Click to select a folder" (line 186-190), browse area with dashed border (line 181). |

**Score:** 4/4 plan 01 truths verified

#### From Plan 06-02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After connection is created, plugin auto-detects the tunnel URL from wrangler.toml without manual entry | ✓ VERIFIED | FILESYSTEM_READ_TUNNEL_CONFIG reads wrangler.toml (read-tunnel-config.ts:66), extracts workspace + app (line 81-84), computes tunnel URL (line 91), pages-list.tsx calls useTunnelDetection (line 87-92), persists to metadata.previewUrl when reachable (line 95-113). |
| 2 | When no tunnel is detected, actionable deco link instructions are shown to the user | ✓ VERIFIED | TunnelInstructions component shows "npx deco init" when no wrangler.toml (tunnel-instructions.tsx:30-46), shows "npx deco link" + expected URL when tunnel not reachable (line 50-73), pages-list.tsx renders TunnelInstructions when !hasPreviewUrl (line 251-258). |
| 3 | Background polling continues until tunnel becomes reachable, then auto-configures preview | ✓ VERIFIED | useTunnelDetection refetchInterval returns 5000ms while !reachable (use-tunnel-detection.ts:58-65), stops when reachable or no tunnelUrl (line 61), pages-list.tsx persists URL via COLLECTION_CONNECTIONS_UPDATE when reachable (line 95-113), uses persistedRef to prevent repeated calls (line 65, 96). |
| 4 | Detected tunnel URL persists in connection metadata for reuse across sessions | ✓ VERIFIED | pages-list.tsx stores tunnel URL in connection metadata.previewUrl (line 104-107), metadata read on component mount (line 77-84), hasPreviewUrl check skips tunnel detection if already set (line 83-84, 91), metadata persists across sessions in database. |
| 5 | Projects without wrangler.toml gracefully show manual instructions instead of erroring | ✓ VERIFIED | FILESYSTEM_READ_TUNNEL_CONFIG catches read/parse errors and returns nullResult (read-tunnel-config.ts:56-69), useTunnelDetection sets noWranglerToml when tunnelUrl is null (use-tunnel-detection.ts:73), TunnelInstructions shows "npx deco init" setup guidance (tunnel-instructions.tsx:30-46). |

**Score:** 5/5 plan 02 truths verified

#### Additional Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | projectPath persists in connection metadata for tunnel detection to access across components | ✓ VERIFIED | plugin-empty-state.tsx stores projectPath in metadata during creation (line 105), pages-list.tsx reads from connection.metadata.projectPath (line 77-82), passed to useTunnelDetection (line 89). |

**Score:** 1/1 additional truths verified

### Required Artifacts

#### Plan 06-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| apps/mesh/src/tools/filesystem/validate-project.ts | FILESYSTEM_VALIDATE_PROJECT SELF MCP tool | ✓ VERIFIED | Exists (75 lines), exports FILESYSTEM_VALIDATE_PROJECT, defineTool with inputSchema/outputSchema, handler checks dir → tsconfig.json → package.json. Registered in registry.ts (line 127, 555, 638) and index.ts (line 136). |
| apps/mesh/src/tools/filesystem/index.ts | Re-export of new tool | ✓ VERIFIED | Line 3: `export { FILESYSTEM_VALIDATE_PROJECT } from "./validate-project";` |
| packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx | Enhanced empty state with validation and success confirmation | ✓ VERIFIED | Exists (223 lines), imports and calls FILESYSTEM_VALIDATE_PROJECT (line 76-93), phase state machine (line 25), success confirmation UI (line 145-168), error mapping (line 85-90). |

#### Plan 06-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| apps/mesh/src/tools/filesystem/read-tunnel-config.ts | FILESYSTEM_READ_TUNNEL_CONFIG SELF MCP tool | ✓ VERIFIED | Exists (108 lines), exports FILESYSTEM_READ_TUNNEL_CONFIG, computeTunnelDomain helper matching CLI algorithm (line 20-26), reads wrangler.toml (line 66), parses with smol-toml (line 74), checks reachability server-side (line 94-103). Registered in registry.ts (line 126, 550, 637) and index.ts (line 135). |
| packages/mesh-plugin-site-editor/client/lib/use-tunnel-detection.ts | useTunnelDetection hook for auto-poll | ✓ VERIFIED | Exists (76 lines), exports useTunnelDetection, useQuery with refetchInterval (line 43-65), calls FILESYSTEM_READ_TUNNEL_CONFIG (line 46-50), returns tunnelUrl/reachable/isLoading/noWranglerToml (line 69-74). |
| packages/mesh-plugin-site-editor/client/components/tunnel-instructions.tsx | Tunnel setup instructions UI component | ✓ VERIFIED | Exists (77 lines), exports default function TunnelInstructions, three states: reachable → null (line 27), noWranglerToml → "npx deco init" (line 30-46), tunnel not reachable → "npx deco link" + polling indicator (line 50-73). |
| packages/mesh-plugin-site-editor/client/lib/query-keys.ts | Tunnel detection query key | ✓ VERIFIED | Line 34-36: `tunnel: { detection: (connectionId: string) => ["site-editor", "tunnel", connectionId] as const }` |

### Key Link Verification

#### Plan 06-01 Key Links

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx | FILESYSTEM_VALIDATE_PROJECT | selfClient.callTool | ✓ WIRED | Line 76-79: `await selfClient.callTool({ name: "FILESYSTEM_VALIDATE_PROJECT", arguments: { path: trimmed } })`, result destructured (line 80-83), error handling (line 84-93). |

#### Plan 06-02 Key Links

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| packages/mesh-plugin-site-editor/client/lib/use-tunnel-detection.ts | FILESYSTEM_READ_TUNNEL_CONFIG | selfClient.callTool | ✓ WIRED | Line 46-50: `await selfClient.callTool({ name: "FILESYSTEM_READ_TUNNEL_CONFIG", arguments: { path: projectPath } })`, result cast to TunnelConfig (line 50-55). |
| packages/mesh-plugin-site-editor/client/components/pages-list.tsx | use-tunnel-detection.ts | useTunnelDetection hook | ✓ WIRED | Import on line 39, hook called line 87-92 with connectionId/projectPath/orgId, result destructured and used for TunnelInstructions (line 251-258) and persistence (line 95-113). |
| packages/mesh-plugin-site-editor/client/lib/use-tunnel-detection.ts | COLLECTION_CONNECTIONS_UPDATE | selfClient.callTool to persist tunnel URL | ✓ WIRED | pages-list.tsx line 97-113: calls COLLECTION_CONNECTIONS_UPDATE when tunnel.reachable && tunnel.tunnelUrl, sets metadata.previewUrl, invalidates queries. Uses persistedRef guard (line 65, 96). |

### Requirements Coverage

No explicit requirements mapped to Phase 06 in REQUIREMENTS.md. Phase 06 delivers CONN-01 and CONN-02 requirements from ROADMAP.md:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CONN-01: Inline connection wizard with path validation | ✓ SATISFIED | plugin-empty-state.tsx wizard (browse + manual input + validation + success) all inline, no redirect. |
| CONN-02: Auto-detect preview URL from tunnel | ✓ SATISFIED | Tunnel detection system (tool + hook + instructions + persistence) auto-configures preview URL when tunnel running. |

### Anti-Patterns Found

No anti-patterns found. Scanned files: validate-project.ts, read-tunnel-config.ts, use-tunnel-detection.ts, tunnel-instructions.tsx, plugin-empty-state.tsx, pages-list.tsx.

- No TODO/FIXME/PLACEHOLDER comments
- No empty implementations (return null in TunnelInstructions is conditional rendering, not a stub)
- No console.log debugging
- No orphaned artifacts (all files imported and used)
- All tools registered in registry and index
- All hooks called by consuming components
- All persistence logic guarded by refs (no repeated writes)

### Human Verification Required

#### 1. Folder picker native dialog

**Test:** Click "Click to select a folder" browse area in plugin empty state.

**Expected:** Native folder picker dialog opens, user can select a directory, selected path appears in the manual input field below.

**Why human:** FILESYSTEM_PICK_DIRECTORY tool opens native OS dialog — can't verify programmatically without OS integration testing.

#### 2. Path validation error messages

**Test:** Enter an invalid path (non-existent, or missing tsconfig.json, or missing package.json) and click Connect.

**Expected:** Inline error message appears under the path input in red text with the appropriate message: "Path not found", "Not a TypeScript project (missing tsconfig.json)", or "Not a Node project (missing package.json)".

**Why human:** Need to test actual filesystem validation logic end-to-end with real project directories.

#### 3. Success confirmation transition

**Test:** Connect a valid project and observe the UI.

**Expected:** After clicking Connect, button text changes to "Connecting...", then a green checkmark appears with "Connected!" for ~1.5 seconds, then the pages list view appears showing the tunnel detection banner (if no tunnel running).

**Why human:** Timing-based UI transition — need to verify smooth UX flow and animation feel.

#### 4. Tunnel auto-detection polling

**Test:** Connect a project with wrangler.toml but dev tunnel not running. Observe the tunnel instructions banner. Then start `npx deco link` in the project directory.

**Expected:** Banner shows "Start your dev tunnel" with the expected tunnel URL and a pulsing "Waiting for tunnel..." indicator. Within 5 seconds of starting the tunnel, the banner should disappear (URL auto-persisted to connection metadata).

**Why human:** Real-time polling behavior with external service (dev tunnel) — need to verify timing, auto-stop, and persistence flow.

#### 5. No wrangler.toml fallback

**Test:** Connect a project without wrangler.toml (or with wrangler.toml missing deco.workspace).

**Expected:** Pages list shows tunnel instructions banner with "Set up your tunnel" heading and guidance to run "npx deco init". No polling indicator. No errors.

**Why human:** Need to verify graceful fallback messaging and tone for projects not yet configured.

#### 6. Tunnel URL persistence across sessions

**Test:** Connect a project, detect the tunnel URL (auto-configured), then refresh the page or log out/in.

**Expected:** On return to the plugin, the preview URL should still be configured (no tunnel detection banner), preview panel should load the persisted URL.

**Why human:** Cross-session state persistence — need to verify connection metadata survives app reload and re-authentication.

---

_Verified: 2026-02-15T02:00:00Z_

_Verifier: Claude (gsd-verifier)_
