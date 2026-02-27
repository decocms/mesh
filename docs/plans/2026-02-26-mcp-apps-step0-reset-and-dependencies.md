# MCP Apps Step 0: Reset Branch & Add SDK Dependency

**Date:** 2026-02-26  
**Status:** Draft  
**Branch:** `feat/mcp-apps-spec-support`

## Overview

Step 0 of reimplementing MCP Apps support using the official `@modelcontextprotocol/ext-apps` SDK. This step resets the branch to `origin/main` (removing ~5500 lines of custom MCP Apps code across 46 files) and adds the SDK as a dependency in `apps/mesh/`.

## Context

- **Current state:** `feat/mcp-apps-spec-support` has 15 commits ahead of `origin/main` with a fully custom MCP Apps implementation
- **Goal:** Start fresh using the official SDK instead of maintaining custom types, renderers, and protocol logic
- **Files removed by reset:** `types.ts`, `mcp-app-model.ts`, `mcp-app-renderer.tsx`, `csp-injector.ts`, `resource-loader.ts`, all `ui-widgets/`, `mcp-app-loader.tsx`, and related chat/tool-call integration

---

## 1. Reset the Branch

### Command

```bash
git reset --hard origin/main
```

**Run from:** Repository root (`/Users/gimenes/code/mesh/.worktrees/mesh-mcp-apps-spec-support`)

### Expected Outcome

- Working tree matches `origin/main` exactly
- All 15 commits on `feat/mcp-apps-spec-support` are removed from the branch history (they remain in reflog for ~90 days)
- All custom MCP Apps code is deleted:
  - `apps/mesh/src/mcp-apps/` (types, model, renderer, csp-injector, resource-loader, tests)
  - `apps/mesh/src/tools/ui-widgets/` (20+ widget tools)
  - `apps/mesh/src/web/components/chat/message/parts/mcp-app-loader.tsx`
  - MCP Apps integration in `generic.tsx`, `resources-tab.tsx`, `tools/index.ts`, etc.

### Verification

```bash
git status
# Expected: "nothing to commit, working tree clean"

git log --oneline -3
# Expected: Same as origin/main

git diff origin/main
# Expected: (no output)
```

---

## 2. Install the SDK

### Command

```bash
cd apps/mesh && bun add @modelcontextprotocol/ext-apps
```

**Run from:** Repository root, or `apps/mesh/` directly

### Expected Outcome

- `@modelcontextprotocol/ext-apps` added to `apps/mesh/package.json` under `dependencies`
- `bun.lockb` (or `package-lock.json` / `yarn.lock` if used) updated
- SDK version: latest (e.g. `^1.1.2` as of 2026-02)

### Verification

```bash
# 1. Check package.json
grep -A1 '"@modelcontextprotocol/ext-apps"' apps/mesh/package.json
# Expected: "@modelcontextprotocol/ext-apps": "^1.x.x"

# 2. Ensure lockfile is consistent
bun install
# Expected: No changes (or minimal lockfile updates)

# 3. Confirm package resolves
bun pm ls | grep ext-apps
# Expected: @modelcontextprotocol/ext-apps listed
```

---

## 3. Verify Build & Types

### Commands

```bash
bun run check
# TypeScript type checking across all workspaces

bun run fmt
# Format code (Biome)

bun run lint
# Lint (oxlint + custom plugins)
```

### Expected Outcome

- `bun run check` exits 0 — no type errors
- `bun run fmt` and `bun run lint` pass
- No new errors introduced by adding the dependency (the SDK has peer deps: `@modelcontextprotocol/sdk`, `react`, `react-dom`, `zod` — all already present in `apps/mesh`)

### Peer Dependencies

The SDK declares peer dependencies compatible with mesh:

| Peer | Required | Mesh Version |
|------|----------|--------------|
| `@modelcontextprotocol/sdk` | ^1.24.0 | 1.26.0 ✓ |
| `react` | ^17 \|\| ^18 \|\| ^19 | ^19.2.0 ✓ |
| `react-dom` | ^17 \|\| ^18 \|\| ^19 | ^19.2.0 ✓ |
| `zod` | ^3.25.0 \|\| ^4.0.0 | ^4.0.0 ✓ |

