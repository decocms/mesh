# VM Preview UX Redesign — Spec

## Problem

The current VM preview UX has a black box period: the user clicks "Start Preview", waits 60-90 seconds staring at a spinner, then the site suddenly appears. There's no feedback about what's happening (git sync, install, dev server startup). Additionally, there's no way to restart the dev server or reinstall dependencies without destroying the entire VM.

## Goal

Eliminate the dead time by showing the terminal immediately with live output. Give users control over install/dev lifecycle via dropdown actions.

## Architecture

```
┌─────────────┐     VM_START      ┌──────────────────────────┐
│   Frontend   │ ───────────────→ │  Mesh Backend (MCP tool)  │
│  vm-preview  │ ← { terminalUrl, │                          │
│              │    previewUrl,    │  freestyle.vms.create()  │
│              │    vmId,          │  + install ttyd (systemd)│
│              │    isNewVm }     │  + start ttyd  (systemd) │
│              │                   │  + iframe-proxy (systemd)│
│              │     VM_EXEC      │                          │
│              │ ───────────────→ │  vm.exec("npm install    │
│              │  { action:       │    >> /tmp/vm.log 2>&1") │
│              │    "install" }   │                          │
│              │ ← { success }    │  (blocks until done)     │
│              │                   │                          │
│              │     VM_EXEC      │                          │
│              │ ───────────────→ │  vm.exec("nohup ...      │
│              │  { action:       │    >> /tmp/vm.log 2>&1 &")│
│              │    "dev" }       │                          │
│              │ ← { success }    │  (nohup + bg, returns)   │
└──────┬───────┘                   └──────────────────────────┘
       │
       │ iframe
       ▼
┌──────────────────────┐
│  ttyd (read-only)    │
│  tail -f /tmp/vm.log │
│                      │
│  Shows all output    │
│  from install + dev  │
└──────────────────────┘
```

**Systemd handles only infrastructure:** ttyd (install + run) and iframe-proxy.
**`vm.exec()` handles app commands:** install dependencies, run dev server.

This keeps VM creation fast — systemd only boots 3 lightweight services instead of the current 6.

## Backend Tools

### Shared Helper: `requireVmEntry()`

Extract common auth + lookup boilerplate shared by VM_START, VM_EXEC, and VM_STOP:

```typescript
async function requireVmEntry(input: { virtualMcpId: string }, ctx: MeshContext) {
  requireAuth(ctx);
  const organization = requireOrganization(ctx);
  await ctx.access.check();
  const userId = getUserId(ctx);
  if (!userId) throw new Error("User ID required");
  const virtualMcp = await ctx.storage.virtualMcps.findById(input.virtualMcpId);
  if (!virtualMcp || virtualMcp.organization_id !== organization.id)
    throw new Error("Virtual MCP not found");
  const metadata = virtualMcp.metadata as VmMetadata;
  const entry = metadata.activeVms?.[userId];
  return { virtualMcp, metadata, userId, entry };
}
```

### Shared Helper: `resolveRuntimeConfig()`

Extract runtime detection logic shared by VM_START and VM_EXEC:

```typescript
function resolveRuntimeConfig(metadata: VmMetadata) {
  const installScript = metadata.runtime?.installScript ?? "npm install";
  const devScript = metadata.runtime?.devScript ?? "npm run dev";
  const detected = metadata.runtime?.detected ?? "npm";
  const port = metadata.runtime?.port ?? "3000";
  const needsRuntimeInstall = detected === "deno" || detected === "bun";
  return { installScript, devScript, detected, port, needsRuntimeInstall };
}
```

### VM_START (modified)

Stripped down to create VM fast. Only systemd services: `install-ttyd`, `web-terminal`, `iframe-proxy`.

```typescript
VM_START({
  virtualMcpId: string
})
→ {
  terminalUrl: string,   // ttyd tailing /tmp/vm.log
  previewUrl: string,    // iframe-proxy on port 9000
  vmId: string,
  isNewVm: boolean,      // true = needs install+dev, false = already running
}
```

