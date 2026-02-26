/**
 * Reputation context page — /$org/$project/reputation
 *
 * Shows reputation score, sentiment breakdown, complaint themes, and an Agent Monitor card.
 */

import { Page } from "@/web/components/page";
import { useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@deco/ui/components/breadcrumb.tsx";
import { Globe02, Lock01, Check, ArrowRight } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { useState } from "react";
import { toast } from "sonner";
import { HireAgentModal } from "@/web/components/onboarding/hire-agent-modal.tsx";
import type { AgentConfig } from "@/web/components/onboarding/hire-agent-modal.tsx";

// ─── Data ─────────────────────────────────────────────────────────────────────

const REP = {
  score: 7.8,
  reviews: 3241,
  responseRate: 92,
  avgResolution: "1.8 days",
  sentiment: { positive: 71, neutral: 19, negative: 10 },
  themes: [
    { label: "Shipping delays", pct: 28 },
    { label: "Sizing inconsistency", pct: 24 },
    { label: "Return process", pct: 18 },
    { label: "Product quality", pct: 20 },
    { label: "Other", pct: 10 },
  ],
};

// ─── Agent config ─────────────────────────────────────────────────────────────

const REPUTATION_AGENT_CONFIG: AgentConfig = {
  name: "Reputation Monitor",
  description:
    "Tracks reviews, flags sentiment drops, and escalates unresolved complaints automatically.",
  icon: <Globe02 size={26} />,
  iconBgClass: "bg-green-100 text-green-600",
  installsName: "Reputation",
  installsDescription: "Review tracking & alerts",
  connections: [
    {
      name: "Trustpilot",
      description: "Review monitoring",
      iconUrl: "https://www.google.com/s2/favicons?domain=trustpilot.com&sz=32",
      requiredFor: [],
    },
    {
      name: "Google Business",
      description: "Google review responses",
      iconUrl:
        "https://www.google.com/s2/favicons?domain=business.google.com&sz=32",
      requiredFor: ["autonomous"],
    },
  ],
};

// ─── Locked section ───────────────────────────────────────────────────────────

function LockedSection({
  title,
  description,
  onHire,
}: {
  title: string;
  description: string;
  onHire: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 flex flex-col items-center gap-3">
        <div className="size-8 rounded-full bg-muted flex items-center justify-center">
          <Lock01 size={14} className="text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            Data unavailable
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
            {description}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onHire} className="mt-1">
          Hire agent to unlock
          <ArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReputationPage() {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const agentHired =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("mesh_reputation_hired") === "true";

  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span className="text-sm text-muted-foreground">Context</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Reputation</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
        <Page.Header.Right>
          <button
            type="button"
            onClick={() =>
              navigate({
                to: "/$org/$project/triggers",
                params: { org: org.slug, project: project.slug },
              })
            }
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Last checked 2h ago →
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (!agentHired) {
                setHireModalOpen(true);
                return;
              }
              toast("Reputation Monitor is scanning review platforms", {
                description: "Checking reviews and brand mentions...",
                action: {
                  label: "View task",
                  onClick: () =>
                    navigate({
                      to: "/$org/$project/tasks",
                      params: { org: org.slug, project: project.slug },
                    }),
                },
                duration: 6000,
              });
            }}
          >
            Run check
          </Button>
        </Page.Header.Right>
      </Page.Header>

      <Page.Content className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-[1fr_280px] gap-8">
          {/* Left column */}
          <div className="flex flex-col gap-6">
            {/* Score */}
            <div className="flex items-center gap-5">
              <div className="flex shrink-0 flex-col items-center justify-center size-20 rounded-full border-4 border-green-400 bg-green-50">
                <span className="text-2xl font-bold text-green-600">
                  {REP.score}
                </span>
                <span className="text-[10px] text-muted-foreground">/10</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-sm text-foreground">
                  Good reputation
                </p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{REP.reviews.toLocaleString()} reviews</span>
                  <span>{REP.responseRate}% response rate</span>
                  <span>avg. {REP.avgResolution} resolution</span>
                </div>
              </div>
            </div>

            {/* Sentiment */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sentiment breakdown
              </p>
              <div className="flex flex-col gap-2.5">
                {[
                  {
                    label: "Positive",
                    pct: REP.sentiment.positive,
                    color: "bg-green-500",
                  },
                  {
                    label: "Neutral",
                    pct: REP.sentiment.neutral,
                    color: "bg-muted-foreground/30",
                  },
                  {
                    label: "Negative",
                    pct: REP.sentiment.negative,
                    color: "bg-red-400",
                  },
                ].map(({ label, pct, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-14 text-xs text-muted-foreground">
                      {label}
                    </span>
                    <div className="flex-1 rounded-full bg-muted h-1.5 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-medium">
                      {pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Complaint themes */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Top complaint themes
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                      Theme
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {REP.themes.map((t) => (
                    <tr key={t.label} className="border-b border-border/30">
                      <td className="py-2.5 text-xs font-medium">{t.label}</td>
                      <td className="py-2.5 text-xs text-right text-muted-foreground">
                        {t.pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Locked: Brand Mentions */}
            <LockedSection
              title="Brand Mentions"
              description="Hire the Reputation Monitor to track brand mentions across social media, forums, and news outlets."
              onHire={() => setHireModalOpen(true)}
            />

            {/* Locked: NPS Score */}
            <LockedSection
              title="NPS Score"
              description="Hire the Reputation Monitor to track Net Promoter Score from post-purchase surveys and customer feedback."
              onHire={() => setHireModalOpen(true)}
            />
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* Agent Monitor card */}
            <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  <Globe02 size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Reputation Monitor</p>
                  <p className="text-xs text-muted-foreground">
                    Review tracking & sentiment alerts
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tracks reviews, flags sentiment drops, and escalates unresolved
                complaints automatically across all major platforms.
              </p>
              {agentHired ? (
                <>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <Check size={12} />
                    Active — monitoring reputation
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      navigate({
                        to: "/$org/$project/tasks",
                        params: { org: org.slug, project: project.slug },
                      })
                    }
                  >
                    View tasks
                    <ArrowRight size={13} />
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setHireModalOpen(true)}
                >
                  Hire this agent
                  <ArrowRight size={13} />
                </Button>
              )}
            </div>

            {/* Reports timeline */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent reports
              </p>
              {agentHired ? (
                [
                  {
                    date: "Just now",
                    title: "Reputation scan started",
                    dot: "bg-blue-500",
                  },
                ].map((r) => (
                  <div
                    key={r.date}
                    className="flex items-start gap-2.5 py-2 border-b border-border/40 last:border-0"
                  >
                    <div
                      className={cn(
                        "size-1.5 rounded-full mt-1.5 shrink-0",
                        r.dot,
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {r.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.date}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No reports yet. Hire an agent to start monitoring.
                </p>
              )}
            </div>
          </div>
        </div>
      </Page.Content>

      <HireAgentModal
        open={hireModalOpen}
        onOpenChange={setHireModalOpen}
        onHire={() => {
          localStorage.setItem("mesh_reputation_hired", "true");
          window.dispatchEvent(new Event("mesh_reputation_hired"));
          setHireModalOpen(false);
          setTimeout(() => {
            toast("Reputation Monitor is scanning review platforms", {
              description: "Checking reviews and brand mentions...",
              action: {
                label: "View task",
                onClick: () =>
                  navigate({
                    to: "/$org/$project/tasks",
                    params: { org: org.slug, project: project.slug },
                  }),
              },
              duration: 6000,
            });
          }, 800);
        }}
        agent={REPUTATION_AGENT_CONFIG}
      />
    </Page>
  );
}
