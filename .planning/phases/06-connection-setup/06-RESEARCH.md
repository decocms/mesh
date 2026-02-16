# Phase 6: Connection Setup - Research

**Researched:** 2026-02-15
**Domain:** Inline connection wizard, path validation, tunnel auto-detection, plugin empty state UX
**Confidence:** HIGH

## Summary

Phase 6 enhances the existing site-editor plugin empty state (`plugin-empty-state.tsx`) with proper project validation and tunnel auto-detection. The current empty state already creates STDIO connections and binds them to the plugin config -- the work is adding validation (checking `tsconfig.json` and `package.json` exist) before connection creation, and auto-detecting the tunnel URL afterward.

The validation requires a new server-side tool (`FILESYSTEM_VALIDATE_PROJECT`) because the client cannot directly check if files exist on the local filesystem. The existing `FILESYSTEM_PICK_DIRECTORY` tool in `apps/mesh/src/tools/filesystem/` provides the pattern. The tool checks for the existence of `tsconfig.json` and `package.json` in the specified directory using Node.js `fs` APIs.

Tunnel auto-detection leverages the `deco link` CLI's deterministic domain pattern: `localhost-{sha1(workspace-app).slice(0,8)}.deco.host`. After connection is created, the plugin reads the project's `wrangler.toml` to extract workspace and app name, computes the tunnel domain, then polls `https://{domain}` to check if it's reachable. Once detected, the URL is persisted to connection metadata via `COLLECTION_CONNECTIONS_UPDATE` (same pattern as `useTunnelUrl` hook).

**Primary recommendation:** Extend the existing `plugin-empty-state.tsx` with validation and post-connection tunnel detection. Create one new SELF MCP tool (`FILESYSTEM_VALIDATE_PROJECT`) and one new client-side hook (`useTunnelDetection`) that polls the computed tunnel URL. No new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single-page wizard -- all inputs on one screen (path input, validation, connect button)
- Only input required: project folder path (everything else auto-detected)
- Path input includes a text field with browse button (file browser if platform supports)
- After clicking Connect: brief success confirmation (checkmark/message) before transitioning to the plugin pages view
- Validation runs on Connect button click (not on blur/typing)
- Valid project requires both `tsconfig.json` and `package.json` in the specified path
- Errors appear inline under the path input field (red text)
- Distinct error messages for different failures:
  - "Path not found" -- directory doesn't exist
  - "Not a TypeScript project (missing tsconfig.json)" -- no tsconfig
  - "Not a Node project (missing package.json)" -- no package.json
- Tunnel detection starts after connection is created (not during wizard)
- If no tunnel detected: show instructions to run `deco link` with guidance
- Background auto-poll for tunnel URL after showing instructions -- once detected, preview auto-configures
- Detected tunnel URL persists in project config for reuse across sessions
- Friendly & guiding tone: "Connect your project to start editing" style copy
- Visual: relevant icon (folder/plug) with 1-2 lines explaining what connecting does
- Wizard appears centered in the main content area (card/form where pages would normally show)
- All plugin sidebar routes (Pages, Sections, Loaders) show the same connection wizard if not connected -- consistent experience

### Claude's Discretion
- Specific icon choice for empty state
- Browse button implementation (native file picker vs. text-only fallback in web context)
- Auto-poll interval and timeout for tunnel detection
- Success confirmation animation/duration
- Exact copy/wording for all UI text

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already in Mesh -- zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 19.2.0 | UI framework | Required |
| `@tanstack/react-query` | 5.90.11 | Data fetching, polling with `refetchInterval` | Standard for all plugin UIs |
| `@decocms/mesh-sdk` | workspace:* | `useConnectionActions`, `useMCPClient`, `useProjectContext`, `SELF_MCP_ALIAS_ID` | All client plugins use this |
| `@deco/ui` | workspace:* | `Button`, `Input` components | Consistent UI |
| `@untitledui/icons` | 0.0.19 | Icons (Folder, etc.) | Used by all plugins |
| `zod` | 4.0.0 | Schema validation for tool input/output | All tools use Zod |
| `node:fs/promises` | built-in | File existence checks in validation tool | Server-side only |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `smol-toml` | (already in cli) | Parse `wrangler.toml` to extract workspace/app | Tunnel domain computation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side validation tool | Client-side fetch to check files | Cannot access local filesystem from browser. Must use MCP tool via SELF connection. |
| Polling tunnel URL | WebSocket/SSE for tunnel presence | Over-engineered for this use case. Simple HTTP polling is sufficient. |
| Reading `wrangler.toml` for tunnel domain | Hardcoded domain input | User decision: auto-detect, not manual entry. `wrangler.toml` is the source of truth for workspace+app. |

