# Onboarding Redesign — Blog Post Generator Demo

Date: 2026-02-26
Status: Approved for implementation
Branch: feat/onboarding

---

## Context

The current onboarding flow ends at Phase 22 with an interview (3 questions) that recommends agents via a 2×2 card grid. Based on team meeting feedback:

- The 3-question interview adds friction without insight — the diagnostic already knows the company
- The agent grid implies breadth we don't have yet — we have one agent to demo now
- The flow needs to show what "done work" looks like: task proposed → task approved → first output

This redesign replaces the interview+cards with a focused single-agent onboarding for Blog Post Generator.

---

## Flow

```
/onboarding (public)
  → URL input → 5 agents run → diagnostic report
  → Login CTA

/onboard-setup (post-login)
  → Org created → redirect to /$org/$project?onboarding=true

/$org/$project?onboarding=true (onboarding mode inside product)
  → Step 1: Welcome + diagnostic summary + one agent recommendation
  → Step 2: Hire drawer (plugins + connections + autonomy)
  → Step 3: Agent proposes tasks in chat
  → Step 4: Click task → /tasks/[id] with chat on right
  → Step 5: Approve → "done" moment → invite team
```

---

## Screen Designs

### Step 1 — Welcome + Recommendation (in chat, replaces current OnboardingMessages)

The welcome message references real diagnostic data (site name, platform, findings).
Below it: a collapsed "Diagnostic" card that expands inline — not a separate route.
Then: a single agent recommendation card for Blog Post Generator.
Bottom: "Looking for something else? Browse agent store →" (mocked, not functional).

No questions asked. The diagnostic context is enough.

### Step 2 — Hire Drawer (slide-in from right, report stays visible)

Contents:
- Agent name + icon + one-line description
- **"What it already knows"** — populated from diagnostic context (brand, platform, audience)
- **"Plugins it will install"** — e.g. "Blog" sidebar nav item
- **"Connections (optional)"** — list of integrations with Connect buttons; all optional, agent works without them
- **Autonomy selector** — three options, generic across all agents:
  - `Review` (default): agent proposes, you approve before anything happens
  - `Monitor`: agent observes and reports, never acts
  - `Autonomous`: agent acts and notifies you
- "Hire [Agent Name] →" CTA — always enabled (no required connections)

### Step 3 — Task Proposals in Chat

Immediately after hire, agent sends a message proposing tasks.
Tasks render as stacked cards in the chat thread — NOT as chat bubbles:

```
Agent: "I've looked at acme.com and competitors. Here are your first 3 content opportunities:"

[card] 1. Blog: "Best smart home accessories under $50"  →
[card] 2. Blog: "How to set up a smart home in 2026"    →
[card] 3. Blog: "VTEX vs Shopify for DTC brands"        →
```

Each card shows: title, keyword, estimated impact. Click → opens task workspace.

### Step 4 — Task Workspace (/tasks/[id])

Left: task detail — the blog draft as a rendered artifact (title, meta, content, keyword, image placeholder).
Right: chat thread with the agent, pre-loaded with context about this specific task.
Agent says: "Here's the draft. Want to adjust the keyword or swap the hero image?"
User can chat to iterate OR click "Approve" to add to content queue.

### Step 5 — After Approval

Chat shows: "✓ Added to content queue. Want weekly drafts? I'll send one every Monday for review."
Below: "🎉 Your first agent is working. Invite your team →"

This is the "done" moment. The user has hired, seen the agent propose work, reviewed output, and approved. Now they're ready to bring the team in.

---

## Sidebar Plugin

When Blog Post Generator is hired, a "Blog" item appears in the org sidebar.
It shows: published posts, drafts in queue, pending approval count.
This is the plugin's dedicated home — but interaction always starts in chat.

---

## Autonomy — Generic Design

The three modes work for any agent:
- **Review**: Every proposed action requires explicit user approval before it executes. Best for first-time users.
- **Monitor**: Agent reads data and sends reports/alerts. Never writes, never acts. Best for enterprise.
- **Autonomous**: Agent acts within the connections you've granted, notifies you of outcomes. Best for power users.

The hire drawer shows these three as radio options with a one-line description each.
The active mode is shown on the agent card in the sidebar/agents list.

---

## What is Mocked vs Real

Everything in this implementation is mocked. Diagnostic data, agent output, task cards, blog drafts — all static. The goal is a working demo that communicates the full flow end to end.

---

## Files to Create/Modify

- `apps/mesh/src/web/components/chat/onboarding-messages.tsx` — full rewrite
- New: `apps/mesh/src/web/components/onboarding/hire-agent-drawer.tsx`
- New: `apps/mesh/src/web/components/onboarding/task-proposal-cards.tsx`
- New: `apps/mesh/src/web/routes/orgs/tasks.tsx` (mocked task workspace)
- `apps/mesh/src/web/routes/orgs/home/page.tsx` — handle task workspace navigation
- `apps/mesh/src/web/hooks/use-project-sidebar-items.tsx` — add Blog sidebar item after hire