---

## Key SDK Exports (Reference)

Document for use in subsequent steps.

### Host-side (app-bridge)

```typescript
import {
  AppBridge,
  PostMessageTransport,
  getToolUiResourceUri,
  isToolVisibilityAppOnly,
  isToolVisibilityModelOnly,
  buildAllowAttribute,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/ext-apps/app-bridge";
```

### Constants & Types (app module)

```typescript
import {
  RESOURCE_MIME_TYPE,        // "text/html;profile=mcp-app"
  RESOURCE_URI_META_KEY,     // "ui/resourceUri"
  TOOL_INPUT_METHOD,
  TOOL_RESULT_METHOD,
  TOOL_INPUT_PARTIAL_METHOD,
  TOOL_CANCELLED_METHOD,
  SIZE_CHANGED_METHOD,
  INITIALIZE_METHOD,
  INITIALIZED_METHOD,
  HOST_CONTEXT_CHANGED_METHOD,
  MESSAGE_METHOD,
  OPEN_LINK_METHOD,
  REQUEST_DISPLAY_MODE_METHOD,
  RESOURCE_TEARDOWN_METHOD,
  DOWNLOAD_FILE_METHOD,
  SANDBOX_PROXY_READY_METHOD,
  SANDBOX_RESOURCE_READY_METHOD,
} from "@modelcontextprotocol/ext-apps";
```

### Types

```typescript
import type {
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiDisplayMode,
  McpUiInitializeResult,
  McpUiToolInputNotification,
  McpUiToolResultNotification,
  McpUiSizeChangedNotification,
  McpUiResourceMeta,
  McpUiHostContextChangedNotification,
  McpUiToolCancelledNotification,
} from "@modelcontextprotocol/ext-apps";
```

### React Hooks (optional, for view-side apps)

```typescript
import {
  useApp,
  useAutoResize,
  useDocumentTheme,
  useHostStyles,  // or useHostStyleVariables
} from "@modelcontextprotocol/ext-apps/react";
```

### Server Helpers (for MCP server registration)

```typescript
import {
  registerAppTool,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Other branches depend on current commits** | `origin/feat/mcp-apps-spec-support` exists; anyone who branched from this worktree will have divergent history. Coordinate with team before reset. |
| **Lost work** | Commits remain in reflog (`git reflog`) for ~90 days. Create a backup branch first: `git branch backup-mcp-apps-custom HEAD` |
| **Lockfile conflicts** | Run `bun install` from repo root after adding the dependency to ensure workspace consistency |
| **SDK version drift** | Pin to a specific minor (e.g. `^1.1.0`) to avoid unexpected breaking changes; upgrade deliberately in later steps |

---

## Pre-Reset Checklist (Optional)

Before running `git reset --hard origin/main`:

1. [ ] Create backup branch: `git branch backup-mcp-apps-custom HEAD`
2. [ ] Confirm no uncommitted work: `git status`
3. [ ] Notify team if others may have branched from `feat/mcp-apps-spec-support`
4. [ ] Ensure `origin/main` is up to date: `git fetch origin && git log origin/main -1`

---

## Post-Step Verification Summary

| Check | Command | Expected |
|-------|---------|----------|
| Branch matches main | `git diff origin/main` | No output |
| SDK in package.json | `grep ext-apps apps/mesh/package.json` | Match |
| Types pass | `bun run check` | Exit 0 |
| Format | `bun run fmt` | No changes |
| Lint | `bun run lint` | Pass |

---

## Next Steps (Step 1+)

After Step 0 is complete:

- **Step 1:** Integrate `AppBridge` and `PostMessageTransport` for iframe-based tool UI rendering in chat
- **Step 2:** Use `getToolUiResourceUri()` and `RESOURCE_URI_META_KEY` to detect tools with UI resources
- **Step 3:** Wire tool input/result notifications via `TOOL_INPUT_METHOD` / `TOOL_RESULT_METHOD`
- **Step 4:** Apply `buildAllowAttribute()` for iframe sandbox CSP

See subsequent plan documents for detailed implementation.