## Architecture Patterns

### Current State of Empty State

The existing `plugin-empty-state.tsx` already implements:
- Path input (text field)
- Browse button (calls `FILESYSTEM_PICK_DIRECTORY` via SELF MCP)
- STDIO connection creation (`@modelcontextprotocol/server-filesystem`)
- Plugin config binding (`PROJECT_PLUGIN_CONFIG_UPDATE`)
- Query invalidation to trigger PluginLayout re-render

What's **missing** (Phase 6 scope):
1. Path validation (checking `tsconfig.json` + `package.json`)
2. Distinct error messages for different failure types
3. Success confirmation before transitioning
4. Tunnel auto-detection after connection creation
5. `deco link` instructions when no tunnel detected

### Pattern 1: FILESYSTEM_VALIDATE_PROJECT Tool

**What:** A SELF MCP tool that validates a directory is a valid TypeScript project.
**When to use:** Called on Connect button click, before creating the STDIO connection.
**Where:** `apps/mesh/src/tools/filesystem/validate-project.ts`

```typescript
// Source: Following FILESYSTEM_PICK_DIRECTORY pattern in apps/mesh/src/tools/filesystem/pick-directory.ts
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

const InputSchema = z.object({
  path: z.string().describe("Absolute path to project directory"),
});

const OutputSchema = z.object({
  valid: z.boolean(),
  error: z
    .enum(["PATH_NOT_FOUND", "MISSING_TSCONFIG", "MISSING_PACKAGE_JSON"])
    .nullable(),
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export const FILESYSTEM_VALIDATE_PROJECT = defineTool({
  name: "FILESYSTEM_VALIDATE_PROJECT",
  description: "Validate that a directory is a valid TypeScript project",
  annotations: {
    title: "Validate Project",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: async (input, ctx) => {
    await ctx.access.check();
    requireAuth(ctx);

    const { path } = input;

    if (!(await dirExists(path))) {
      return { valid: false, error: "PATH_NOT_FOUND" };
    }

    if (!(await fileExists(join(path, "tsconfig.json")))) {
      return { valid: false, error: "MISSING_TSCONFIG" };
    }

    if (!(await fileExists(join(path, "package.json")))) {
      return { valid: false, error: "MISSING_PACKAGE_JSON" };
    }

    return { valid: true, error: null };
  },
});
```

### Pattern 2: Tunnel Domain Computation

**What:** Compute the tunnel URL from `wrangler.toml` config (workspace + app name).
**When to use:** After connection is created, to determine what tunnel URL to poll.
**Key insight:** The `deco link` CLI computes the domain deterministically:
  - Reads `wrangler.toml` for `deco.workspace` and `name`
  - Computes `sha1(workspace + "-" + app).slice(0, 8)`
  - Domain = `localhost-{hash}.deco.host`
  - Full URL = `https://localhost-{hash}.deco.host`

The plugin can read `wrangler.toml` from the project directory via the MCP connection's `READ_FILE` binding. However, at this point the connection may not have its tools populated yet (STDIO connections need to start). An alternative approach is to create a second SELF MCP tool (`FILESYSTEM_READ_TUNNEL_CONFIG`) that reads the `wrangler.toml` directly from the filesystem.