What it does:
1. Call `requireVmEntry()` for auth + lookup
2. If existing VM entry found and reachable (non-503 HEAD check), return it with `isNewVm: false`
3. `freestyle.vms.create()` with:
   - `gitRepos` (code at `/app`)
   - `additionalFiles` (iframe-proxy.js, install-ttyd.sh)
   - `systemd`: install-ttyd, web-terminal, iframe-proxy
   - `domains`: preview + terminal subdomains
   - `idleTimeoutSeconds: 1800` (30 min idle timeout for dev workflows)
   - **No install-deps, no dev-server, no setup-runtime services**
4. Return URLs immediately with `isNewVm: true`

**web-terminal systemd command:** `bash -c 'touch /tmp/vm.log && exec /tmp/ttyd -p 7682 --readonly tail -f /tmp/vm.log'`
This guarantees the log file exists before tail starts, eliminating the race condition.

### VM_EXEC (new tool)

```typescript
VM_EXEC({
  virtualMcpId: string,
  action: "install" | "dev"
})
→ {
  success: boolean,
  error?: string,
}
```

**Auth:** Uses `requireVmEntry()`. Resolves `vmId` exclusively via `metadata.activeVms[getUserId(ctx)]` — never from user input. Throws if no entry found.

**Concurrency:** Frontend disables dropdown actions while a VM_EXEC call is in flight (via a ref guard similar to `startingRef`).

For `action: "install"`:
1. Call `requireVmEntry()` + `resolveRuntimeConfig()`
2. Truncate log: `vm.exec("> /tmp/vm.log")`
3. Wait for git sync: `vm.exec("systemctl is-active --wait freestyle-git-sync.service")`
4. If runtime needs installing (deno/bun), exec the setup script: `vm.exec("bash /opt/setup-runtime.sh >> /tmp/vm.log 2>&1")`
5. `vm.exec("cd /app && <installScript> >> /tmp/vm.log 2>&1", { timeoutMs: 600_000 })`
6. Blocks until complete, returns `{ success: true }` or `{ success: false, error }`

For `action: "dev"`:
1. Call `requireVmEntry()` + `resolveRuntimeConfig()`
2. Truncate log: `vm.exec("> /tmp/vm.log")`
3. Kill any existing dev server via PID file: `vm.exec("kill $(cat /tmp/dev.pid) 2>/dev/null || true")`
4. Start dev server with nohup + PID file:
   `vm.exec("nohup bash -c 'cd /app && <devScript> >> /tmp/vm.log 2>&1 & echo $! > /tmp/dev.pid'")`
5. Start iframe-proxy if not already running
6. Returns `{ success: true }` immediately (dev server runs in background via nohup)

### VM_STOP (unchanged)

Stays the same — kills the VM and clears the metadata entry.

## Frontend UX Flow

### State Machine

```
idle → creating → installing → running → error
```

State transitions:
- `idle` → user clicks Start → call VM_START
- `creating` → show spinner "Creating VM..." → VM_START returns → if `isNewVm`: show terminal full height, call VM_EXEC("install"). If `!isNewVm`: go directly to `running`.
- `installing` → VM_EXEC("install") returns → call VM_EXEC("dev"), start polling preview URL
- `running` → preview URL responds → collapse terminal, show preview. Terminal accessible via dropdown.
- `error` → any step fails → show error with context-aware retry (retry install if install failed, retry VM_START if creation failed)

### UI States

**State 1 — Idle:** Same as current. Monitor icon + "Start Preview" button.

**State 2 — Creating:** Spinner with "Creating VM..." text while VM_START is in flight.

**State 3 — Terminal full height (installing + starting dev):**
Terminal takes full view height. Shows live output: npm install, npm run dev.

**State 4 — Running:**
Terminal collapses. Preview iframe takes full height. User can re-open terminal via dropdown.

### Preview Detection (simplified for v1)

