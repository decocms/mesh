# Roadmap: MCP Mesh

## Milestones

- ✅ **v1.0 — Core Mesh** - Phases 1–5 (shipped, on main)
- ✅ **v1.1 — Site Editor Foundation** - Phases 6–9 (shipped, on gui/site-builder)
- ✅ **v1.2 — Git-Native Editing** - Phases 11–14 (shipped, on gui/site-builder)
- 🚧 **v1.3 — Local-First Development** - Phases 15–18 (current)

<details>
<summary>✅ v1.0 — Core Mesh (Phases 1–5) — SHIPPED</summary>

Core platform: auth (Better Auth), connections, organizations, projects, plugin system, event bus, observability, Kysely storage. No site editor yet. Not tracked in GSD.

</details>

<details>
<summary>✅ v1.1 — Site Editor Foundation (Phases 6–9) — SHIPPED (gui/site-builder)</summary>

Pages CRUD, block/loader scanner, sections list, visual composer, preview bridge, multi-site support, tunnel detection. Tracked in branch .planning/.

</details>

<details>
<summary>✅ v1.2 — Git-Native Editing (Phases 11–14) — SHIPPED (gui/site-builder)</summary>

Git site binding tools, pending changes UI, commit dialog with Claude-generated messages, history panel, revert to commit. Tracked in branch .planning/.

</details>

---

### 🚧 v1.3 — Local-First Development (Current)

**Milestone Goal:** Ship the site editor and local development experience as clean, reviewable PRs from a well-structured set of new packages. Four packages, four PRs, each independently mergeable.

## Phases

- [ ] **Phase 15: local-dev daemon** - MCP server for local filesystem, object storage, git, and dev server management
- [ ] **Phase 16: plugin-deco-blocks** - Standalone deco blocks framework: scanners, DECO_BLOCKS_BINDING, Claude skill
- [ ] **Phase 17: site-editor plugin** - Full site editor UI with visual composer and git UX
- [ ] **Phase 18: local-setup** - Zero-config `npx @decocms/mesh ./folder` experience

## Phase Details

### Phase 15: local-dev daemon
**Goal**: Developers can point local-dev at any folder and get a fully-featured MCP server covering filesystem, object storage, git, and dev server management — all runnable as a daemon from a single command
**Depends on**: Nothing (standalone package, no mesh UI changes)
**Requirements**: LDV-01, LDV-02, LDV-03, LDV-04, LDV-05, LDV-06, LDV-07, LDV-08, LDV-09
**Success Criteria** (what must be TRUE):
  1. Developer runs a single command pointing at a folder and gets a running MCP daemon — no config files required
  2. Mesh (or any MCP client) can call filesystem tools: read, write, edit, list, tree, search, delete, copy — all scoped to the target folder
  3. Mesh can call OBJECT_STORAGE_BINDING tools (LIST_OBJECTS, GET/PUT_PRESIGNED_URL, DELETE_OBJECT, GET_ROOT) and they resolve to local files
  4. Mesh can call git tools (GIT_STATUS, GIT_DIFF, GIT_LOG, GIT_SHOW, GIT_CHECKOUT, GIT_COMMIT) against the folder's git repository
  5. Dev server spawns on request, its stdout/stderr streams live over SSE, and the daemon forwards SIGTERM cleanly on shutdown
**Plans**: TBD

### Phase 16: plugin-deco-blocks
**Goal**: A standalone package exports block/loader/section scanners, defines DECO_BLOCKS_BINDING, and ships the canonical framework documentation and Claude skill — ready to be consumed by site-editor and any future tool
**Depends on**: Nothing (pure infrastructure, no UI)
**Requirements**: BLK-01, BLK-02, BLK-03, BLK-04, BLK-05, BLK-06
**Success Criteria** (what must be TRUE):
  1. Calling the scanner against a deco project folder returns all block definitions with name, props schema, and file path
  2. Calling the scanner returns all loader definitions with name, props schema, and return type
  3. `isDecoSite(connection)` returns true for a connection that implements DECO_BLOCKS_BINDING, and false otherwise
  4. BLOCKS_FRAMEWORK.md is present as a package asset and the Claude skill is importable from the package
**Plans**: TBD

### Phase 17: site-editor plugin
**Goal**: Users with a deco site project can navigate pages, compose sections visually, edit props, preview live, and manage git history — all from the Mesh UI; the plugin activates automatically when DECO_BLOCKS_BINDING is detected
**Depends on**: Phase 16 (plugin-deco-blocks)
**Requirements**: EDT-01, EDT-02, EDT-03, EDT-04, EDT-05, EDT-06, EDT-07, EDT-08, EDT-09, EDT-10, EDT-11, EDT-12, EDT-13, EDT-14, EDT-15
**Success Criteria** (what must be TRUE):
  1. User can browse all pages, create/rename/delete pages, and open the visual composer for any page — the plugin tab appears automatically when the project connection implements DECO_BLOCKS_BINDING
  2. User can add, remove, and reorder sections via drag-and-drop, edit section props with an auto-generated form, bind a loader to a prop, and undo/redo any change
  3. User can preview the page live in an iframe and toggle between edit mode and interact mode
  4. User sees pending changes (additions, edits, deletions vs git HEAD) with diff badges, and can commit them from the UI with a Claude-generated commit message
  5. User can view the git history for a page, see a diff preview per commit, and revert to any previous commit with a confirmation dialog
**Plans**: TBD

### Phase 18: local-setup
**Goal**: A developer can run `npx @decocms/mesh ./my-folder` and land in a fully configured Mesh project with browser open and already logged in — no manual configuration, no separate commands
**Depends on**: Phase 15 (local-dev daemon), Phase 17 (site-editor plugin for auto-enable detection)
**Requirements**: LSP-01, LSP-02, LSP-03, LSP-04, LSP-05, LSP-06, LSP-07
**Success Criteria** (what must be TRUE):
  1. Running `npx @decocms/mesh ./my-folder` with no prior setup creates the admin account, default org, and a project wired to local-dev for that folder — then opens the browser already logged in
  2. If the folder is a deco site, the site-editor plugin is automatically enabled on the project and the user lands on the site editor view
  3. Running the same command again on an existing setup reuses the existing project and opens the browser — nothing is duplicated or reset
  4. Running `npx @decocms/mesh` with no folder argument opens Mesh to a landing page explaining how to link a local project
**Plans**: TBD

## Progress

**Execution Order:** 15 → 16 → 17 → 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 15. local-dev daemon | v1.3 | 0/? | Not started | - |
| 16. plugin-deco-blocks | v1.3 | 0/? | Not started | - |
| 17. site-editor plugin | v1.3 | 0/? | Not started | - |
| 18. local-setup | v1.3 | 0/? | Not started | - |