```typescript
// Tunnel domain derivation (from packages/cli/src/lib/config.ts)
import { createHash } from "crypto";

function getAppUUID(workspace: string, app: string): string {
  const combined = `${workspace}-${app}`;
  const hash = createHash("sha1");
  hash.update(combined);
  return hash.digest("hex").slice(0, 8);
}

function getAppDomain(workspace: string, app: string): string {
  return `localhost-${getAppUUID(workspace, app)}.deco.host`;
}
// Result: https://localhost-{8chars}.deco.host
```

### Pattern 3: Tunnel Auto-Poll Hook

**What:** A React hook that polls the computed tunnel URL to check reachability.
**When to use:** After connection creation, shown in a "detecting tunnel" state.
**Implementation:** Use `@tanstack/react-query` with `refetchInterval` for polling.

```typescript
// useTunnelDetection hook pattern
import { useQuery } from "@tanstack/react-query";

function useTunnelDetection(tunnelUrl: string | null) {
  return useQuery({
    queryKey: ["tunnel-detection", tunnelUrl],
    queryFn: async () => {
      if (!tunnelUrl) return { reachable: false };
      try {
        // Simple HEAD request to check if tunnel is up
        const res = await fetch(tunnelUrl, {
          method: "HEAD",
          mode: "no-cors",
          signal: AbortSignal.timeout(5000),
        });
        return { reachable: true };
      } catch {
        return { reachable: false };
      }
    },
    enabled: !!tunnelUrl,
    refetchInterval: (query) =>
      query.state.data?.reachable ? false : 3000, // Poll every 3s until reachable
    refetchIntervalInBackground: false,
  });
}
```

**CORS consideration:** The tunnel URL is on a different domain (`*.deco.host`), so `mode: "no-cors"` is needed. A `no-cors` fetch that doesn't throw means the server responded (even if opaque). Alternative: the server-side tool could do the HTTP check instead.

### Pattern 4: Reading wrangler.toml from Project Directory

**What:** A SELF MCP tool that reads and parses `wrangler.toml` from a project directory.
**When to use:** After connection creation, to derive the tunnel URL.

```typescript
// FILESYSTEM_READ_TUNNEL_CONFIG tool
// Reads wrangler.toml, extracts workspace + app name, computes tunnel domain
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "smol-toml";
import { createHash } from "crypto";

// Input: { path: "/Users/you/Projects/my-site" }
// Output: { tunnelUrl: "https://localhost-abc12345.deco.host" | null }
```

### Pattern 5: Success Confirmation Transition

**What:** Brief success state before transitioning to pages view.
**When to use:** After connection creation + config binding succeeds.
**Implementation:** Use `useState` for a `"success"` phase, `setTimeout` for auto-transition.

```typescript
const [phase, setPhase] = useState<"form" | "success">("form");

// After successful connection:
setPhase("success");
setTimeout(() => {
  // Invalidate queries to trigger PluginLayout re-render
  // This naturally transitions to the pages view
}, 1500); // 1.5s confirmation display
```

### Recommended File Changes

```
Modified files:
  apps/mesh/src/tools/filesystem/index.ts          # Export new tools
  packages/mesh-plugin-site-editor/client/
    components/plugin-empty-state.tsx                # Add validation + success state
    lib/query-keys.ts                                # Add tunnel detection keys

New files:
  apps/mesh/src/tools/filesystem/validate-project.ts # FILESYSTEM_VALIDATE_PROJECT tool
  apps/mesh/src/tools/filesystem/read-tunnel-config.ts # FILESYSTEM_READ_TUNNEL_CONFIG tool
  packages/mesh-plugin-site-editor/client/
    lib/use-tunnel-detection.ts                      # Auto-poll hook for tunnel URL
    components/tunnel-instructions.tsx               # "Run deco link" guidance UI
```

### Anti-Patterns to Avoid

