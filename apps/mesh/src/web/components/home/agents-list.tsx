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
import { ImportFromDecoDialog } from "@/web/components/import-from-deco-dialog.tsx";
import { SiteDiagnosticsRecruitModal } from "@/web/components/home/site-diagnostics-recruit-modal.tsx";
import { AiImageRecruitModal } from "@/web/components/home/ai-image-recruit-modal.tsx";
import { AiResearchRecruitModal } from "@/web/components/home/ai-research-recruit-modal.tsx";
import { SelfHealingRepoFlow } from "@/web/components/self-healing-repo/self-healing-repo-flow.tsx";
import { GitHubIcon } from "@/web/components/icons/github-icon";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { usePreferences } from "@/web/hooks/use-preferences.ts";
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
      const taskId = crypto.randomUUID();
      navigate({
        to: "/$org/$taskId",
        params: { org: org.slug, taskId },
        search: { virtualmcpid: agent.id },
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
  const [importDecoOpen, setImportDecoOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [aiImageModalOpen, setAiImageModalOpen] = useState(false);
  const [aiResearchModalOpen, setAiResearchModalOpen] = useState(false);
  const [selfHealingOpen, setSelfHealingOpen] = useState(false);
  const [preferences] = usePreferences();
  const navigateToAgent = useNavigateToAgent();

  const siteEditorAgent = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "site-editor",
  )!;
  const siteDiagnosticsAgent = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "site-diagnostics",
  )!;
  const aiImageAgent = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "ai-image",
  )!;
  const aiResearchAgent = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "ai-research",
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

  // Check if AI Image agent already exists
  const existingAiImage = virtualMcps.find(
    (a): a is typeof a & { id: string } =>
      a.id !== null &&
      ((a as { metadata?: { type?: string } }).metadata?.type ===
        aiImageAgent.id ||
        a.title === aiImageAgent.title),
  );

  // Check if AI Research agent already exists
  const existingAiResearch = virtualMcps.find(
    (a): a is typeof a & { id: string } =>
      a.id !== null &&
      ((a as { metadata?: { type?: string } }).metadata?.type ===
        aiResearchAgent.id ||
        a.title === aiResearchAgent.title),
  );

  const hasAgents = agents.length > 0;

  return (
    <>
      {preferences.experimental_vibecode && (
        <div className="w-full flex justify-center mb-4">
          <button
            type="button"
            onClick={() => setSelfHealingOpen(true)}
            className="w-full max-w-[560px] flex items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3 text-left transition-colors hover:border-primary/50 hover:from-primary/15 cursor-pointer group"
          >
            <div className="size-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <GitHubIcon className="size-5 text-primary" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium text-foreground leading-tight">
                Set up self-healing repo
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2">
                Connect GitHub and add specialist monitors that open issues
                automatically.
              </span>
            </div>
          </button>
        </div>
      )}
      <div className="w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        <div className="flex flex-wrap justify-center gap-1.5 max-md:flex-nowrap max-md:justify-start md:max-h-52 md:overflow-hidden">
          <AgentPreview
            key={siteEditorAgent.id}
            agent={siteEditorAgent}
            onSpecialClick={() => setImportDecoOpen(true)}
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
          <AgentPreview
            key={aiImageAgent.id}
            agent={existingAiImage ?? aiImageAgent}
            onSpecialClick={
              existingAiImage
                ? () => navigateToAgent(existingAiImage.id)
                : () => setAiImageModalOpen(true)
            }
          />
          <AgentPreview
            key={aiResearchAgent.id}
            agent={existingAiResearch ?? aiResearchAgent}
            onSpecialClick={
              existingAiResearch
                ? () => navigateToAgent(existingAiResearch.id)
                : () => setAiResearchModalOpen(true)
            }
          />
          {agents
            .filter(
              (a) =>
                a.id !== existingDiagnostics?.id &&
                a.id !== existingAiImage?.id &&
                a.id !== existingAiResearch?.id,
            )
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

      <ImportFromDecoDialog
        open={importDecoOpen}
        onOpenChange={setImportDecoOpen}
      />

      <SiteDiagnosticsRecruitModal
        open={diagnosticsModalOpen}
        onOpenChange={setDiagnosticsModalOpen}
        existingAgent={existingDiagnostics}
      />

      <AiImageRecruitModal
        open={aiImageModalOpen}
        onOpenChange={setAiImageModalOpen}
        existingAgent={existingAiImage}
      />

      <AiResearchRecruitModal
        open={aiResearchModalOpen}
        onOpenChange={setAiResearchModalOpen}
        existingAgent={existingAiResearch}
      />

      <SelfHealingRepoFlow
        open={selfHealingOpen}
        onOpenChange={setSelfHealingOpen}
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
