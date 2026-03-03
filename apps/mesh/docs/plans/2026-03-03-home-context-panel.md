# Home Context Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an OpenCode-style right-side context panel to the home chat page showing session metadata, model/agent info, token usage stats, and a message list.

**Architecture:** A new `ChatContextPanel` component reads from `useChat()` (already in scope on the home page) and renders session info + `calculateUsageStats(messages)` data. The home page layout gains a toggleable right panel alongside the existing `TasksPanel` (left) + `Chat` (center) layout. State is local — a single `boolean` in `HomeContent`.

**Tech Stack:** React 19, Tailwind v4, `useChat()` hook, `calculateUsageStats` from `@decocms/mesh-sdk`, `@untitledui/icons`

---

### Task 1: Create `ChatContextPanel` component

**Files:**
- Create: `apps/mesh/src/web/components/chat/context-panel.tsx`

**Step 1: Write the component**

```tsx
/**
 * ChatContextPanel
 *
 * OpenCode-style right panel showing session metadata, token usage,
 * model/agent info, and message list for the active thread.
 */

import { useChat } from "@/web/components/chat/index";
import { calculateUsageStats } from "@/web/lib/usage-utils";
import { authClient } from "@/web/lib/auth-client";
import {
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { X } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDate(d: string | Date | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatGrid({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
          <span className="text-sm font-medium text-foreground tabular-nums">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ContextBreakdownBar({
  userTokens,
  assistantTokens,
  otherTokens,
}: {
  userTokens: number;
  assistantTokens: number;
  otherTokens: number;
}) {
  const total = userTokens + assistantTokens + otherTokens;
  if (total === 0) return null;

  const userPct = (userTokens / total) * 100;
  const assistantPct = (assistantTokens / total) * 100;
  const otherPct = (otherTokens / total) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-1.5 w-full rounded-full overflow-hidden">
        <div
          className="bg-green-500"
          style={{ width: `${userPct}%` }}
        />
        <div
          className="bg-pink-500"
          style={{ width: `${assistantPct}%` }}
        />
        <div
          className="bg-purple-400"
          style={{ width: `${otherPct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-green-500" />
          User {userPct.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-pink-500" />
          Assistant {assistantPct.toFixed(1)}%
        </span>
        {otherTokens > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-purple-400" />
            Other {otherPct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

interface ChatContextPanelProps {
  onClose: () => void;
  className?: string;
}

export function ChatContextPanel({ onClose, className }: ChatContextPanelProps) {
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const {
    messages,
    activeThreadId,
    threads,
    selectedModel,
    selectedVirtualMcp,
  } = useChat();

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const usage = calculateUsageStats(messages);

  const defaultAgent = getWellKnownDecopilotVirtualMCP(org.id);
  const agent = selectedVirtualMcp ?? defaultAgent;

  const contextWindow = selectedModel?.thinking?.limits?.contextWindow ?? 0;
  const usagePct =
    contextWindow > 0
      ? Math.min((usage.totalTokens / contextWindow) * 100, 100)
      : 0;

  // Per-role token approximation from message count (actual token data is in metadata)
  // We use message-level usage from metadata for accurate per-role breakdown
  const userMsgs = messages.filter((m) => m.role === "user");
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  const userTokens = userMsgs.reduce(
    (acc, m) => acc + ((m.metadata as { usage?: { inputTokens?: number } })?.usage?.inputTokens ?? 0),
    0,
  );
  const assistantTokens = assistantMsgs.reduce(
    (acc, m) => acc + ((m.metadata as { usage?: { outputTokens?: number } })?.usage?.outputTokens ?? 0),
    0,
  );
  const otherTokens = Math.max(0, usage.totalTokens - userTokens - assistantTokens);

  const costStr =
    usage.cost > 0
      ? `$${usage.cost.toFixed(4)}`
      : "$0.00";

  return (
    <div
      className={cn(
        "flex flex-col h-full w-[320px] shrink-0 border-l border-border bg-background overflow-y-auto",
        className,
      )}
    >
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between shrink-0 border-b border-border">
        <span className="text-sm font-medium text-foreground">Context</span>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded hover:bg-accent transition-colors"
        >
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {/* Session */}
        <section className="flex flex-col gap-3">
          <StatGrid
            items={[
              {
                label: "Session",
                value: activeThread?.title ?? "New session",
              },
              {
                label: "Messages",
                value: messages.filter((m) => m.role !== "system").length,
              },
            ]}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Agent + Model */}
        <section className="flex flex-col gap-3">
          <StatGrid
            items={[
              { label: "Agent", value: agent.title ?? "Decopilot" },
              {
                label: "Model",
                value: selectedModel?.thinking?.id ?? "—",
              },
            ]}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Token metrics */}
        <section className="flex flex-col gap-3">
          <StatGrid
            items={[
              {
                label: "Context Limit",
                value: contextWindow > 0 ? formatTokens(contextWindow) : "—",
              },
              {
                label: "Total Tokens",
                value: formatTokens(usage.totalTokens),
              },
              {
                label: "Usage",
                value: contextWindow > 0 ? `${usagePct.toFixed(1)}%` : "—",
              },
              { label: "Input Tokens", value: formatTokens(usage.inputTokens) },
              {
                label: "Output Tokens",
                value: formatTokens(usage.outputTokens),
              },
              {
                label: "Reasoning Tokens",
                value: formatTokens(usage.reasoningTokens),
              },
              { label: "Cost", value: costStr },
              {
                label: "User",
                value: session?.user?.name ?? session?.user?.email ?? "—",
              },
            ]}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Timestamps */}
        <section>
          <StatGrid
            items={[
              {
                label: "Session Created",
                value: formatDate(activeThread?.created_at),
              },
              {
                label: "Last Activity",
                value: formatDate(activeThread?.updated_at),
              },
            ]}
          />
        </section>

        {/* Context Breakdown */}
        {usage.totalTokens > 0 && (
          <>
            <div className="h-px bg-border" />
            <section className="flex flex-col gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Context Breakdown
              </span>
              <ContextBreakdownBar
                userTokens={userTokens}
                assistantTokens={assistantTokens}
                otherTokens={otherTokens}
              />
            </section>
          </>
        )}

        {/* Raw Messages */}
        {messages.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <section className="flex flex-col gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Messages
              </span>
              <div className="flex flex-col gap-1">
                {messages
                  .filter((m) => m.role !== "system")
                  .map((msg) => (
                    <div
                      key={msg.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground shrink-0">
                          {msg.role}
                        </span>
                        <span className="text-xs text-muted-foreground/60 truncate font-mono">
                          {msg.id.slice(0, 16)}…
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(msg.metadata as { created_at?: string })?.created_at
                          ? new Date(
                              (msg.metadata as { created_at: string })
                                .created_at,
                            ).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Type-check**

```bash
bun run --cwd=apps/mesh check 2>&1 | grep "context-panel"
```

Expected: no errors for context-panel.tsx

**Step 3: Commit**

```bash
git add apps/mesh/src/web/components/chat/context-panel.tsx
git commit -m "feat(home): add ChatContextPanel component with token usage and session info"
```

---

### Task 2: Wire panel into the home page

**Files:**
- Modify: `apps/mesh/src/web/routes/orgs/home/page.tsx`

**Step 1: Add imports and toggle state**

At the top of `HomeContent`, add:
```tsx
import { ChatContextPanel } from "@/web/components/chat/context-panel";
import { useState } from "react";
import { BarChart01 } from "@untitledui/icons"; // or use `Layers01` — check @untitledui/icons
```

In `HomeContent` body, add:
```tsx
const [showContext, setShowContext] = useState(false);
```

**Step 2: Add toggle button to header**

Replace:
```tsx
<Page.Header.Right />
```

With:
```tsx
<Page.Header.Right className="gap-1">
  {!isChatEmpty && (
    <button
      type="button"
      onClick={() => setShowContext((v) => !v)}
      className={cn(
        "flex size-7 items-center justify-center rounded-md border border-input hover:bg-accent transition-colors",
        showContext && "bg-accent",
      )}
      title="Toggle context panel"
    >
      <BarChart01 size={14} className="text-muted-foreground" />
    </button>
  )}
</Page.Header.Right>
```

**Step 3: Add panel to layout**

The home page layout is currently:
```tsx
<div className="flex size-full">
  <TasksPanel />
  <Chat className="flex-1 min-w-0 bg-background">
    ...
  </Chat>
</div>
```

Change to:
```tsx
<div className="flex size-full">
  <TasksPanel />
  <Chat className="flex-1 min-w-0 bg-background">
    ...
  </Chat>
  {showContext && (
    <ChatContextPanel onClose={() => setShowContext(false)} />
  )}
</div>
```

Apply same pattern for the `modelsConnections.length === 0` empty state.

**Step 4: Add needed imports**

Add to imports: `cn` from `@deco/ui/lib/utils.ts` and `useState` from `react`.
Check which icon is available: `grep -r "BarChart\|ChartBar\|Activity" node_modules/@untitledui/icons/dist/ --include="*.d.ts" -l | head -3`

Use whatever activity/stats icon is available. Fallback: use `AlignLeft` or `Info` from `@untitledui/icons`.

**Step 5: Type-check**

```bash
bun run --cwd=apps/mesh check 2>&1 | grep "home/page"
```

Expected: no errors

**Step 6: Commit**

```bash
git add apps/mesh/src/web/routes/orgs/home/page.tsx
git commit -m "feat(home): wire ChatContextPanel toggle into home page header"
```

---

### Task 3: Visual polish pass

**Files:**
- Modify: `apps/mesh/src/web/components/chat/context-panel.tsx`

**Step 1: Add slide-in animation**

The panel should animate in from the right. Add to the panel's outer div:
```tsx
className={cn(
  "flex flex-col h-full w-[320px] shrink-0 border-l border-border bg-background overflow-y-auto",
  "animate-in slide-in-from-right-4 duration-200",
  className,
)}
```

Note: Tailwind's `animate-in` requires `tailwindcss-animate` plugin. Check if available:
```bash
grep "tailwindcss-animate" apps/mesh/package.json apps/mesh/tailwind.config* 2>/dev/null | head -5
```

If not available, skip the animation class — the panel still works fine without it.

**Step 2: Usage progress bar**

Below the token metrics section, add a usage progress bar showing context fill:

```tsx
{contextWindow > 0 && usage.totalTokens > 0 && (
  <div className="flex flex-col gap-1">
    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          usagePct > 80 ? "bg-destructive" : usagePct > 60 ? "bg-warning" : "bg-primary",
        )}
        style={{ width: `${usagePct}%` }}
      />
    </div>
  </div>
)}
```

Place this immediately after the token metrics `StatGrid`.

**Step 3: Format model name**

Model IDs like `claude-sonnet-4-5-20251001` are ugly. Add a formatter:
```tsx
function formatModelId(id: string): string {
  // Remove date suffixes like -20251001
  return id.replace(/-\d{8}$/, "").replace(/-/g, " ");
}
```

Use in the Model stat: `value: formatModelId(selectedModel?.thinking?.id ?? "—")`

**Step 4: Type-check and format**

```bash
bun run --cwd=apps/mesh check 2>&1 | grep "context-panel"
bun run fmt
```

**Step 5: Commit**

```bash
git add apps/mesh/src/web/components/chat/context-panel.tsx
git commit -m "feat(home): polish context panel with progress bar and model name formatting"
```

---

### Task 4: Handle empty state

**Files:**
- Modify: `apps/mesh/src/web/components/chat/context-panel.tsx`

**Step 1: Add empty state when no thread is active**

If `messages.length === 0` and no `activeThread`, show a minimal placeholder instead of empty stat grids:

```tsx
if (!activeThread && messages.length === 0) {
  return (
    <div className={cn("flex flex-col h-full w-[320px] shrink-0 border-l border-border bg-background", className)}>
      <div className="h-12 px-4 flex items-center justify-between shrink-0 border-b border-border">
        <span className="text-sm font-medium text-foreground">Context</span>
        <button type="button" onClick={onClose} className="flex size-6 items-center justify-center rounded hover:bg-accent transition-colors">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Start a conversation to see context</p>
      </div>
    </div>
  );
}
```

**Step 2: Type-check**

```bash
bun run --cwd=apps/mesh check 2>&1 | grep "context-panel"
```

**Step 3: Final format + commit**

```bash
bun run fmt
git add apps/mesh/src/web/components/chat/context-panel.tsx
git commit -m "feat(home): add empty state to context panel for new sessions"
```