- **Client-side filesystem access:** Never try to check file existence from the browser. Always go through SELF MCP tools.
- **useEffect for polling:** The project bans `useEffect`. Use `@tanstack/react-query` `refetchInterval` for polling behavior.
- **Blocking on tunnel detection:** Don't hold the wizard open waiting for tunnel. Create the connection first, then show tunnel detection as a separate post-connection concern.
- **Manual URL entry as primary flow:** The user decided auto-detection is the primary flow. Manual URL entry is a fallback (already exists in `preview-panel.tsx`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling mechanism | Custom setInterval | React Query `refetchInterval` | Handles cleanup, deduplication, background tab behavior |
| File existence checks | Client-side fetch | SELF MCP tool (`FILESYSTEM_VALIDATE_PROJECT`) | Browser cannot access local filesystem |
| TOML parsing | Custom parser | `smol-toml` (already in CLI package) | Edge cases in TOML spec |
| Tunnel domain computation | Guessing/hardcoding | Port `getAppDomain` from `packages/cli/src/lib/config.ts` | Must match CLI's exact algorithm |

**Key insight:** The tunnel domain is deterministic -- derived from `sha1(workspace-app)`. This means the plugin can compute the expected tunnel URL without the tunnel being active. It just needs the workspace and app name from `wrangler.toml`.

## Common Pitfalls

### Pitfall 1: STDIO Connection Tools Not Populated Immediately
**What goes wrong:** After creating an STDIO connection, `configuredConnection.tools` is empty because the subprocess hasn't started yet.
**Why it happens:** PluginLayout's binding check would fail for new STDIO connections. This was already addressed in Phase 1 -- `PluginLayout` now trusts `projectConfig.connectionId` directly without binding check.
**How to avoid:** Don't attempt to use the site MCP connection's tools immediately after creation. The tunnel detection tools should go through SELF MCP (filesystem tools), not the site connection.
**Warning signs:** Empty tool list on connection entity right after creation.

### Pitfall 2: CORS on Tunnel URL Polling
**What goes wrong:** `fetch("https://localhost-xxx.deco.host")` fails with CORS error in browser.
**Why it happens:** The tunnel server may not set CORS headers for the Mesh admin origin.
**How to avoid:** Two options:
  1. Use `mode: "no-cors"` -- an opaque response still means "reachable" (fetch didn't throw)
  2. Do the HTTP check server-side in a SELF MCP tool -- avoids CORS entirely
**Recommendation:** Option 2 (server-side check) is more reliable. Create a `FILESYSTEM_CHECK_TUNNEL` tool or combine with `FILESYSTEM_READ_TUNNEL_CONFIG`.
**Warning signs:** Console CORS errors, `fetch` throwing `TypeError`.

### Pitfall 3: wrangler.toml May Not Exist
**What goes wrong:** Not all TypeScript projects use Cloudflare Workers. Many projects won't have `wrangler.toml`.
**Why it happens:** The `deco link` tunnel system is specific to deco/workers projects.
**How to avoid:** If `wrangler.toml` is missing, gracefully fall back to showing manual instructions. Don't make tunnel auto-detection a hard requirement.
**Warning signs:** `FILESYSTEM_READ_TUNNEL_CONFIG` returns null -- the UI must handle this case.

### Pitfall 4: Project Path Validation Race with Browse
**What goes wrong:** User clicks browse, dialog opens, user also types in path field. Two conflicting paths.
**Why it happens:** Browse is async (OS dialog) while text input is synchronous.
**How to avoid:** Disable the text input while browse dialog is open (current code already does this with `busy` state). Keep this pattern.
**Warning signs:** Path state changing unexpectedly.

### Pitfall 5: Success Confirmation Interrupted by Query Invalidation
**What goes wrong:** After connection creation, query invalidation causes PluginLayout to re-render, removing the empty state before the success animation completes.
**Why it happens:** `queryClient.invalidateQueries` for connections/plugin-config triggers immediate re-render.
**How to avoid:** Delay the query invalidation until after the success confirmation timeout. Or: show the success confirmation in a way that survives PluginLayout's re-render (e.g., using a portal or routing state).
**Warning signs:** Flash of success state that disappears too quickly.

## Code Examples

### Existing Empty State Connection Flow (Current Code)

```typescript
// Source: packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx
// Current flow: path input -> create STDIO connection -> bind to plugin config -> invalidate queries

const handleConnect = async (e: React.FormEvent) => {
  e.preventDefault();
  const trimmed = path.trim();
  if (!trimmed) return;
  setIsConnecting(true);
  setError(null);

  try {
    const folderName = trimmed.split("/").filter(Boolean).pop() ?? "site";

    // 1. Create the STDIO connection
    const newConnection = await create.mutateAsync({
      title: `Site: ${folderName}`,
      connection_type: "STDIO",
      connection_headers: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", trimmed],
      },
    });

    // 2. Bind the new connection to this plugin via project config
    await selfClient.callTool({
      name: "PROJECT_PLUGIN_CONFIG_UPDATE",
      arguments: { projectId: project.id, pluginId, connectionId: newConnection.id },
    });

    // 3. Invalidate queries so PluginLayout re-renders
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KEYS.connections(locator) }),
      queryClient.invalidateQueries({ queryKey: ["project-plugin-config", project.id, pluginId] }),
    ]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to create connection");
  } finally {
    setIsConnecting(false);
  }
};
```

### Phase 6 Enhanced Flow (Pseudocode)

```typescript
// Phase 6 additions: validate -> create -> success -> detect tunnel

const handleConnect = async (e: React.FormEvent) => {
  e.preventDefault();
  const trimmed = path.trim();
  if (!trimmed) return;
  setIsConnecting(true);
  setError(null);

  try {
    // NEW: Step 0 - Validate project
    const validation = await selfClient.callTool({
      name: "FILESYSTEM_VALIDATE_PROJECT",
      arguments: { path: trimmed },
    });
    const result = validation.structuredContent as { valid: boolean; error: string | null };
    if (!result.valid) {
      const errorMap = {
        PATH_NOT_FOUND: "Path not found",
        MISSING_TSCONFIG: "Not a TypeScript project (missing tsconfig.json)",
        MISSING_PACKAGE_JSON: "Not a Node project (missing package.json)",
      };
      setError(errorMap[result.error as keyof typeof errorMap] ?? "Invalid project");
      return;
    }

    // Steps 1-2: Same as current (create connection + bind config)
    // ...

    // NEW: Step 3 - Show success, delay invalidation
    setPhase("success");
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Step 4: Invalidate (triggers PluginLayout to show pages)
    await invalidateQueries();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to create connection");
  } finally {
    setIsConnecting(false);
  }
};
```

### Tunnel Config Reading Tool Pattern

```typescript
// Source: Derived from packages/cli/src/lib/config.ts getAppDomain pattern
// This tool reads wrangler.toml from the project path and computes the tunnel URL

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "crypto";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

function computeTunnelUrl(workspace: string, app: string): string {
  const hash = createHash("sha1").update(`${workspace}-${app}`).digest("hex").slice(0, 8);
  return `https://localhost-${hash}.deco.host`;
}

export const FILESYSTEM_READ_TUNNEL_CONFIG = defineTool({
  name: "FILESYSTEM_READ_TUNNEL_CONFIG",
  description: "Read wrangler.toml and compute the tunnel URL for a project",
  inputSchema: z.object({
    path: z.string().describe("Absolute path to project directory"),
  }),
  outputSchema: z.object({
    tunnelUrl: z.string().nullable(),
    workspace: z.string().nullable(),
    app: z.string().nullable(),
  }),
  handler: async (input, ctx) => {
    await ctx.access.check();
    requireAuth(ctx);
    try {
      // smol-toml parse is needed here
      const { parse } = await import("smol-toml");
      const content = await readFile(join(input.path, "wrangler.toml"), "utf-8");
      const config = parse(content);
      const workspace = (config.deco as Record<string, unknown>)?.workspace as string | undefined;
      const app = (config.name as string) ?? "my-app";
      if (!workspace) return { tunnelUrl: null, workspace: null, app };
      return {
        tunnelUrl: computeTunnelUrl(workspace, app),
        workspace,
        app,
      };
    } catch {
      return { tunnelUrl: null, workspace: null, app: null };
    }
  },
});
```

### Error Message Mapping

```typescript
// Source: User decisions from CONTEXT.md
const ERROR_MESSAGES: Record<string, string> = {
  PATH_NOT_FOUND: "Path not found",
  MISSING_TSCONFIG: "Not a TypeScript project (missing tsconfig.json)",
  MISSING_PACKAGE_JSON: "Not a Node project (missing package.json)",
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redirect to project settings for connection | Inline wizard in plugin empty state | Phase 1 (prior decision) | Connection happens within the plugin UI |
| Manual tunnel URL entry | Auto-detect from `wrangler.toml` | Phase 6 (this phase) | Eliminates manual URL entry |
| Binding check on connection lookup | Trust `projectConfig.connectionId` directly | Phase 1 (prior fix) | STDIO connections work immediately |

**Context on existing code:**
- `plugin-empty-state.tsx` already exists with working connection creation
- `use-tunnel-url.ts` already reads/writes `previewUrl` from connection metadata
- `preview-panel.tsx` already shows manual URL entry when no tunnel URL configured
- `FILESYSTEM_PICK_DIRECTORY` tool already provides the pattern for new filesystem tools

## Open Questions

1. **smol-toml in server bundle**
   - What we know: `smol-toml` is already a dependency of `packages/cli`. The server tools in `apps/mesh/src/tools/filesystem/` would need to import it.
   - What's unclear: Whether `smol-toml` is available in the mesh server's dependency tree or needs to be added to `apps/mesh/package.json`.
   - Recommendation: Check `apps/mesh/package.json` dependencies. If not present, add it. It's a small, zero-dependency TOML parser.

2. **Tunnel reachability check: client-side vs server-side**
   - What we know: Client-side `fetch` with `mode: "no-cors"` can detect reachability but provides no response body. Server-side HTTP check avoids CORS.
   - What's unclear: Whether `no-cors` opaque responses are reliable enough across browsers for tunnel detection.
   - Recommendation: Use a server-side SELF MCP tool for the HTTP check. More reliable, no CORS issues. Combine with `FILESYSTEM_READ_TUNNEL_CONFIG` or create a separate `FILESYSTEM_CHECK_TUNNEL_REACHABLE` tool.

3. **Projects without wrangler.toml**
   - What we know: Not all TypeScript projects are deco/workers projects. Some use plain Vite, Next.js, etc.
   - What's unclear: What percentage of target users have `wrangler.toml` in their projects.
   - Recommendation: Gracefully handle missing `wrangler.toml`. If not found, skip auto-detection and show manual instructions (the existing `preview-panel.tsx` URL input serves as the fallback). Don't block the connection wizard on tunnel availability.

## Sources

### Primary (HIGH confidence)
- `packages/mesh-plugin-site-editor/client/components/plugin-empty-state.tsx` -- Current empty state implementation
- `apps/mesh/src/tools/filesystem/pick-directory.ts` -- Pattern for filesystem tools
- `apps/mesh/src/web/layouts/plugin-layout.tsx` -- PluginLayout connection resolution
- `packages/cli/src/lib/config.ts` -- `getAppDomain`, `getAppUUID`, tunnel domain derivation
- `packages/cli/src/commands/dev/link.ts` -- `deco link` tunnel registration
- `packages/mesh-plugin-site-editor/client/lib/use-tunnel-url.ts` -- Existing tunnel URL hook
- `apps/mesh/src/tools/projects/plugin-config-update.ts` -- PROJECT_PLUGIN_CONFIG_UPDATE tool

### Secondary (MEDIUM confidence)
- `@tanstack/react-query` `refetchInterval` for polling -- Verified in React Query v5 docs (standard pattern)
- `mode: "no-cors"` fetch behavior -- Standard web platform behavior (opaque response = reachable)

### Tertiary (LOW confidence)
- `smol-toml` availability in mesh server bundle -- Needs verification at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already in use, zero new dependencies needed
- Architecture: HIGH -- Extending existing patterns (filesystem tools, plugin empty state, tunnel URL hook)
- Pitfalls: HIGH -- Based on direct codebase analysis (STDIO tool population timing, CORS, wrangler.toml absence)

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable domain, no external dependencies changing)
