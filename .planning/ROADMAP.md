# Roadmap: Site Builder Plugin

**Milestone:** v1.0 - AI-Assisted Site Building with Live Preview

## Overview

Extend the existing Task Runner infrastructure with a Site Builder plugin that enables AI-assisted site development with live preview. Users connect to a local Deno/Fresh site, create tasks, and watch agents implement changes with HMR in real-time.

## Architecture Decision

**Approach:** New plugin (`mesh-plugin-site-builder`) that extends Task Runner capabilities, NOT a separate MCP.

- Site tools added to existing `mcps/task-runner/` MCP
- New plugin reuses task-runner hooks (`useTasks`, `useAgentSessions`)
- Skills copied from `../context/skills/` to MCP
- Connection filtering by stack detection (deno.json with deco/ import)

---

## Phase 1: Site Builder Plugin Foundation ✅ COMPLETE

**Goal:** Create Site Builder plugin with site-aware connection filtering and basic UI layout.

**Status:** Complete

### Completed
- [x] Plugin scaffold with binding, router, query keys
- [x] Site detection (deno.json with deco imports)
- [x] Site list view with filtered connections
- [x] Route structure: `/sites`, `/sites/:connectionId`

---

## Phase 2: Dev Server & Preview ✅ COMPLETE

**Goal:** Control dev server and display live preview with HMR.

**Status:** Complete

### Completed
- [x] Stack detection from deno.json
- [x] Start/stop dev server via DENO_TASK tool
- [x] Port detection from server output
- [x] Live preview iframe with detected URL
- [x] Page list from routes directory

---

## Phase 3: Task Integration & Skills ✅ COMPLETE (needs UX refactor)

**Goal:** Integrate task board components and add site-building skills.

**Status:** Complete but UX needs refactoring per Phase 5

### Completed
- [x] Reuse task-runner hooks (useTasks, useAgentSessions)
- [x] TaskCard component extracted for reuse
- [x] Landing page skills copied to skills/ folder
- [x] Site context injection into agent prompts
- [x] Quality gates baseline verification system

---

## Phase 4: Quality & Polish ✅ COMPLETE

**Goal:** Quality gates verification and code cleanup.

**Status:** Complete

### Completed
- [x] Quality gates baseline verification before task creation
- [x] Acknowledge pre-existing failures flow
- [x] Agent prompt differentiation (don't fix acknowledged failures)
- [x] Support for deno.json in quality gate detection
- [x] MCP response format handling fixes

---

## Phase 5: UX Refactor - Separation of Concerns 🎯 CURRENT

**Goal:** Separate Sites tab (site management) from Tasks tab (task execution with live preview).

### UX Principles

**Sites Tab** = Site Management Only
- Site selection and pages list
- Dev server controls and logs
- Page actions that CREATE tasks and navigate to Tasks tab
- NO task management UI

**Tasks Tab** = Task Execution
- Full task management (existing)
- When running a site-related task, show live page preview
- Real-time preview updates via HMR

### Requirements
- R5.1: Remove TaskPanel from Sites tab
- R5.2: Add "Create Page" button → navigates to Tasks with skill pre-selected
- R5.3: Add "Use as Template" button on page hover → navigates to Tasks
- R5.4: Add "Edit" button on page → shows page, chat creates task → navigates to Tasks
- R5.5: Task Runner shows live preview when executing site tasks
- R5.6: Pass page context when navigating to Tasks

### Deliverables
- [ ] Remove TaskPanel component from site-list.tsx
- [ ] Add PageActions component (Create Page, Use as Template, Edit buttons)
- [ ] Implement navigation to Tasks with pre-selected skill and page context
- [ ] Add SitePreview component to Task Runner for site-related tasks
- [ ] Store task metadata (siteConnectionId, pagePath) for preview routing

### Success Criteria
- Sites tab is purely for site management (no tasks)
- "Create Page" navigates to Tasks with landing page skill
- "Use as Template" navigates to Tasks with selected page as reference
- "Edit" opens chat, creates task, navigates to Tasks
- Tasks tab shows live preview when agent edits site files

---

## Dependency Map

```
Phase 1 (Foundation) ✅
    ↓
Phase 2 (Dev Server & Preview) ✅
    ↓
Phase 3 (Task Integration & Skills) ✅
    ↓
Phase 4 (Quality & Polish) ✅
    ↓
Phase 5 (UX Refactor) 🎯 CURRENT
```

---

## Files to Modify (Phase 5)

### Sites Plugin Changes
```
packages/mesh-plugin-site-builder/
├── components/
│   ├── site-list.tsx          # Remove TaskPanel, add page actions
│   ├── page-actions.tsx       # NEW: Create Page, Use as Template, Edit
│   └── task-panel.tsx         # DELETE or repurpose
└── lib/
    └── navigation.ts          # NEW: Navigate to Tasks with context
```

### Task Runner Changes
```
packages/mesh-plugin-task-runner/
├── components/
│   ├── task-board.tsx         # Add SitePreview when task has site context
│   └── site-preview.tsx       # NEW: Live preview for site tasks
└── hooks/
    └── use-tasks.ts           # Task metadata includes siteConnectionId, pagePath
```

---

*Roadmap updated: 2026-02-02*
*Phases 1-4 complete, Phase 5 in progress*
