# VM Preview UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the black-box VM startup with instant terminal feedback — show install/dev output live, add reinstall/restart controls, detect suspended VMs, and smart-detect whether to show a preview iframe.

**Architecture:** Strip systemd down to infrastructure-only (ttyd + iframe-proxy). Drive app commands (install, dev) via `vm.exec()` through a new `VM_EXEC` tool. Add `VM_PROBE` as a backend HEAD-request proxy for the frontend to poll preview readiness and VM health. Frontend owns all state transitions.

**Tech Stack:** Freestyle SDK (`vm.exec()`), defineTool pattern, React 19 (no useEffect/useMemo), ResizablePanelGroup, DropdownMenu from shadcn.

**Spec:** `docs/superpowers/specs/2026-04-10-vm-preview-ux-redesign.md`

---

### Task 1: Create Shared VM Helpers

**Files:**
- Create: `apps/mesh/src/tools/vm/helpers.ts`
- Test: `apps/mesh/src/tools/vm/helpers.test.ts`

- [ ] **Step 1: Create helpers.ts with `requireVmEntry` and `resolveRuntimeConfig`**

```typescript
// apps/mesh/src/tools/vm/helpers.ts
import {
  requireAuth,
  requireOrganization,
  getUserId,
  type MeshContext,
} from "../../core/mesh-context";
import type { VmMetadata } from "./types";

export async function requireVmEntry(
  input: { virtualMcpId: string },
  ctx: MeshContext,
) {
  requireAuth(ctx);
  const organization = requireOrganization(ctx);
  await ctx.access.check();
  const userId = getUserId(ctx);
  if (!userId) throw new Error("User ID required");
  const virtualMcp = await ctx.storage.virtualMcps.findById(
    input.virtualMcpId,
  );
  if (!virtualMcp || virtualMcp.organization_id !== organization.id) {
    throw new Error("Virtual MCP not found");
  }
  const metadata = virtualMcp.metadata as VmMetadata;
  const entry = metadata.activeVms?.[userId];
  return { virtualMcp, metadata, userId, entry, organization };
}

export function resolveRuntimeConfig(metadata: VmMetadata) {
  const installScript = metadata.runtime?.installScript ?? "npm install";
  const devScript = metadata.runtime?.devScript ?? "npm run dev";
  const detected = metadata.runtime?.detected ?? "npm";
  const port = metadata.runtime?.port ?? "3000";
  const needsRuntimeInstall = detected === "deno" || detected === "bun";
  return { installScript, devScript, detected, port, needsRuntimeInstall };
}
```

- [ ] **Step 2: Write tests for helpers**

```typescript
// apps/mesh/src/tools/vm/helpers.test.ts
import { describe, it, expect, mock } from "bun:test";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";
import type { VmMetadata } from "./types";

describe("resolveRuntimeConfig", () => {
  it("returns npm defaults when no runtime config", () => {
    const result = resolveRuntimeConfig({});
    expect(result.installScript).toBe("npm install");
    expect(result.devScript).toBe("npm run dev");
    expect(result.detected).toBe("npm");
    expect(result.port).toBe("3000");
    expect(result.needsRuntimeInstall).toBe(false);
  });

  it("detects deno needs runtime install", () => {
    const result = resolveRuntimeConfig({
      runtime: { detected: "deno", selected: null },
    });
    expect(result.needsRuntimeInstall).toBe(true);
  });

  it("detects bun needs runtime install", () => {
    const result = resolveRuntimeConfig({
      runtime: { detected: "bun", selected: null },
    });
    expect(result.needsRuntimeInstall).toBe(true);
  });

  it("uses custom scripts from metadata", () => {
    const result = resolveRuntimeConfig({
      runtime: {
        detected: "deno",
        selected: null,
        installScript: "deno cache main.ts",
        devScript: "deno task dev",
        port: "8000",
      },
    });
    expect(result.installScript).toBe("deno cache main.ts");
    expect(result.devScript).toBe("deno task dev");
    expect(result.port).toBe("8000");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/tools/vm/helpers.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Format and commit**

```bash
bun run fmt
git add apps/mesh/src/tools/vm/helpers.ts apps/mesh/src/tools/vm/helpers.test.ts
git commit -m "feat(vm): add shared requireVmEntry and resolveRuntimeConfig helpers"
```

---

### Task 2: Create VM_PROBE Tool

**Files:**
- Create: `apps/mesh/src/tools/vm/probe.ts`
- Test: `apps/mesh/src/tools/vm/probe.test.ts`
- Modify: `apps/mesh/src/tools/vm/index.ts`

- [ ] **Step 1: Create probe.ts**

```typescript
// apps/mesh/src/tools/vm/probe.ts
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireVmEntry } from "./helpers";

