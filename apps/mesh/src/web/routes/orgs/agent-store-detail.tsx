/**
 * Agent Store Detail — /$org/$project/hire/$agentId
 *
 * Full detail page for a catalog agent. All data is mocked.
 */

import { Page } from "@/web/components/page";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@deco/ui/components/breadcrumb.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart10,
  Eye,
  File06,
  Package,
  SearchMd,
  TrendUp01,
  Zap,
} from "@untitledui/icons";
import type { ReactNode } from "react";
import { useState } from "react";
import { type CatalogAgent, CATALOG } from "./agents-marketplace.tsx";

// ─── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS: Record<string, string> = {
  "blog-post-generator": "bg-violet-100 text-violet-700",
  "seo-optimizer": "bg-blue-100 text-blue-700",
  "performance-monitor": "bg-orange-100 text-orange-700",
  "catalog-manager": "bg-emerald-100 text-emerald-700",
  "conversion-analyst": "bg-rose-100 text-rose-700",
  "competitor-tracker": "bg-amber-100 text-amber-700",
};

const AVATAR_BAR_COLORS: Record<string, string> = {
  "blog-post-generator": "bg-violet-500",
  "seo-optimizer": "bg-blue-500",
  "performance-monitor": "bg-orange-500",
  "catalog-manager": "bg-emerald-500",
  "conversion-analyst": "bg-rose-500",
  "competitor-tracker": "bg-amber-500",
};

const AGENT_ICONS: Record<string, ReactNode> = {
  "blog-post-generator": <File06 size={22} />,
  "seo-optimizer": <SearchMd size={22} />,
  "performance-monitor": <BarChart10 size={22} />,
  "catalog-manager": <Package size={22} />,
  "conversion-analyst": <TrendUp01 size={22} />,
  "competitor-tracker": <Eye size={22} />,
};

// ─── Per-agent extra data ──────────────────────────────────────────────────────

interface AgentExtra {
  systemPrompt: string;
  triggers: { label: string; nextRun: string }[];
  connectionDetails: {
    name: string;
    domain: string;
    toolsUsed: number;
    totalTools: number;
  }[];
  metrics: {
    totalTasks: string;
    approvalRate: string;
    avgDuration: string;
    approvedOf: string;
  };
  autonomy: string;
  triggerFrequency: string;
}

