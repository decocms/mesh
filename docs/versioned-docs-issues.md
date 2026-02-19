# Versioned Docs Issues Plan

Goal: make `http://localhost:4000/` serve the same docs as `https://docs.decocms.com/` under the **"Latest (Stable)"** version switcher option, and have the new draft docs under **"Draft"**.

Production URL structure: `/en/...` (no version prefix)
Local URL structure: `/latest/en/...` and `/draft/en/...`

Check off each item as it is fixed.

---

## A. Routing & URL Issues

- [x] **A1 — Root redirect is broken**
  `http://localhost:4000/` → redirects to `/en/mcp-mesh/quickstart` → **404**
  The legacy `pages/[locale]/[...slug].astro` route sends `/` to `/en/mcp-mesh/quickstart`, but the old `en/` content files are deleted in this branch so that path no longer exists.
  **Fix:** Update the server or Astro config (`redirects`) to redirect `/` → `/latest/en/introduction`.
  **Files:** `apps/docs/astro.config.mjs`, `apps/docs/server/main.ts`

- [x] **A2 — Legacy `/en/...` paths give 404**
  All old production URLs (e.g. `/en/mcp-mesh/overview`) return 404 locally because the `pages/[locale]/[...slug].astro` route maps doc IDs starting with `"latest/"` or `"draft/"` — not `"en/"`.
  This is also a **SEO / backward-compatibility risk**: when deployed to production the existing indexed URLs will break.
  **Fix:** Add HTTP redirects `/en/:slug` → `/latest/en/:slug` (either in `astro.config.mjs` `redirects`, or in the server).
  **Files:** `apps/docs/astro.config.mjs` or `apps/docs/server/main.ts`

- [x] **A3 — `pages/[locale]/[...slug].astro` legacy route does not serve any docs**
  This file still exists and generates paths, but all doc IDs now start with `latest/` or `draft/` — the legacy route can't match them. The route either needs to be updated to serve `latest` docs at `/en/...` paths, or be replaced entirely with a redirect rule.
  **Files:** `apps/docs/client/src/pages/[locale]/[...slug].astro`

---

## B. Sidebar Issues (Latest version)

- [x] **B1 — "Introduction" is misplaced in the sidebar**
  `introduction.mdx` is a top-level file. `groupLegacyAdminSections()` in `Sidebar.astro` first pushes all `mcp-mesh` children to the top, then pushes top-level files — so Introduction appears **after** all MCP Mesh items.
  Production shows Introduction **first** in the sidebar.
  **Fix:** In `groupLegacyAdminSections`, push top-level files *before* mcp-mesh children (or specifically hoist `introduction` to the first slot).
  **File:** `apps/docs/client/src/components/ui/Sidebar.astro` lines 299–314

- [x] **B2 — "MCP Studio" section ends up inside Legacy Admin**
  The `mcp-studio/` folder is not `mcp-mesh`, so it goes into the `legacyChildren` array and appears inside the "Legacy Admin" collapsed group.
  Production shows MCP Studio as a **separate top-level section** after MCP Mesh.
  **Fix:** Handle `mcp-studio` specially in `groupLegacyAdminSections`, similar to how `mcp-mesh` is handled (pull it out before building the legacy folder).
  **File:** `apps/docs/client/src/components/ui/Sidebar.astro` lines 277–315

- [x] **B3 — Deploy folder appears before API Reference**
  Local sidebar order: `…Monitoring → Deploy → API Reference`
  Production order: `…Monitoring → API Reference → Deploy`
  Caused by the special case `if (a.name === "api-reference" && b.type === "folder") return 1` which forces the `api-reference` file after all folders.
  **Fix:** Remove or narrow the special-case, or add `api-reference` to the `mcpMeshOrder` array for `latest` and move the folder sort after the file-order check.
  **File:** `apps/docs/client/src/components/ui/Sidebar.astro` lines 61–66

---

## C. Prev / Next Navigation Issues (Latest version)

- [x] **C1 — Introduction page shows wrong Previous/Next**
  On `/latest/en/introduction`:
  - **Previous** shows "user_ask" → should be none (Introduction is the first page)
  - **Next** shows "API Reference" → should be "Overview"
  Root cause: `introduction` is not in the `order` array in `navigation.ts`, so it falls alphabetically after `api-reference/built-in-tools/user-ask` (which is also unordered).
  **Fix:** Add `"introduction"` as the *first* entry in the `order` array in `navigation.ts`, and add all `latest`-specific page paths (see C2).
  **File:** `apps/docs/client/src/utils/navigation.ts`

- [x] **C2 — Many Latest-version pages missing from nav order**
  The `order` array in `navigation.ts` is tailored for the draft structure (uses `connections`, `virtual-mcps`, `projects`, `agents`, `self-hosting/*`, etc.). Many `latest`-specific pages are absent, causing random alphabetical prev/next:
  - `introduction`
  - `mcp-mesh/connect-clients`
  - `mcp-mesh/authentication`
  - `mcp-mesh/authorization-and-roles`
  - `mcp-mesh/mcp-servers`
  - `mcp-mesh/mcp-gateways`
  - `mcp-mesh/api-reference` (single file)
  - `mcp-mesh/deploy/local-docker-compose`
  - `mcp-mesh/deploy/kubernetes-helm-chart`
  - `mcp-studio/overview`
  - `api-reference/built-in-tools/user-ask`
  **Fix:** Make `navigation.ts` version-aware, or add a separate `latestOrder` array that mirrors the intended reading order for the `latest` version.
  **File:** `apps/docs/client/src/utils/navigation.ts`

