/**
 * Agents List Component for Home Page
 *
 * Displays a compact list of agents (Virtual MCPs) with their icon and name.
 * Only shows when the organization has agents.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  isDecopilot,
  WELL_KNOWN_AGENT_TEMPLATES,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import type { ProjectLocator } from "@decocms/mesh-sdk";

function readRecentAgentIds(locator: ProjectLocator): string[] {
  try {
    const raw = localStorage.getItem(`mesh:chat:recent-agents:${locator}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, Users03 } from "@untitledui/icons";
import { SiteEditorOnboardingModal } from "@/web/components/home/site-editor-onboarding-modal.tsx";
import { SiteDiagnosticsRecruitModal } from "@/web/components/home/site-diagnostics-recruit-modal.tsx";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { Suspense, useState } from "react";

/**
 * Individual agent preview component
 */
function AgentPreview({
  agent,
  onSpecialClick,
}: {
  agent: {
    id: string;
    title: string;
    icon?: string | null;
  };
  onSpecialClick?: () => void;
}) {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const handleClick = () => {
    if (onSpecialClick) {
      onSpecialClick();
    } else {
      navigate({
        to: "/$org/$virtualMcpId",
        params: { org: org.slug, virtualMcpId: agent.id },
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex flex-col items-center gap-3 p-2 rounded-lg",
        "transition-colors",
        "cursor-pointer",
        "w-[100px] shrink-0",
        "group",
      )}
      aria-label={`Select agent ${agent.title}`}
    >
      <IntegrationIcon
        icon={agent.icon}
        name={agent.title}
        size="md"
        fallbackIcon={<Users03 size={24} />}
        className="transition-transform group-hover:scale-110"
      />
      <p className="text-xs sm:text-sm text-foreground text-center leading-tight line-clamp-2 break-words w-full">
        {agent.title}
      </p>
    </button>
  );
}

/**
 * See All button component
 */
function SeeAllButton() {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  return (
    <button
      type="button"
      className={cn(
        "flex flex-col items-center gap-3 p-2 rounded-lg",
        "transition-colors",
        "cursor-pointer",
        "w-[100px] shrink-0",
        "group",
      )}
      aria-label="See all agents"
      onClick={() => {
        navigate({ to: "/$org/settings/agents", params: { org: org.slug } });
      }}
    >
      <div className="size-12 rounded-xl bg-accent flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
        <ChevronRight size={20} className="text-foreground" />
      </div>
      <p className="text-xs sm:text-sm text-foreground text-center leading-tight">
        See all
      </p>
    </button>
  );
}

/**
 * Agents list content component
 */
function CreateAgentButton() {
  const { createVirtualMCP, isCreating } = useCreateVirtualMCP({
    navigateOnCreate: true,
  });

  return (
    <button
      type="button"
      onClick={() => createVirtualMCP()}
      disabled={isCreating}
      className={cn(
        "flex flex-col items-center gap-3 p-2 rounded-lg",
        "transition-colors",
        "cursor-pointer",
        "w-[100px] shrink-0",
        "group",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
      aria-label="Create agent"
    >
      <div className="size-12 rounded-xl bg-background border-2 border-dashed border-border flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
        <Plus size={20} className="text-muted-foreground" />
      </div>
      <p className="text-xs sm:text-sm text-foreground text-center leading-tight">
        Create agent
      </p>
    </button>
  );
}

function AgentsListContent() {
  const virtualMcps = useVirtualMCPs();
  const { locator } = useProjectContext();
  const [siteEditorModalOpen, setSiteEditorModalOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const navigateToAgent = useNavigateToAgent();

  const siteEditorAgent = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "site-editor",
  )!;
  const siteDiagnosticsAgent = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "site-diagnostics",
  )!;

  const recentIds = readRecentAgentIds(locator);

  // Filter out Decopilot, sort by most recently used (from localStorage), then take top 5
  const agents = virtualMcps
    .filter(
      (agent): agent is typeof agent & { id: string } =>
        agent.id !== null && !isDecopilot(agent.id),
    )
    .sort((a, b) => {
      const aIdx = recentIds.indexOf(a.id);
      const bIdx = recentIds.indexOf(b.id);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    })
    .slice(0, 4);

  // Check if Site Diagnostics agent already exists (search full list, not just top-5)
  const existingDiagnostics = virtualMcps.find(
    (a): a is typeof a & { id: string } =>
      a.id !== null &&
      ((a as { metadata?: { type?: string } }).metadata?.type ===
        siteDiagnosticsAgent.id ||
        a.title === siteDiagnosticsAgent.title),
  );

  const hasAgents = agents.length > 0;

  return (
    <>
      <div className="w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        <div className="flex flex-wrap justify-center gap-1.5 max-md:flex-nowrap max-md:justify-start md:max-h-52 md:overflow-hidden">
          <AgentPreview
            key={siteEditorAgent.id}
            agent={siteEditorAgent}
            onSpecialClick={() => setSiteEditorModalOpen(true)}
          />
          <AgentPreview
            key={siteDiagnosticsAgent.id}
            agent={existingDiagnostics ?? siteDiagnosticsAgent}
            onSpecialClick={
              existingDiagnostics
                ? () => navigateToAgent(existingDiagnostics.id)
                : () => setDiagnosticsModalOpen(true)
            }
          />
          {agents
            .filter((a) => a.id !== existingDiagnostics?.id)
            .map((agent) => (
              <AgentPreview
                key={agent.id ?? "default"}
                agent={agent}
                onSpecialClick={() => navigateToAgent(agent.id)}
              />
            ))}
          <CreateAgentButton />
          {hasAgents && <SeeAllButton />}
        </div>
      </div>

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

/**
 * Skeleton loader for agents list
 */
function AgentsListSkeleton() {
  return (
    <div className="w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
      <div className="flex flex-wrap justify-center gap-1.5 max-md:flex-nowrap max-md:justify-start md:max-h-52 md:overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
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

/**
 * Agents list component with Suspense boundary
 */
export function AgentsList() {
  return (
    <Suspense fallback={<AgentsListSkeleton />}>
      <AgentsListContent />
    </Suspense>
  );
}