After `VM_EXEC("dev")` returns, the frontend polls the preview URL using the existing favicon probe (every 5 seconds, no attempt limit — cleared on component unmount). When the server responds:
- Collapse terminal, show preview iframe
- Force-reload the iframe src (to clear any stale chrome-error://)

No Content-Type detection in v1. All servers get the preview iframe. Smart HTML-vs-API detection deferred to v2.

### Terminal Dropdown Menu

Replace the current Terminal toggle button with a dropdown:

```
[>_ Terminal ▾]
┌─────────────────────────┐
│  Show Logs              │  ← toggles terminal panel
│  ─────────────────────  │
│  Reinstall Dependencies │  ← VM_EXEC("install") + VM_EXEC("dev")
│  Restart Dev Server     │  ← VM_EXEC("dev")
└─────────────────────────┘
```

- **Show Logs / Hide Logs** — toggles terminal panel visibility
- **Reinstall Dependencies** — opens terminal, calls VM_EXEC("install"), then VM_EXEC("dev")
- **Restart Dev Server** — opens terminal, calls VM_EXEC("dev")

Both actions automatically open the terminal panel so the user sees the output.
All dropdown actions are disabled while a VM_EXEC call is in flight.

## Files Changed

### Backend
- **Create:** `apps/mesh/src/tools/vm/helpers.ts` — shared `requireVmEntry()` and `resolveRuntimeConfig()` helpers.
- **Modify:** `apps/mesh/src/tools/vm/start.ts` — use helpers, remove install-deps/dev-server/setup-runtime systemd services. Change ttyd to tail `/tmp/vm.log`. Add `isNewVm` to response. Set `idleTimeoutSeconds: 1800`.
- **Create:** `apps/mesh/src/tools/vm/exec.ts` — new VM_EXEC tool with install/dev actions using `vm.exec()`.
- **Modify:** `apps/mesh/src/tools/vm/stop.ts` — use `requireVmEntry()` helper.
- **Modify:** tool registry to register VM_EXEC.

### Frontend
- **Modify:** `apps/mesh/src/web/components/vm-preview.tsx` — new state machine (idle → creating → installing → running → error), terminal full height during install, dropdown menu replacing toggle button, concurrency guard on actions.

## Constraints

- `vm.exec()` is blocking — dev server must be launched with `nohup ... &` to survive shell exit
- ttyd install uses `/tmp/` due to Freestyle overlay filesystem write restrictions
- iframe-proxy remains as custom Node.js proxy (needed for X-Frame-Options stripping + visual editor script injection)
- Must wait for `freestyle-git-sync.service` before running install
- Frontend uses favicon probe for preview readiness (no CORS issues with image loads)
- `idleTimeoutSeconds: 1800` — VMs auto-suspend after 30 min idle

## Deferred to v2

- **Smart preview detection** (HEAD + Content-Type check to distinguish HTML apps vs API servers)
- **Suspended VM detection** (reliable cross-origin iframe disconnect detection + Resume button)
- **Terminal URL authentication** (ttyd `--credential` or token-based access)

## Critique Decisions

**Adopted:**
- Use `nohup` for dev server to survive shell exit (all critics flagged `&` alone as unreliable)
- Wait for git-sync before install (Docs critic: race condition with repo not cloned yet)
- PID file for dev server kill instead of `pkill -f` (fragile across runtimes)
- Extract `requireVmEntry()` and `resolveRuntimeConfig()` helpers (Duplication critic)
- Truncate log at start of each action (Performance critic: unbounded growth)
- Set `timeoutMs: 600_000` on install exec (Performance critic: timeout chain)
- Add `isNewVm` to VM_START response (Scope critic: frontend needs to skip install for existing VMs)
- Fix `touch` race by embedding in ttyd command (Correctness critic)
- Set `idleTimeoutSeconds: 1800` (Docs critic: 300s default too aggressive for dev)
- Frontend concurrency guard on VM_EXEC actions (Correctness critic)

**Adopted (scope reduction):**
- Drop `suspended` state from v1 (Scope + Correctness: cross-origin iframe can't detect WebSocket drops)
- Drop smart preview detection from v1 (Scope: over-engineered for uncertain value)

**Rejected:**
- Manage dev server via systemd instead of vm.exec — defeats the purpose (instant terminal feedback)
- postMessage origin fix — pre-existing issue, out of scope
- Terminal URL authentication — pre-existing, UUID entropy sufficient for now

**Adapted:**
- Test plan — deferred to implementation plan (writing-plans skill), not the spec