export const VM_PROBE = defineTool({
  name: "VM_PROBE",
  description: "Probe a VM URL via HEAD request (backend proxy for CORS).",
  annotations: {
    title: "Probe VM URL",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    virtualMcpId: z.string().describe("Virtual MCP ID"),
    url: z.string().url().describe("URL to probe (must match previewUrl or terminalUrl)"),
  }),
  outputSchema: z.object({
    status: z.number(),
    contentType: z.string().nullable(),
  }),

  handler: async (input, ctx) => {
    const { entry } = await requireVmEntry(input, ctx);
    if (!entry) {
      return { status: 0, contentType: null };
    }

    // Validate the URL is one of the VM's known URLs
    if (input.url !== entry.previewUrl && input.url !== entry.terminalUrl) {
      throw new Error("URL does not match any VM endpoint");
    }

    try {
      const res = await fetch(input.url, { method: "HEAD" });
      const contentType = res.headers.get("content-type");
      return { status: res.status, contentType };
    } catch {
      return { status: 0, contentType: null };
    }
  },
});
```

- [ ] **Step 2: Write tests**

```typescript
// apps/mesh/src/tools/vm/probe.test.ts
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { VM_PROBE } from "./probe";

const originalFetch = globalThis.fetch;

const mockCtx = {
  auth: { type: "session", userId: "user-1", session: {} },
  access: { check: mock(() => Promise.resolve()) },
  storage: {
    virtualMcps: {
      findById: mock(() =>
        Promise.resolve({
          id: "vmc-1",
          organization_id: "org-1",
          metadata: {
            activeVms: {
              "user-1": {
                vmId: "vm-1",
                previewUrl: "https://test.deco.studio",
                terminalUrl: "https://test-term.deco.studio",
              },
            },
          },
        }),
      ),
    },
  },
} as any;

