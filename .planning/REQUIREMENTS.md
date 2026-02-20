# Requirements: MCP Mesh

**Defined:** 2026-02-20
**Core Value:** Developers can connect any MCP server to Mesh and get auth, routing, observability, and a polished admin UI — including a full visual site editor for Deco-compatible sites.

## v1.3 Requirements

### Local Dev Daemon

- [ ] **LDV-01**: Developer can start a local-dev MCP daemon pointing at a folder with a single command
- [ ] **LDV-02**: local-dev exposes full filesystem tools (read, write, edit, list, tree, search, delete, copy)
- [ ] **LDV-03**: local-dev exposes OBJECT_STORAGE_BINDING tools (LIST_OBJECTS, GET/PUT_PRESIGNED_URL, DELETE_OBJECT, GET_ROOT) backed by local filesystem
- [ ] **LDV-04**: local-dev exposes git tools (GIT_STATUS, GIT_DIFF, GIT_LOG, GIT_SHOW, GIT_CHECKOUT, GIT_COMMIT)
- [ ] **LDV-05**: local-dev can spawn and manage the project's dev server (any command, e.g. `bun dev`, `deno task dev`)
- [ ] **LDV-06**: local-dev streams dev server stdout/stderr over SSE so Mesh UI can show live logs
- [ ] **LDV-07**: local-dev exposes a readiness endpoint (`/_ready`) that Mesh polls before showing project as online
- [ ] **LDV-08**: local-dev forwards SIGTERM to child dev server for clean shutdown
- [ ] **LDV-09**: local-dev exposes SSE `/watch` stream for filesystem change events

### Deco Blocks Plugin

- [ ] **BLK-01**: plugin-deco-blocks scans a folder and returns all block definitions (name, props schema, file path)
- [ ] **BLK-02**: plugin-deco-blocks scans a folder and returns all loader definitions (name, props schema, return type)
- [ ] **BLK-03**: plugin-deco-blocks defines DECO_BLOCKS_BINDING — the binding that a connection must implement to be treated as a deco site
- [ ] **BLK-04**: plugin-deco-blocks provides a binding checker `isDecoSite(connection)` usable by other plugins and flows
- [ ] **BLK-05**: plugin-deco-blocks ships with the canonical BLOCKS_FRAMEWORK.md specification as a package asset
- [ ] **BLK-06**: plugin-deco-blocks includes the Claude skill for implementing deco blocks (`.claude/commands/deco/blocks-framework.md`)

### Site Editor

- [ ] **EDT-01**: User can view and navigate all pages in a deco site project
- [ ] **EDT-02**: User can create, rename, and delete pages
- [ ] **EDT-03**: User can view all available blocks and their prop schemas
- [ ] **EDT-04**: User can view all available loaders and their prop schemas
- [ ] **EDT-05**: User can open the visual composer for any page
- [ ] **EDT-06**: User can add, remove, and reorder sections on a page via drag-and-drop
- [ ] **EDT-07**: User can edit section props via auto-generated form (RJSF)
- [ ] **EDT-08**: User can bind a loader to a section prop
- [ ] **EDT-09**: User can preview the page live in an iframe with edit/interact mode toggle
- [ ] **EDT-10**: User can undo and redo changes in the composer
- [ ] **EDT-11**: User sees pending changes (sections added/modified/deleted vs git HEAD) with diff badges in the sidebar
- [ ] **EDT-12**: User can commit pending changes from Mesh UI with a Claude-generated commit message
- [ ] **EDT-13**: User can view git history for the current page with commit list and diff preview
- [ ] **EDT-14**: User can revert to a previous commit with a confirmation dialog
- [ ] **EDT-15**: Site editor activates automatically when the project connection implements DECO_BLOCKS_BINDING

### Local Setup

- [ ] **LSP-01**: Developer can run `npx @decocms/mesh ./my-folder` with no prior configuration
- [ ] **LSP-02**: On first run, Mesh auto-creates an admin account (admin/admin) and default org
- [ ] **LSP-03**: On first run, Mesh auto-creates a Project wired to the local-dev MCP for the given folder
- [ ] **LSP-04**: If the folder is a deco site, Mesh auto-enables the site-editor plugin on the project
- [ ] **LSP-05**: Mesh auto-opens the browser to the project URL, already logged in
- [ ] **LSP-06**: Subsequent runs re-use the existing setup (idempotent) and open to the same project
- [ ] **LSP-07**: If no folder is given, Mesh opens to a landing page explaining how to link a local project

## v2 Requirements

### Remote & Collaboration

- **RMT-01**: Developer can expose local-dev via tunnel (deco link) for use with remote Mesh
- **RMT-02**: Project can be linked to a GitHub repository
- **RMT-03**: User can switch between "local" and "branch on GitHub" views in a project

### Dev Server UX

- **DSV-01**: User can see dev server status (running/stopped/error) in the project header
- **DSV-02**: User can start/stop the dev server from Mesh UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Kubernetes / remote daemon | Local-first only for this milestone |
| GitHub integration | Deferred to v1.4 |
| Tunnel / deco link | Deferred to v1.4, needs remote Mesh |
| Multi-user local setup | Single developer workflow only |
| Mobile / responsive site editor | Desktop workflow only |
| OAuth login for local setup | admin/admin is sufficient for local-only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LDV-01 | Phase 15 | Pending |
| LDV-02 | Phase 15 | Pending |
| LDV-03 | Phase 15 | Pending |
| LDV-04 | Phase 15 | Pending |
| LDV-05 | Phase 15 | Pending |
| LDV-06 | Phase 15 | Pending |
| LDV-07 | Phase 15 | Pending |
| LDV-08 | Phase 15 | Pending |
| LDV-09 | Phase 15 | Pending |
| BLK-01 | Phase 16 | Pending |
| BLK-02 | Phase 16 | Pending |
| BLK-03 | Phase 16 | Pending |
| BLK-04 | Phase 16 | Pending |
| BLK-05 | Phase 16 | Pending |
| BLK-06 | Phase 16 | Pending |
| EDT-01 | Phase 17 | Pending |
| EDT-02 | Phase 17 | Pending |
| EDT-03 | Phase 17 | Pending |
| EDT-04 | Phase 17 | Pending |
| EDT-05 | Phase 17 | Pending |
| EDT-06 | Phase 17 | Pending |
| EDT-07 | Phase 17 | Pending |
| EDT-08 | Phase 17 | Pending |
| EDT-09 | Phase 17 | Pending |
| EDT-10 | Phase 17 | Pending |
| EDT-11 | Phase 17 | Pending |
| EDT-12 | Phase 17 | Pending |
| EDT-13 | Phase 17 | Pending |
| EDT-14 | Phase 17 | Pending |
| EDT-15 | Phase 17 | Pending |
| LSP-01 | Phase 18 | Pending |
| LSP-02 | Phase 18 | Pending |
| LSP-03 | Phase 18 | Pending |
| LSP-04 | Phase 18 | Pending |
| LSP-05 | Phase 18 | Pending |
| LSP-06 | Phase 18 | Pending |
| LSP-07 | Phase 18 | Pending |

**Coverage:**
- v1.3 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 — traceability updated after roadmap creation (phases 15–18)*
