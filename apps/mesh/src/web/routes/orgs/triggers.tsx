/**
 * Triggers page — /$org/$project/triggers
 *
 * Shows a list of configured agent triggers (schedule-based).
 * All data is mocked.
 */

import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

// ─── Mock data ──────────────────────────────────────────────────────────────

interface Trigger {
  id: string;
  agent: string;
  agentColor: string;
  type: "schedule";
  schedule: string;
  nextRun: string;
  lastRun: string;
  enabled: boolean;
  action: string;
}

const TRIGGERS: Trigger[] = [
  {
    id: "t1",
    agent: "Blog Post Generator",
    agentColor: "bg-violet-100 text-violet-600",
    type: "schedule",
    schedule: "Every Monday, 9:00am",
    nextRun: "in 4 days",
    lastRun: "Feb 24, 2026",
    enabled: true,
    action: "Generate new blog post draft",
  },
  {
    id: "t2",
    agent: "Performance Monitor",
    agentColor: "bg-orange-100 text-orange-600",
    type: "schedule",
    schedule: "Every day, 6:00am",
    nextRun: "Tomorrow 6:00am",
    lastRun: "Feb 25, 2026",
    enabled: false,
    action: "Run Core Web Vitals check",
  },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function AgentAvatar({
  name,
  colorClass,
}: {
  name: string;
  colorClass: string;
}) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        colorClass,
      )}
    >
      {name[0]}
    </div>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset">
      Inactive
    </span>
  );
}

function ToggleVisual({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-default items-center rounded-full transition-colors",
        enabled ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-4" : "translate-x-1",
        )}
      />
    </div>
  );
}

function TriggerRow({ trigger }: { trigger: Trigger }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-6 py-4 last:border-b-0">
      {/* Agent avatar + info */}
      <AgentAvatar name={trigger.agent} colorClass={trigger.agentColor} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {trigger.agent}
          </span>
          <StatusBadge enabled={trigger.enabled} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {trigger.action}
        </p>
      </div>

      {/* Schedule */}
      <div className="hidden w-44 shrink-0 sm:block">
        <p className="text-sm text-foreground">{trigger.schedule}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Next: {trigger.nextRun}
        </p>
      </div>

      {/* Last run */}
      <div className="hidden w-32 shrink-0 text-right lg:block">
        <p className="text-xs text-muted-foreground">Last run</p>
        <p className="text-sm text-foreground">{trigger.lastRun}</p>
      </div>

      {/* Toggle */}
      <ToggleVisual enabled={trigger.enabled} />
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TriggersPage() {
  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Triggers</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
        <Page.Header.Right>
          <Button variant="outline" size="sm">
            New trigger
          </Button>
        </Page.Header.Right>
      </Page.Header>

      <Page.Content>
        <div className="mx-auto max-w-4xl px-6 py-8">
          {TRIGGERS.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              {TRIGGERS.map((trigger) => (
                <TriggerRow key={trigger.id} trigger={trigger} />
              ))}
            </div>
          ) : null}

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Triggers run agent tools on a schedule or in response to events.
            Hire an agent to configure its triggers.
          </p>
        </div>
      </Page.Content>
    </Page>
  );
}
