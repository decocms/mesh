/**
 * SEO context page — /$org/$project/seo
 *
 * Shows organic traffic stats, keyword rankings, SEO findings, and an Agent Monitor card.
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
import {
  AlertCircle,
  ArrowRight,
  InfoCircle,
  SearchMd,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { useState } from "react";
import { toast } from "sonner";
import { HireAgentModal } from "@/web/components/onboarding/hire-agent-modal.tsx";
import type { AgentConfig } from "@/web/components/onboarding/hire-agent-modal.tsx";
import { Lock01, Check } from "@untitledui/icons";

// ─── Agent Config ──────────────────────────────────────────────────────────────

const SEO_AGENT_CONFIG: AgentConfig = {
  name: "SEO Optimizer",
  description:
    "Identifies keyword gaps, auto-generates missing meta descriptions, and proposes on-page improvements across your catalog.",
  icon: <SearchMd size={26} />,
  iconBgClass: "bg-blue-100 text-blue-600",
  installsName: "SEO",
  installsDescription: "Keyword tracking & recommendations",
  connections: [
    {
      name: "Google Search Console",
      description: "Keyword data & indexation status",
      iconUrl:
        "https://www.google.com/s2/favicons?domain=search.google.com&sz=32",
      requiredFor: ["autonomous"],
    },
    {
      name: "Ahrefs",
      description: "Backlink & competitor analysis",
      iconUrl: "https://www.google.com/s2/favicons?domain=ahrefs.com&sz=32",
      requiredFor: [],
    },
  ],
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Organic Traffic", value: "380K/mo" },
  { label: "Backlinks", value: "12.4K" },
  { label: "Authority Score", value: "34/100" },
];

const KEYWORDS = [
  { keyword: "farm rio", volume: "90K", position: 1 },
  { keyword: "vestidos estampados", volume: "34K", position: 3 },
  { keyword: "moda feminina", volume: "110K", position: 8 },
  { keyword: "farm rio usa", volume: "18K", position: 2 },
  { keyword: "vestidos florais", volume: "22K", position: 11 },
];

type Severity = "warning" | "info";

const SEO_ISSUES: {
  text: string;
  impact: string;
  severity: Severity;
}[] = [
  {
    text: "23 product pages missing meta descriptions — CTR drops ~30% without them",
    impact: "-$29K/yr",
    severity: "warning",
  },
  {
    text: "404 on /colecao/verao-2025 — receiving 340 hits/hr from Google organic",
    impact: "~$45K/yr",
    severity: "warning",
  },
  {
    text: "Newsletter popup fires immediately on mobile — 62% close rate",
    impact: "",
    severity: "info",
  },
  {
    text: "Hero images not optimized — adding 2.1s to load on collection pages",
    impact: "",
    severity: "info",
  },
];

const REPORTS = [
  {
    date: "Feb 25, 2026",
    title: "5 new keyword opportunities identified",
    dot: "bg-blue-500",
  },
  {
    date: "Feb 18, 2026",
    title: "2 meta descriptions auto-generated",
    dot: "bg-emerald-500",
  },
  {
    date: "Feb 11, 2026",
    title: "Authority score unchanged at 34",
    dot: "bg-muted-foreground/40",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "warning") {
    return (
      <div className="shrink-0 flex items-center justify-center size-6 rounded-full bg-orange-50 border border-orange-200">
        <AlertCircle size={12} className="text-orange-500" />
      </div>
    );
  }
  return (
    <div className="shrink-0 flex items-center justify-center size-6 rounded-full bg-blue-50 border border-blue-200">
      <InfoCircle size={12} className="text-blue-500" />
    </div>
  );
}

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

export default function SeoPage() {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const agentHired =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("mesh_seo_hired") === "true";

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
                <BreadcrumbPage>SEO</BreadcrumbPage>
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
              toast("SEO Optimizer is running an audit", {
                description: "Scanning keyword gaps and technical issues...",
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
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {STATS.map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-muted/50 p-3"
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Keywords */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Top Keywords
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                      Keyword
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                      Searches/mo
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                      Position
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {KEYWORDS.map((kw) => (
                    <tr key={kw.keyword} className="border-b border-border/30">
                      <td className="py-2.5 text-xs font-medium">
                        {kw.keyword}
                      </td>
                      <td className="py-2.5 text-xs text-right text-muted-foreground">
                        {kw.volume}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            kw.position <= 3
                              ? "text-green-600"
                              : kw.position <= 10
                                ? "text-amber-500"
                                : "text-muted-foreground",
                          )}
                        >
                          #{kw.position}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* SEO Findings */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Findings
              </p>
              <div className="flex flex-col">
                {SEO_ISSUES.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 border-b border-border/30 py-3 last:border-0"
                  >
                    <SeverityIcon severity={issue.severity} />
                    <p className="flex-1 text-xs text-foreground leading-relaxed">
                      {issue.text}
                    </p>
                    <span className="shrink-0 text-xs font-medium text-red-500">
                      {issue.impact}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Locked: SERP Features */}
            <LockedSection
              title="SERP Features"
              description="Hire the SEO Optimizer to monitor featured snippets, rich results, and knowledge panel presence for your top keywords."
              onHire={() => setHireModalOpen(true)}
            />

            {/* Locked: Crawl & Index Status */}
            <LockedSection
              title="Crawl & Index Status"
              description="Hire the SEO Optimizer to track indexed pages, crawl errors, and sitemap health across your entire catalog."
              onHire={() => setHireModalOpen(true)}
            />
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* Agent Monitor card */}
            <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <SearchMd size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">SEO Optimizer</p>
                  <p className="text-xs text-muted-foreground">
                    Keyword & on-page optimization
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Identifies keyword gaps, auto-generates missing meta
                descriptions, and proposes on-page improvements across your
                catalog.
              </p>
              {agentHired ? (
                <>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <Check size={12} />
                    Active — running weekly audits
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
              {REPORTS.map((r) => (
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
              ))}
            </div>
          </div>
        </div>
      </Page.Content>

      <HireAgentModal
        open={hireModalOpen}
        onOpenChange={setHireModalOpen}
        onHire={() => {
          localStorage.setItem("mesh_seo_hired", "true");
          window.dispatchEvent(new Event("mesh_seo_hired"));
          setHireModalOpen(false);
          setTimeout(() => {
            toast("SEO Optimizer is running an audit", {
              description: "Scanning keyword gaps and technical issues...",
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
        agent={SEO_AGENT_CONFIG}
      />
    </Page>
  );
}