---

## D. Broken Internal Links in Latest Content

- [x] **D1 — Hardcoded `/en/` paths in `introduction.mdx`**
  The following links use the old `/en/` prefix and 404 locally (and will 404 in prod once deployed):
  - `/en/mcp-mesh/deploy/local-docker-compose`
  - `/en/mcp-mesh/deploy/kubernetes-helm-chart`
  - `/en/mcp-mesh/overview`, `/en/mcp-mesh/quickstart`, `/en/mcp-mesh/concepts`
  - `/en/mcp-mesh/mcp-servers`, `/en/mcp-mesh/mcp-gateways`
  - `/en/mcp-mesh/api-keys`, `/en/mcp-mesh/monitoring`
  - `/en/getting-started/ai-builders`, `/en/getting-started/developers`
  **Fix:** Replace all `/en/` prefixes with `/latest/en/` (or use relative Markdown links).
  **File:** `apps/docs/client/src/content/latest/en/introduction.mdx`

- [x] **D2 — Hardcoded `/en/` paths in `mcp-mesh/quickstart.mdx`**
  - `/en/mcp-mesh/deploy/local-docker-compose`
  - `/en/mcp-mesh/deploy/kubernetes-helm-chart`
  - `/en/mcp-mesh/api-keys`
  **Fix:** Same as D1.
  **File:** `apps/docs/client/src/content/latest/en/mcp-mesh/quickstart.mdx`

- [x] **D3 — Audit all other `latest/en/` content files for `/en/` hardcoded links**
  Run a search across `apps/docs/client/src/content/latest/en/**/*.mdx` for `](/en/` to find any remaining occurrences.
  Known suspect files: `getting-started/developers.mdx`, `mcp-mesh/mcp-servers.mdx`, `full-code-guides/building-tools.mdx`, `full-code-guides/project-structure.mdx`.
  **Fix:** Replace all `/en/` link prefixes with `/latest/en/`.

---

## E. Verification Checklist

After all fixes, verify locally:

- [ ] `http://localhost:4000/` redirects to `/latest/en/introduction`
- [ ] `http://localhost:4000/en/mcp-mesh/overview` redirects to `/latest/en/mcp-mesh/overview`
- [ ] `/latest/en/introduction` shows Introduction as the **first** sidebar item
- [ ] `/latest/en/introduction` sidebar shows MCP Mesh items, then MCP Studio as its own section, then Legacy Admin
- [ ] `/latest/en/introduction` prev/next: no Previous, Next = "Overview"
- [ ] `/latest/en/mcp-mesh/overview` prev/next: Previous = "Introduction", Next = "Quickstart"
- [ ] All inline links on Introduction page navigate to valid pages (no 404s)
- [ ] API Reference appears **before** Deploy folder in the MCP Mesh sidebar section
- [ ] Version switcher → "Draft" navigates to `/draft/en/...` equivalent page
- [ ] Draft version shows the correct sidebar (Quickstart, Overview, Decopilot section, Self-Hosting, etc.)
- [ ] Language switcher works in both versions

---

## Reference: Sidebar structure on production (docs.decocms.com)

```
Introduction                     ← top-level, first item
MCP Mesh (section)
  Overview
  Quickstart
  Concepts
  Connect MCP Clients
  Authentication
  Authorization & Roles
  Connections
  Agents
  API Keys
  Monitoring
  API Reference
  Deploy (folder)
    Local: Docker Compose
    Kubernetes: Helm Chart
MCP Studio (section)
  Overview
Legacy Admin (collapsed section)
  Getting Started
    For AI Builders
    For Developers
  No-Code Guides
    Creating Tools
    Creating Agents
  Full-Code Guides
    Project Structure
    Building Tools
    Building Views
    Resources
    Deployment
  api-reference
    built-in-tools
      user_ask
```

## Reference: Key files

| File | Purpose |
|------|---------|
| `apps/docs/client/src/utils/navigation.ts` | Prev/next ordering logic |
| `apps/docs/client/src/components/ui/Sidebar.astro` | Sidebar tree building + sorting |
| `apps/docs/client/src/pages/[version]/[locale]/[...slug].astro` | Versioned page routes |
| `apps/docs/client/src/pages/[locale]/[...slug].astro` | Legacy `/en/...` routes |
| `apps/docs/astro.config.mjs` | Redirects config |
| `apps/docs/server/main.ts` | Docs server (may handle root redirect) |
| `apps/docs/client/src/content/latest/en/**/*.mdx` | Latest version content |
| `apps/docs/client/src/content/draft/en/**/*.mdx` | Draft version content |