const AGENT_EXTRA: Record<string, AgentExtra> = {
  "blog-post-generator": {
    systemPrompt:
      "You are a content marketing specialist for e-commerce brands. Given a store's brand context and keyword opportunity, you research, outline, and write SEO-optimized blog posts that match the brand's tone. You always include a clear call to action and internal links to relevant product pages.",
    triggers: [
      {
        label: "Weekly, Monday 9:00",
        nextRun: "Next run in 5d",
      },
    ],
    connectionDetails: [
      {
        name: "Google Search Console",
        domain: "search.google.com",
        toolsUsed: 3,
        totalTools: 5,
      },
      {
        name: "GitHub",
        domain: "github.com",
        toolsUsed: 2,
        totalTools: 4,
      },
    ],
    metrics: {
      totalTasks: "24",
      approvalRate: "91%",
      avgDuration: "4m 12s",
      approvedOf: "22 of 24 tasks approved",
    },
    autonomy: "Review",
    triggerFrequency: "Weekly",
  },
  "seo-optimizer": {
    systemPrompt:
      "You are an SEO specialist for e-commerce storefronts. You analyze keyword gaps, on-page optimization opportunities, and technical SEO issues. Your recommendations are prioritized by estimated traffic impact and implementation difficulty.",
    triggers: [],
    connectionDetails: [
      {
        name: "Google Search Console",
        domain: "search.google.com",
        toolsUsed: 4,
        totalTools: 5,
      },
      {
        name: "Google Analytics",
        domain: "analytics.google.com",
        toolsUsed: 3,
        totalTools: 6,
      },
    ],
    metrics: {
      totalTasks: "—",
      approvalRate: "—",
      avgDuration: "—",
      approvedOf: "No tasks yet",
    },
    autonomy: "Review",
    triggerFrequency: "Not configured",
  },
  "performance-monitor": {
    systemPrompt:
      "You are a web performance engineer specializing in Core Web Vitals for e-commerce sites. You monitor LCP, CLS, and INP daily, identify regressions, and surface actionable fix recommendations before they impact conversion rates.",
    triggers: [],
    connectionDetails: [
      {
        name: "PageSpeed API",
        domain: "developers.google.com",
        toolsUsed: 2,
        totalTools: 3,
      },
    ],
    metrics: {
      totalTasks: "—",
      approvalRate: "—",
      avgDuration: "—",
      approvedOf: "No tasks yet",
    },
    autonomy: "Review",
    triggerFrequency: "Not configured",
  },
  "catalog-manager": {
    systemPrompt:
      "You are a catalog quality specialist for e-commerce stores. You audit product listings for missing images, broken variants, pricing inconsistencies, and incomplete descriptions. Your reports include specific SKUs and actionable fixes.",
    triggers: [],
    connectionDetails: [
      {
        name: "VTEX",
        domain: "vtex.com",
        toolsUsed: 5,
        totalTools: 8,
      },
      {
        name: "Shopify",
        domain: "shopify.com",
        toolsUsed: 4,
        totalTools: 7,
      },
    ],
    metrics: {
      totalTasks: "—",
      approvalRate: "—",
      avgDuration: "—",
      approvedOf: "No tasks yet",
    },
    autonomy: "Review",
    triggerFrequency: "Not configured",
  },
  "conversion-analyst": {
    systemPrompt:
      "You are a conversion rate optimization analyst. You examine funnel analytics, identify drop-off points, and generate data-backed A/B test hypotheses. Each hypothesis includes expected uplift range, implementation effort, and measurement plan.",
    triggers: [],
    connectionDetails: [
      {
        name: "Google Analytics",
        domain: "analytics.google.com",
        toolsUsed: 5,
        totalTools: 6,
      },
      {
        name: "Hotjar",
        domain: "hotjar.com",
        toolsUsed: 3,
        totalTools: 4,
      },
    ],
    metrics: {
      totalTasks: "—",
      approvalRate: "—",
      avgDuration: "—",
      approvedOf: "No tasks yet",
    },
    autonomy: "Review",
    triggerFrequency: "Not configured",
  },
  "competitor-tracker": {
    systemPrompt:
      "You are a competitive intelligence analyst for e-commerce brands. You monitor competitor pricing, promotions, new product launches, and messaging changes on a weekly basis. Your reports highlight opportunities and threats relevant to the brand's current strategy.",
    triggers: [],
    connectionDetails: [],
    metrics: {
      totalTasks: "—",
      approvalRate: "—",
      avgDuration: "—",
      approvedOf: "No tasks yet",
    },
    autonomy: "Review",
    triggerFrequency: "Not configured",
  },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function TasksTab({ agent }: { agent: CatalogAgent }) {
  if (!agent.hired) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
        <div className="size-2 shrink-0 rounded-full bg-amber-400" />
        <span className="flex-1 text-sm text-foreground">
          Write: Best smart home accessories under $50
        </span>
        <Badge
          variant="outline"
          className="text-amber-600 border-amber-400/50 text-[11px]"
        >
          Needs Action
        </Badge>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          2h ago
        </span>
      </div>
    </div>
  );
}

function ConnectionsTab({ extra }: { extra: AgentExtra }) {
  if (extra.connectionDetails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
        <p className="text-sm text-muted-foreground">No connections bound.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {extra.connectionDetails.map((conn) => (
        <div
          key={conn.name}
          className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
        >
          <img
            src={`https://www.google.com/s2/favicons?domain=${conn.domain}&sz=24`}
            alt={conn.name}
            className="size-5 rounded-sm shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{conn.name}</p>
            <p className="text-xs text-muted-foreground">
              Using {conn.toolsUsed} of {conn.totalTools} tools
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemPromptTab({ extra }: { extra: AgentExtra }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Badge variant="outline" className="text-muted-foreground text-[11px]">
          Read only
        </Badge>
      </div>
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {extra.systemPrompt}
        </p>
      </div>
    </div>
  );
}

function MetricsTab({
  agent,
  extra,
}: {
  agent: CatalogAgent;
  extra: AgentExtra;
}) {
  const stats = [
    { label: "Total Tasks Run", value: extra.metrics.totalTasks },
    { label: "Approval Rate", value: extra.metrics.approvalRate },
    { label: "Avg. Task Duration", value: extra.metrics.avgDuration },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card px-4 py-4 flex flex-col gap-1"
          >
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {value}
            </span>
          </div>
        ))}
      </div>
      {!agent.hired && (
        <p className="text-xs text-muted-foreground text-center">
          Hire this agent to see metrics.
        </p>
      )}
    </div>
  );
}

function ApprovalRatePanel({
  agent,
  extra,
}: {
  agent: CatalogAgent;
  extra: AgentExtra;
}) {
  const barColor = AVATAR_BAR_COLORS[agent.id] ?? "bg-muted-foreground";
  const pct = agent.hired ? agent.approvalPct : 0;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4 flex flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Approval Rate
      </span>
      <span className="text-4xl font-bold text-foreground tabular-nums">
        {agent.hired ? `${agent.approvalPct}%` : "—"}
      </span>
      <div className="w-full rounded-full bg-muted h-1.5 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {extra.metrics.approvedOf}
      </span>
    </div>
  );
}

