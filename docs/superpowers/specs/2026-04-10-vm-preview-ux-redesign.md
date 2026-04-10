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
│              │    vmId }         │  + install ttyd (systemd)│
│              │                   │  + start ttyd  (systemd) │
│              │                   │  + iframe-proxy (systemd)│
│              │     VM_EXEC      │                          │
│              │ ───────────────→ │  vm.exec("npm install    │
│              │  { action:       │    >> /tmp/vm.log 2>&1") │
│              │    "install" }   │                          │
│              │ ← { success }    │  (blocks until done)     │
│              │                   │                          │
│              │     VM_EXEC      │                          │
│              │ ───────────────→ │  vm.exec("npm run dev    │
│              │  { action:       │    >> /tmp/vm.log 2>&1 &")│
│              │    "dev" }       │                          │
│              │ ← { success }    │  (backgrounds, returns)  │
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
}
```

What it does:
1. Create Freestyle git repo reference
2. `freestyle.vms.create()` with:
   - `gitRepos` (code at `/app`)
   - `additionalFiles` (iframe-proxy.js, install-ttyd.sh)
   - `systemd`: install-ttyd, web-terminal (`tail -f /tmp/vm.log`), iframe-proxy
   - `domains`: preview + terminal subdomains
   - **No install-deps, no dev-server, no setup-runtime services**
3. Touch `/tmp/vm.log` via `vm.exec("touch /tmp/vm.log")` so ttyd doesn't error on missing file
4. Return URLs immediately

Key change: ttyd now tails `/tmp/vm.log` instead of `journalctl`. This is the shared log file that `VM_EXEC` writes to.

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

For `action: "install"`:
1. Look up VM entry from metadata
2. If runtime needs installing (deno/bun), exec the setup script first
3. `vm.exec("cd /app && npm install >> /tmp/vm.log 2>&1")`
4. Blocks until complete, returns success/failure

For `action: "dev"`:
1. Kill any existing dev server: `vm.exec("pkill -f 'npm run dev' || true")`
2. `vm.exec("cd /app && npm run dev >> /tmp/vm.log 2>&1 &")`
3. Backgrounds the process, returns immediately

### VM_STOP (unchanged)

Stays the same — kills the VM and clears the metadata entry.

## Frontend UX Flow

### State Machine

```
idle → creating → installing → running → error
```

State transitions:
- `idle` → user clicks Start → call VM_START
- `creating` → VM_START returns → show terminal full height, call VM_EXEC("install")
- `installing` → VM_EXEC("install") returns → call VM_EXEC("dev"), wait a few seconds, HEAD request to previewUrl
- `running` → HEAD Content-Type check:
  - `text/html` → collapse terminal, show only preview
  - other → keep terminal full height (API server, no preview)
- `error` → any step fails → show error + retry

### UI States

**State 1 — Idle:** Same as current. Monitor icon + "Start Preview" button.

**State 2 — Terminal full height (installing + starting dev):**
Terminal takes full view height. Shows live output: git sync, npm install, npm run dev.

**State 3a — Running with preview (HTML detected):**
Terminal collapses. Preview iframe takes full height. User can re-open terminal via dropdown.

**State 3b — Running without preview (API server):**
Terminal stays full height. No preview iframe shown.

### Smart Preview Detection

After `VM_EXEC("dev")` returns, the frontend polls the preview URL (every 3 seconds, up to 10 attempts) using the existing favicon probe pattern. Once the server responds:
1. The backend makes a `HEAD` request to the preview URL (server-side, to avoid CORS) — this can be a new `VM_CHECK_PREVIEW` tool or a field returned by `VM_EXEC("dev")`.
2. Check `Content-Type` response header.
3. If `text/html` → this is a frontend app, collapse terminal and show preview.
4. Otherwise → API server, keep terminal full height.

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

## Files Changed

### Backend
- **Modify:** `apps/mesh/src/tools/vm/start.ts` — remove install-deps, dev-server, setup-runtime systemd services. Change ttyd to tail `/tmp/vm.log`. Add `vm.exec("touch /tmp/vm.log")` after creation.
- **Create:** `apps/mesh/src/tools/vm/exec.ts` — new VM_EXEC tool with install/dev actions.
- **Modify:** tool registry to register VM_EXEC.

### Frontend
- **Modify:** `apps/mesh/src/web/components/vm-preview.tsx` — new state machine (idle → creating → installing → running), terminal full height during install, smart preview detection, dropdown menu replacing toggle button.

## Constraints

- `vm.exec()` is blocking — `npm run dev` must be backgrounded with `&`
- ttyd install uses `/tmp/` due to Freestyle overlay filesystem write restrictions
- iframe-proxy remains as custom Node.js proxy (needed for X-Frame-Options stripping + visual editor script injection)
- Smart preview detection must happen server-side (CORS blocks frontend HEAD requests to `*.deco.studio`)
