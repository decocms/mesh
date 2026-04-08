/**
 * QuickActions - Action-oriented items for the home page.
 * Replaces the agents list with actions like "New Site", "New Diagnostic", etc.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import {
  BarChart12,
  ChevronRight,
  Globe04,
  Plus,
  PresentationChart01,
} from "@untitledui/icons";
import {
  isDecopilot,
  WELL_KNOWN_AGENT_TEMPLATES,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { SiteEditorOnboardingModal } from "@/web/components/home/site-editor-onboarding-modal";
import { SiteDiagnosticsRecruitModal } from "@/web/components/home/site-diagnostics-recruit-modal";
import {
  getRecentArtifacts,
  formatRelativeTime,
  type Artifact,
  type ArtifactType,
} from "@/web/lib/mock-artifacts";

// ---------- Action item (replaces agent preview) ----------

const ACTION_ICON_CONFIG: Record<
  string,
  { Icon: typeof PresentationChart01; color: string; bg: string }
> = {
  "site-editor": {
    Icon: Globe04,
    color: "#3B82F6",
    bg: "bg-blue-100 dark:bg-blue-900/50",
  },
  "site-diagnostics": {
    Icon: BarChart12,
    color: "#10B981",
    bg: "bg-emerald-100 dark:bg-emerald-900/50",
  },
};

function ActionItem({
  label,
  icon,
  iconColor,
  onClick,
}: {
  label: string;
  icon?: string | null;
  iconColor?: string;
  onClick?: () => void;
}) {
  const config = icon ? ACTION_ICON_CONFIG[icon] : undefined;
  const Icon = config?.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-3 p-2 rounded-lg",
        "transition-colors cursor-pointer w-[100px] shrink-0 group",
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "size-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
            config?.bg,
          )}
        >
          <Icon size={24} style={{ color: config?.color }} />
        </div>
      ) : iconColor ? (
        <div
          className="size-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
          style={{ backgroundColor: `${iconColor}20` }}
        >
          <PresentationChart01 size={24} style={{ color: iconColor }} />
        </div>
      ) : (
        <div className="size-12 rounded-xl bg-background border-2 border-dashed border-border flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
          <Plus size={20} className="text-muted-foreground" />
        </div>
      )}
      <p className="text-xs sm:text-sm text-foreground text-center leading-tight line-clamp-2 break-words w-full">
        {label}
      </p>
    </button>
  );
}

// ---------- Recent artifacts ----------

const ARTIFACT_ICON: Record<
  ArtifactType,
  { Icon: typeof PresentationChart01; color: string }
> = {
  deck: { Icon: PresentationChart01, color: "#8B5CF6" },
  report: { Icon: BarChart12, color: "#10B981" },
  site: { Icon: Globe04, color: "#3B82F6" },
};

function ArtifactRow({ artifact }: { artifact: Artifact }) {
  const config = ARTIFACT_ICON[artifact.type];
  const { Icon } = config;

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-left",
        "transition-colors hover:bg-accent/50 cursor-pointer",
      )}
    >
      <div
        className="flex items-center justify-center size-7 rounded-md shrink-0"
        style={{ backgroundColor: `${config.color}15` }}
      >
        <Icon size={14} style={{ color: config.color }} />
      </div>
      <span className="flex-1 text-sm text-foreground truncate min-w-0">
        {artifact.title}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatRelativeTime(artifact.updatedAt)}
      </span>
    </button>
  );
}

function RecentSection() {
  const recentArtifacts = getRecentArtifacts(5);
  if (recentArtifacts.length === 0) return null;

  return (
    <div className="w-full max-w-[672px] mx-auto mt-14">
      <div className="flex items-center justify-between mb-3 px-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Recent
        </h3>
      </div>
      <div className="flex flex-col">
        {recentArtifacts.map((artifact) => (
          <ArtifactRow key={artifact.id} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}

// ---------- Main content ----------

function QuickActionsContent() {
  const virtualMcps = useVirtualMCPs();
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const navigateToAgent = useNavigateToAgent();
  const [siteEditorModalOpen, setSiteEditorModalOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const { createVirtualMCP } = useCreateVirtualMCP({
    navigateOnCreate: true,
  });

  const siteDiagnosticsAgent = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "site-diagnostics",
  )!;

  const existingDiagnostics = virtualMcps.find(
    (a): a is typeof a & { id: string } =>
      a.id !== null &&
      ((a as { metadata?: { type?: string } }).metadata?.type ===
        siteDiagnosticsAgent.id ||
        a.title === siteDiagnosticsAgent.title),
  );

  return (
    <>
      {/* Action items row */}
      <div className="w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        <div className="flex flex-wrap justify-center gap-1.5 max-md:flex-nowrap max-md:justify-start md:max-h-52 md:overflow-hidden">
          <ActionItem
            label="New Site"
            icon="site-editor"
            onClick={() => setSiteEditorModalOpen(true)}
          />
          <ActionItem
            label="New Diagnostic"
            icon="site-diagnostics"
            onClick={
              existingDiagnostics
                ? () => navigateToAgent(existingDiagnostics.id)
                : () => setDiagnosticsModalOpen(true)
            }
          />
          {/* Custom agents as actions */}
          {virtualMcps
            .filter(
              (a): a is typeof a & { id: string } =>
                a.id !== null &&
                !isDecopilot(a.id) &&
                a.id !== existingDiagnostics?.id,
            )
            .slice(0, 4)
            .map((agent) => (
              <ActionItem
                key={agent.id}
                label={agent.title}
                iconColor="#8B5CF6"
                onClick={() => navigateToAgent(agent.id)}
              />
            ))}
          <ActionItem label="New project" onClick={() => createVirtualMCP()} />
          <button
            type="button"
            className={cn(
              "flex flex-col items-center gap-3 p-2 rounded-lg",
              "transition-colors cursor-pointer w-[100px] shrink-0 group",
            )}
            onClick={() => {
              navigate({
                to: "/$org/settings/agents",
                params: { org: org.slug },
              });
            }}
          >
            <div className="size-12 rounded-xl bg-accent flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
              <ChevronRight size={20} className="text-foreground" />
            </div>
            <p className="text-xs sm:text-sm text-foreground text-center leading-tight">
              See all
            </p>
          </button>
        </div>
      </div>

      {/* Recent */}
      <RecentSection />

      <SiteEditorOnboardingModal
        open={siteEditorModalOpen}
        onOpenChange={setSiteEditorModalOpen}
      />
      <SiteDiagnosticsRecruitModal
        open={diagnosticsModalOpen}
        onOpenChange={setDiagnosticsModalOpen}
        existingAgent={existingDiagnostics}
      />
    </>
  );
}

function QuickActionsSkeleton() {
  return (
    <div className="w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
      <div className="flex flex-wrap justify-center gap-1.5 max-md:flex-nowrap max-md:justify-start md:max-h-52 md:overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-3 p-2 w-[100px] shrink-0"
          >
            <Skeleton className="size-12 rounded-xl shrink-0" />
            <Skeleton className="h-3 sm:h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuickActions() {
  return (
    <Suspense fallback={<QuickActionsSkeleton />}>
      <QuickActionsContent />
    </Suspense>
  );
}