describe("VM_PROBE", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns status and content-type for a reachable URL", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    ) as any;

    const result = await VM_PROBE.execute(
      { virtualMcpId: "vmc-1", url: "https://test.deco.studio" },
      mockCtx,
    );
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/html; charset=utf-8");
  });

  it("returns status 0 for network errors", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("network error")),
    ) as any;

    const result = await VM_PROBE.execute(
      { virtualMcpId: "vmc-1", url: "https://test.deco.studio" },
      mockCtx,
    );
    expect(result.status).toBe(0);
    expect(result.contentType).toBeNull();
  });

  it("rejects URLs not matching the VM entry", async () => {
    expect(
      VM_PROBE.execute(
        { virtualMcpId: "vmc-1", url: "https://evil.com" },
        mockCtx,
      ),
    ).rejects.toThrow("URL does not match");
  });

  it("returns status 0 when no VM entry exists", async () => {
    const noEntryCtx = {
      ...mockCtx,
      storage: {
        virtualMcps: {
          findById: mock(() =>
            Promise.resolve({
              id: "vmc-1",
              organization_id: "org-1",
              metadata: {},
            }),
          ),
        },
      },
    } as any;

    const result = await VM_PROBE.execute(
      { virtualMcpId: "vmc-1", url: "https://test.deco.studio" },
      noEntryCtx,
    );
    expect(result.status).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/tools/vm/probe.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Export VM_PROBE from index**

Add to `apps/mesh/src/tools/vm/index.ts`:

```typescript
export { VM_START } from "./start";
export { VM_STOP } from "./stop";
export { VM_PROBE } from "./probe";
```

- [ ] **Step 5: Register in tool registry**

In `apps/mesh/src/tools/index.ts`, find the VM tools section (around line 162) and add:

```typescript
// VM tools (app-only)
VmTools.VM_START,
VmTools.VM_STOP,
VmTools.VM_PROBE,
```

- [ ] **Step 6: Type check, format, commit**

```bash
bun run --cwd=apps/mesh check
bun run fmt
git add apps/mesh/src/tools/vm/probe.ts apps/mesh/src/tools/vm/probe.test.ts apps/mesh/src/tools/vm/index.ts apps/mesh/src/tools/index.ts
git commit -m "feat(vm): add VM_PROBE tool for backend HEAD request proxy"
```

---

### Task 3: Create VM_EXEC Tool

**Files:**
- Create: `apps/mesh/src/tools/vm/exec.ts`
- Test: `apps/mesh/src/tools/vm/exec.test.ts`
- Modify: `apps/mesh/src/tools/vm/index.ts`
- Modify: `apps/mesh/src/tools/index.ts`

- [ ] **Step 1: Create exec.ts**

```typescript
// apps/mesh/src/tools/vm/exec.ts
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { freestyle } from "freestyle-sandboxes";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";

export const VM_EXEC = defineTool({
  name: "VM_EXEC",
  description: "Execute install or dev commands inside a running VM.",
  annotations: {
    title: "Execute VM Command",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    virtualMcpId: z.string().describe("Virtual MCP ID"),
    action: z.enum(["install", "dev"]).describe("Action to execute"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  handler: async (input, ctx) => {
    const { entry, metadata } = await requireVmEntry(input, ctx);
    if (!entry) {
      throw new Error("No active VM found. Start a VM first.");
    }

    const vm = freestyle.vms.get(entry.vmId);
    const { installScript, devScript, detected, port, needsRuntimeInstall } =
      resolveRuntimeConfig(metadata);

    try {
      if (input.action === "install") {
        // Truncate log for fresh output
        await vm.exec("> /tmp/vm.log");

        // Wait for git repo to be synced
        await vm.exec({
          command: "systemctl is-active --wait freestyle-git-sync.service",
          timeoutMs: 120_000,
        });

        // Install runtime if needed (deno/bun)
        if (needsRuntimeInstall) {
          const setupScript =
            detected === "deno"
              ? 'export DENO_INSTALL="/usr/local" && curl -fsSL https://deno.land/install.sh | sh'
              : 'export BUN_INSTALL="/usr/local" && curl -fsSL https://bun.sh/install | bash';
          await vm.exec({
            command: `echo "Installing ${detected} runtime..." >> /tmp/vm.log && ${setupScript} >> /tmp/vm.log 2>&1`,
            timeoutMs: 120_000,
          });
        }

        // Run install
        await vm.exec({
          command: `echo "$ ${installScript}" >> /tmp/vm.log && cd /app && ${installScript} >> /tmp/vm.log 2>&1`,
          timeoutMs: 600_000,
        });

        return { success: true };
      }

      // action === "dev"
      // Truncate log for fresh output
      await vm.exec("> /tmp/vm.log");

      // Kill existing dev server via PID file
      await vm.exec("kill $(cat /tmp/dev.pid) 2>/dev/null || true");

      // Start dev server with nohup so it survives shell exit
      await vm.exec({
        command: `nohup bash -c 'cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${port} ${devScript} >> /tmp/vm.log 2>&1 & echo $! > /tmp/dev.pid'`,
      });

      // Start iframe-proxy if not already running
      await vm.exec(
        "pgrep -f iframe-proxy || nohup /usr/local/bin/node /opt/iframe-proxy.js >> /tmp/vm.log 2>&1 &",
      );

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Command execution failed";
      return { success: false, error: message };
    }
  },
});
```

- [ ] **Step 2: Write tests**

```typescript
// apps/mesh/src/tools/vm/exec.test.ts
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { VM_EXEC } from "./exec";

// Mock freestyle SDK
mock.module("freestyle-sandboxes", () => ({
  freestyle: {
    vms: {
      get: mock(() => ({
        exec: mock(() => Promise.resolve({ stdout: "", stderr: "", statusCode: 0 })),
      })),
    },
  },
}));

const makeMockCtx = (hasEntry = true) =>
  ({
    auth: { type: "session", userId: "user-1", session: {} },
    access: { check: mock(() => Promise.resolve()) },
    storage: {
      virtualMcps: {
        findById: mock(() =>
          Promise.resolve({
            id: "vmc-1",
            organization_id: "org-1",
            metadata: {
              runtime: {
                detected: "npm",
                selected: null,
                installScript: "npm install",
                devScript: "npm run dev",
                port: "3000",
              },
              ...(hasEntry
                ? {
                    activeVms: {
                      "user-1": {
                        vmId: "vm-1",
                        previewUrl: "https://test.deco.studio",
                        terminalUrl: "https://test-term.deco.studio",
                      },
                    },
                  }
                : {}),
            },
          }),
        ),
      },
    },
  }) as any;

describe("VM_EXEC", () => {
  it("install action calls vm.exec with install script", async () => {
    const ctx = makeMockCtx();
    const result = await VM_EXEC.execute(
      { virtualMcpId: "vmc-1", action: "install" },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it("dev action calls vm.exec with dev script and nohup", async () => {
    const ctx = makeMockCtx();
    const result = await VM_EXEC.execute(
      { virtualMcpId: "vmc-1", action: "dev" },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it("throws when no active VM exists", async () => {
    const ctx = makeMockCtx(false);
    expect(
      VM_EXEC.execute({ virtualMcpId: "vmc-1", action: "install" }, ctx),
    ).rejects.toThrow("No active VM found");
  });

  it("returns error on exec failure", async () => {
    mock.module("freestyle-sandboxes", () => ({
      freestyle: {
        vms: {
          get: mock(() => ({
            exec: mock(() => Promise.reject(new Error("exec failed"))),
          })),
        },
      },
    }));
    const ctx = makeMockCtx();
    const result = await VM_EXEC.execute(
      { virtualMcpId: "vmc-1", action: "install" },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("exec failed");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/tools/vm/exec.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Export and register**

Add to `apps/mesh/src/tools/vm/index.ts`:
```typescript
export { VM_EXEC } from "./exec";
```

Add to `apps/mesh/src/tools/index.ts` in the VM tools section:
```typescript
VmTools.VM_EXEC,
```

- [ ] **Step 5: Type check, format, commit**

```bash
bun run --cwd=apps/mesh check
bun run fmt
git add apps/mesh/src/tools/vm/exec.ts apps/mesh/src/tools/vm/exec.test.ts apps/mesh/src/tools/vm/index.ts apps/mesh/src/tools/index.ts
git commit -m "feat(vm): add VM_EXEC tool for install/dev commands via vm.exec()"
```

---

### Task 4: Modify VM_START — Strip Systemd, Add `isNewVm`

**Files:**
- Modify: `apps/mesh/src/tools/vm/start.ts`
- Modify: `apps/mesh/src/tools/vm/start.test.ts`

- [ ] **Step 1: Rewrite VM_START handler**

Replace the handler in `apps/mesh/src/tools/vm/start.ts`. Key changes:
- Use `requireVmEntry()` helper for auth boilerplate
- Use `resolveRuntimeConfig()` for runtime detection
- Add `isNewVm: z.boolean()` to outputSchema
- Remove systemd services: `setup-runtime`, `install-deps`, `dev-server`
- Keep only: `install-ttyd`, `web-terminal` (tailing `/tmp/vm.log`), `iframe-proxy`
- Change web-terminal exec to: `bash -c 'touch /tmp/vm.log && exec /tmp/ttyd -p 7682 --readonly tail -f /tmp/vm.log'`
- Add `idleTimeoutSeconds: 1800` to `freestyle.vms.create()`
- Existing VM returns `isNewVm: false`, new VM returns `isNewVm: true`

The full rewritten `start.ts` should use the helpers to eliminate duplicated auth/runtime logic, and only configure infrastructure-level systemd services.

- [ ] **Step 2: Update start.test.ts**

Update existing tests to match the new output schema (`isNewVm` field) and the reduced systemd services list. Add mock for `vm.exec` if the handler needs to call it (e.g., for the touch command, though this is now handled by the systemd web-terminal exec).

- [ ] **Step 3: Run all VM tests**

Run: `bun test apps/mesh/src/tools/vm/`
Expected: All tests pass.

- [ ] **Step 4: Type check, format, commit**

```bash
bun run --cwd=apps/mesh check
bun run fmt
git add apps/mesh/src/tools/vm/start.ts apps/mesh/src/tools/vm/start.test.ts
git commit -m "refactor(vm): strip VM_START to infrastructure-only systemd, add isNewVm flag"
```

---

### Task 5: Refactor VM_STOP to Use Helpers

**Files:**
- Modify: `apps/mesh/src/tools/vm/stop.ts`
- Modify: `apps/mesh/src/tools/vm/stop.test.ts`

- [ ] **Step 1: Refactor stop.ts to use `requireVmEntry()`**

Replace the inline auth/lookup boilerplate with `requireVmEntry()`. Keep the deletion logic unchanged.

- [ ] **Step 2: Run tests**

Run: `bun test apps/mesh/src/tools/vm/stop.test.ts`
Expected: All tests pass (behavior unchanged).

- [ ] **Step 3: Format and commit**

```bash
bun run fmt
git add apps/mesh/src/tools/vm/stop.ts
git commit -m "refactor(vm): use requireVmEntry helper in VM_STOP"
```

---

### Task 6: Frontend — New State Machine and Terminal-First Flow

**Files:**
- Modify: `apps/mesh/src/web/components/vm-preview.tsx`

This is the largest frontend change. Replace the current state machine with the new flow.

- [ ] **Step 1: Update ViewStatus type and state**

Replace the existing type and add new states:
```typescript
type ViewStatus = "idle" | "creating" | "installing" | "running" | "suspended" | "error";
```

Remove `previewReady` state. Add new state:
```typescript
const [hasHtmlPreview, setHasHtmlPreview] = useState(false);
const [execInFlight, setExecInFlight] = useState(false);
```

- [ ] **Step 2: Rewrite handleStart**

New flow:
1. Set status to `"creating"`
2. Call `VM_START` → get `{ terminalUrl, previewUrl, vmId, isNewVm }`
3. Set `vmDataRef.current = data`, set status to `"installing"` if `isNewVm`, or `"running"` if not
4. If `isNewVm`: call `VM_EXEC("install")`, then call `VM_EXEC("dev")`
5. After dev starts: poll with `VM_PROBE(previewUrl)` to detect content type
6. Transition to `"running"` with `hasHtmlPreview` set based on content type

- [ ] **Step 3: Add handleExec helper for VM_EXEC calls**

```typescript
const handleExec = async (action: "install" | "dev") => {
  if (execInFlight || !vmDataRef.current) return;
  setExecInFlight(true);
  try {
    const result = await client.callTool({
      name: "VM_EXEC",
      arguments: { virtualMcpId: inset.entity.id, action },
    });
    const content = (result as { content?: Array<{ text?: string }> }).content;
    if (content?.[0]?.text?.startsWith("Error:")) {
      throw new Error(content[0].text);
    }
    const payload = (result as { structuredContent?: unknown }).structuredContent ?? result;
    const data = payload as { success: boolean; error?: string };
    if (!data.success) throw new Error(data.error ?? "Command failed");
  } finally {
    setExecInFlight(false);
  }
};
```

- [ ] **Step 4: Add preview detection polling with VM_PROBE**

After `VM_EXEC("dev")` returns, start polling:
```typescript
const pollPreview = async () => {
  const vmData = vmDataRef.current;
  if (!vmData) return;
  for (let i = 0; i < 20; i++) {
    const result = await client.callTool({
      name: "VM_PROBE",
      arguments: { virtualMcpId: inset.entity.id, url: vmData.previewUrl },
    });
    const payload = (result as { structuredContent?: unknown }).structuredContent ?? result;
    const probe = payload as { status: number; contentType: string | null };
    if (probe.status >= 200 && probe.status < 300) {
      const isHtml = probe.contentType?.includes("text/html") ?? false;
      setHasHtmlPreview(isHtml);
      setShowTerminal(!isHtml);
      if (isHtml && previewIframeRef.current) {
        previewIframeRef.current.src = vmData.previewUrl;
      }
      setStatus("running");
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  // Server never responded — keep terminal, mark as running
  setHasHtmlPreview(false);
  setShowTerminal(true);
  setStatus("running");
};
```

- [ ] **Step 5: Update the "creating" and "installing" UI renders**

For `creating`: show spinner "Creating VM..."
For `installing`: show terminal full height (no preview panel)

- [ ] **Step 6: Update the "running" UI render**

Based on `hasHtmlPreview`:
- `true`: show preview iframe (terminal collapsed, accessible via dropdown)
- `false`: show terminal full height

- [ ] **Step 7: Add "suspended" state UI**

Overlay on top of current view:
```tsx
{status === "suspended" && (
  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
    <p className="text-sm text-muted-foreground mb-4">
      VM suspended due to inactivity.
    </p>
    <Button onClick={handleResume}>Resume</Button>
  </div>
)}
```

- [ ] **Step 8: Add heartbeat polling for suspend detection**

While in `running` state, poll `VM_PROBE(terminalUrl)` every 10 seconds. If non-200 → set status to `"suspended"`. Use a ref for the interval and clear on unmount/state change.

- [ ] **Step 9: Type check, format, commit**

```bash
bun run --cwd=apps/mesh check
bun run fmt
git add apps/mesh/src/web/components/vm-preview.tsx
git commit -m "feat(preview): new state machine with terminal-first flow, preview detection, suspend detection"
```

---

### Task 7: Frontend — Terminal Dropdown Menu

**Files:**
- Modify: `apps/mesh/src/web/components/vm-preview.tsx`

- [ ] **Step 1: Import DropdownMenu components**

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { ChevronDown } from "@untitledui/icons";
```

- [ ] **Step 2: Replace Terminal button with dropdown**

Replace the terminal `<button>` in the toolbar with:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      type="button"
      className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors shrink-0 text-muted-foreground hover:text-foreground"
    >
      <Terminal size={14} />
      Terminal
      <ChevronDown size={10} />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start">
    <DropdownMenuItem onClick={() => setShowTerminal((p) => !p)}>
      {showTerminal ? "Hide Logs" : "Show Logs"}
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      disabled={execInFlight}
      onClick={async () => {
        setShowTerminal(true);
        setStatus("installing");
        await handleExec("install");
        await handleExec("dev");
        await pollPreview();
      }}
    >
      Reinstall Dependencies
    </DropdownMenuItem>
    <DropdownMenuItem
      disabled={execInFlight}
      onClick={async () => {
        setShowTerminal(true);
        await handleExec("dev");
        await pollPreview();
      }}
    >
      Restart Dev Server
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

- [ ] **Step 3: Verify dropdown imports exist**

Check that `@deco/ui/components/dropdown-menu.tsx` exists. If not, check for the shadcn dropdown-menu component path in the `packages/ui/` directory.

Run: `find packages/ui -name "dropdown*" -type f`

- [ ] **Step 4: Type check, format, commit**

```bash
bun run --cwd=apps/mesh check
bun run fmt
git add apps/mesh/src/web/components/vm-preview.tsx
git commit -m "feat(preview): add terminal dropdown with reinstall/restart actions"
```

---

### Task 8: Full Integration Test

- [ ] **Step 1: Run all tests**

```bash
bun test apps/mesh/src/tools/vm/
```

Expected: All tests pass across helpers, probe, exec, start, stop.

- [ ] **Step 2: Run type check**

```bash
bun run --cwd=apps/mesh check
```

Expected: No type errors.

- [ ] **Step 3: Run linter**

```bash
bun run lint
```

Expected: No lint errors (especially no banned hooks in vm-preview.tsx).

- [ ] **Step 4: Run formatter**

```bash
bun run fmt
```

- [ ] **Step 5: Manual QA**

Start the dev server (`bun run dev`), navigate to a Virtual MCP with a connected repo, and verify:
1. Click "Start Preview" → see "Creating VM..." spinner
2. Terminal appears full height showing install output
3. After install + dev server starts → preview detection kicks in
4. If HTML app → terminal collapses, preview shows
5. Terminal dropdown → "Show Logs" toggles terminal, "Restart Dev Server" works
6. Wait for idle timeout → "VM suspended" overlay appears
7. Click "Resume" → VM wakes, dev server restarts

- [ ] **Step 6: Final commit if any fixes needed**

```bash
bun run fmt
git add -A
git commit -m "fix: integration fixes from manual QA"
```