function SettingsPanel({
  agent,
  extra,
}: {
  agent: CatalogAgent;
  extra: AgentExtra;
}) {
  const rows = [
    { label: "Autonomy", value: extra.autonomy },
    { label: "Notifications", value: "All notifications" },
    { label: "Trigger frequency", value: extra.triggerFrequency },
  ];

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4 flex flex-col gap-3 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Settings
        </span>
        <Badge variant="outline" className="text-muted-foreground text-[11px]">
          Read only
        </Badge>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className={cn(
              "flex items-center justify-between gap-2",
              !agent.hired && "opacity-40",
            )}
          >
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>
      {!agent.hired && (
        <div className="absolute inset-0 flex items-end justify-center pb-3 bg-gradient-to-t from-card/80 to-transparent">
          <span className="text-xs text-muted-foreground">
            Hire to configure
          </span>
        </div>
      )}
    </div>
  );
}

function ConnectionsSummaryPanel({ agent }: { agent: CatalogAgent }) {
  const extra = AGENT_EXTRA[agent.id];
  if (!extra) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4 flex flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Connections ({agent.connections.length})
      </span>
      {agent.connections.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <div className="flex flex-col gap-2">
          {agent.connections.map((conn) => {
            const detail = extra.connectionDetails.find((d) => d.name === conn);
            const domain = detail?.domain ?? "google.com";
            return (
              <div key={conn} className="flex items-center gap-2">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                  alt={conn}
                  className="size-4 rounded-sm shrink-0"
                />
                <span className="text-xs text-foreground">{conn}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AgentStoreDetailPage() {
  const params = useParams({ strict: false }) as { agentId?: string };
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("tasks");

  const agent: CatalogAgent =
    CATALOG.find((a) => a.id === params.agentId) ??
    (CATALOG[0] as CatalogAgent);
  const extra: AgentExtra =
    AGENT_EXTRA[agent.id] ?? (AGENT_EXTRA["blog-post-generator"] as AgentExtra);
  const avatarColor =
    AVATAR_COLORS[agent.id] ?? "bg-muted text-muted-foreground";
  const icon = AGENT_ICONS[agent.id] ?? (
    <span className="text-base font-bold">{agent.name[0]}</span>
  );

  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/$org/$project/hire",
                      params: { org: org.slug, project: project.slug },
                    })
                  }
                >
                  Agents
                </button>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{agent.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>

      <Page.Content>
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
          {/* Header row */}
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "shrink-0 flex items-center justify-center size-12 rounded-xl",
                avatarColor,
              )}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-foreground">
                  {agent.name}
                </h1>
                {agent.hired && (
                  <Badge variant="success" className="text-xs">
                    Hired
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {agent.description}
              </p>
            </div>
            {!agent.hired && (
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => {}}>
                Hire this agent
                <ArrowRight size={14} />
              </Button>
            )}
          </div>

          {/* Triggers section */}
          <div className="rounded-xl border border-border px-4 py-3 flex items-center gap-3">
            <Zap size={16} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Triggers
            </span>
            <Badge
              variant="outline"
              className="text-muted-foreground text-[11px]"
            >
              {extra.triggers.length}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              Read only
            </span>
            {extra.triggers.length > 0 ? (
              <span className="text-xs text-muted-foreground border-l border-border pl-3">
                {extra.triggers.at(0)?.label} · {extra.triggers.at(0)?.nextRun}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground border-l border-border pl-3">
                No triggers configured
              </span>
            )}
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
            {/* LEFT: Tabs */}
            <div className="min-w-0">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                variant="underline"
              >
                <TabsList variant="underline">
                  <TabsTrigger value="tasks" variant="underline">
                    Tasks
                  </TabsTrigger>
                  <TabsTrigger value="connections" variant="underline">
                    Connections
                  </TabsTrigger>
                  <TabsTrigger value="system-prompt" variant="underline">
                    System Prompt
                  </TabsTrigger>
                  <TabsTrigger value="metrics" variant="underline">
                    Metrics
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tasks" className="pt-4">
                  <TasksTab agent={agent} />
                </TabsContent>

                <TabsContent value="connections" className="pt-4">
                  <ConnectionsTab extra={extra} />
                </TabsContent>

                <TabsContent value="system-prompt" className="pt-4">
                  <SystemPromptTab extra={extra} />
                </TabsContent>

                <TabsContent value="metrics" className="pt-4">
                  <MetricsTab agent={agent} extra={extra} />
                </TabsContent>
              </Tabs>
            </div>

            {/* RIGHT: sidebar panels */}
            <div className="flex flex-col gap-4">
              <ApprovalRatePanel agent={agent} extra={extra} />
              <SettingsPanel agent={agent} extra={extra} />
              <ConnectionsSummaryPanel agent={agent} />
            </div>
          </div>
        </div>
      </Page.Content>
    </Page>
  );
}
