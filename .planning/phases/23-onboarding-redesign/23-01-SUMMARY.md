---
phase: 23
plan: 01
subsystem: onboarding-ui
tags: [react, dialog, state-machine, blog, sidebar, routing]
dependency_graph:
  requires: [22-03]
  provides: [blog-workspace, hire-modal, onboarding-redesign]
  affects: [home-page, project-sidebar]
tech_stack:
  added: []
  patterns:
    - Two-column Dialog modal with CSS grid
    - State machine pattern (recommend -> proposed -> approved)
    - localStorage-driven sidebar item injection
    - Mocked article content parser (##/### heading detection)
key_files:
  created:
    - apps/mesh/src/web/components/onboarding/hire-agent-modal.tsx
    - apps/mesh/src/web/routes/orgs/blog.tsx
  modified:
    - apps/mesh/src/web/components/chat/onboarding-messages.tsx
    - apps/mesh/src/web/index.tsx
    - apps/mesh/src/web/hooks/use-project-sidebar-items.tsx
decisions:
  - Used File06 instead of FileText (FileText not exported by @untitledui/icons v0.0.19)
  - Blog route added to projectRoutes without orgAdminGuard (available for all projects)
  - Pre-existing urlToSlug TS error in onboarding.ts left untouched (out of scope)
metrics:
  duration: "37 min"
  completed: "2026-02-26"
  tasks: 4
  files: 5
---

# Phase 23 Plan 01: Onboarding Redesign Summary

**One-liner:** Full onboarding redesign — two-column hire modal, blog post generator state machine, split blog workspace with mocked AI chat, and localStorage-driven sidebar item injection.

## What Was Built

### Task 1 — HireAgentModal (`hire-agent-modal.tsx`)

Two-column Dialog modal (`max-w-3xl`, CSS grid `grid-cols-[1fr_1fr]`, `min-h-[520px]`).

Left column (`bg-muted/20 border-r border-border`):
- Violet File06 icon (size-14, `bg-violet-100 text-violet-600`)
- DialogTitle ("Blog Post Generator") + subtitle
- "Already knows about {domain}" with 4 emerald check marks
- "Installs" card: Package icon + "Blog" + sidebar description

Right column:
- 3 optional connections (Google Search Console, Shopify, GitHub) with IntegrationIcon, name, description, mock Connect buttons (800ms → "Connected" + Check)
- 3 autonomy radio buttons styled as bordered clickable divs ("review" recommended, "monitor", "autonomous")
- Full-width "Hire Blog Post Generator" CTA

Props: `{ open, onOpenChange, orgName, onHire(mode) }`

### Task 2 — OnboardingMessages rewrite

Full rewrite of state machine component. Stages: `"recommend" | "proposed" | "approved"`.

Components:
- `AssistantRow`: renders markdown via MemoizedMarkdown (unchanged pattern)
- `DiagnosticCard`: collapsible card with ChevronDown/Up toggle, Performance (LCP 4.2s, CLS 0.12, Mobile 42/100), SEO (67% meta missing, 1240 backlinks, ~1.1M organic), tech stack chips. Collapsed by default.
- `AgentRecommendationCard`: violet File06 icon, description, 4 "already knows" emerald chips, "Hire Blog Post Generator" button → opens modal, "Browse agent store" text
- `TaskProposalCards`: 3 blog topics (bp-1/bp-2/bp-3) with CompetitionBadge (emerald/amber/rose), keyword, volume. Clickable → calls `handleApprove(task)`
- `DoneState`: emerald success card + "Go to Blog workspace" button + "Invite your team" outline button

State logic:
- `handleHire()`: sets `localStorage.mesh_blog_hired=true`, dispatches `mesh_blog_hired` event, sets stage → "proposed"
- `handleApprove(task)`: sets stage → "approved", after 1200ms navigates to `/$org/storefront/blog?taskId=task.id`
- `HireAgentModal` rendered outside scroll div

### Task 3 — Blog workspace (`blog.tsx`)

Split layout route at `/$org/$project/blog?taskId=bp-1|bp-2|bp-3`.

3 mocked drafts with full article content (4-6 paragraphs each):
- bp-1: "Best Smart Home Accessories Under $50" (1240 words, 5 min, 18K/mo)
- bp-2: "How to Set Up a Smart Home in 2026" (1580 words, 6 min, 41K/mo)
- bp-3: "VTEX vs Shopify for DTC Brands" (2100 words, 8 min, 6K/mo)

`DraftViewer` (left):
- Header: title, word count/read time/searches, Approve button (→ "Approved" state with Check)
- Meta description box + target keyword box (muted bg, rounded-lg)
- Article content parser: detects `## ` as h2, `### ` as h3, blank lines as spacing, rest as p tags

`AgentChat` (right, 320px):
- Violet File06 icon header
- 2 initial mocked agent messages about the draft
- Textarea (2 rows) + Send01 button
- On send: shows user message, after 1000ms agent replies "Got it — I'll update the draft with that change."
- Enter (no shift) submits; 3-dot bounce animation while sending

### Task 4 — Routing + sidebar wiring

`index.tsx`: Added `blogRoute` after `tasksRoute` definition with `validateSearch` for `taskId`. Added to `projectRoutes` array.

`use-project-sidebar-items.tsx`: Added File06 import, `blogHired` localStorage check, `blogItem` definition, conditional spread into `projectItems`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FileText icon not found in @untitledui/icons**
- **Found during:** Type check after all 4 tasks
- **Issue:** `FileText` is not exported by `@untitledui/icons` v0.0.19. The plan spec referenced this icon name but it doesn't exist in the installed version.
- **Fix:** Replaced all 4 occurrences across hire-agent-modal.tsx, onboarding-messages.tsx, blog.tsx, and use-project-sidebar-items.tsx with `File06` (the document/file icon used elsewhere in the codebase)
- **Files modified:** hire-agent-modal.tsx, onboarding-messages.tsx, blog.tsx, use-project-sidebar-items.tsx
- **Commit:** 77a4c7d57

**2. [Rule 2 - Unused import] IntegrationIcon not needed in onboarding-messages**
- **Found during:** Type check
- **Issue:** `IntegrationIcon` was imported but not used in the rewritten `onboarding-messages.tsx` (the new design doesn't use it directly)
- **Fix:** Removed the import
- **Commit:** 77a4c7d57

## Out-of-Scope Issues (Deferred)

Pre-existing TS error `'urlToSlug' is declared but its value is never read` in `apps/mesh/src/api/routes/onboarding.ts` — not caused by this plan's changes, left untouched.

## Self-Check: PASSED

Files created:
- `/Users/rafaelvalls/repos/mesh/.worktrees/onboarding/apps/mesh/src/web/components/onboarding/hire-agent-modal.tsx` ✓
- `/Users/rafaelvalls/repos/mesh/.worktrees/onboarding/apps/mesh/src/web/routes/orgs/blog.tsx` ✓

Files modified:
- `/Users/rafaelvalls/repos/mesh/.worktrees/onboarding/apps/mesh/src/web/components/chat/onboarding-messages.tsx` ✓
- `/Users/rafaelvalls/repos/mesh/.worktrees/onboarding/apps/mesh/src/web/index.tsx` ✓
- `/Users/rafaelvalls/repos/mesh/.worktrees/onboarding/apps/mesh/src/web/hooks/use-project-sidebar-items.tsx` ✓

Commits verified:
- 867a5dd72 feat(onboarding): create hire-agent-modal two-column dialog ✓
- 061d24c1f feat(onboarding): rewrite onboarding-messages with blog post generator flow ✓
- 522d300b5 feat(onboarding): create blog workspace route with draft viewer and agent chat ✓
- ac15dcba9 feat(onboarding): wire blog route and conditional sidebar item ✓
- 77a4c7d57 fix(onboarding): replace FileText with File06 icon and fix type errors ✓
