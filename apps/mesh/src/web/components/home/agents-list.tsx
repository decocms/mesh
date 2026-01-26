/**
 * Agents List Component for Home Page
 *
 * Displays a horizontal scrollable list of agents (Virtual MCPs) with their icon and name.
 * Shows up to 6 agents max with a "See all" button to navigate to the full agents list.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useVirtualMCPs } from "@decocms/mesh-sdk";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { CpuChip02, ChevronRight } from "@untitledui/icons";
import { Suspense } from "react";
import { useChat } from "@/web/components/chat/context";
import { Link, useParams } from "@tanstack/react-router";

/**
 * Individual agent item component
 */
function AgentItem({
  agent,
}: {
  agent: {
    id: string;
    title: string;
    icon?: string | null;
  };
}) {
  const { setVirtualMcpId } = useChat();

  const handleClick = () => {
    // Select the agent in the chat context
    setVirtualMcpId(agent.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center gap-2 min-w-[80px] max-w-[80px] group"
    >
      <div className="size-[56px] rounded-xl transition-transform group-hover:scale-105">
        <IntegrationIcon
          icon={agent.icon}
          name={agent.title}
          size="sm"
          className="size-full shrink-0 shadow-sm aspect-square"
          fallbackIcon={<CpuChip02 />}
        />
      </div>
      <span className="text-sm text-foreground text-center line-clamp-2 w-full leading-tight">
        {agent.title}
      </span>
    </button>
  );
}

/**
 * Agents list content component
 */
function AgentsListContent() {
  const virtualMcps = useVirtualMCPs();
  const { org } = useParams({ strict: false });

  // Filter out the default Decopilot agent (it's not a real agent)
  const allAgents = virtualMcps.filter(
    (agent) => !agent.id.startsWith("decopilot-"),
  );

  // Show max 6 agents
  const agents = allAgents.slice(0, 6);

  // Don't render if no agents
  if (agents.length === 0) {
    return null;
  }

  const hasMore = allAgents.length > 6;

  return (
    <div className="w-full">
      <h2 className="text-sm font-medium text-muted-foreground mb-4">
        Recently used agents
      </h2>
      <div className="flex items-center gap-4 overflow-x-auto pb-2 -mx-2 px-2">
        {agents.map((agent) => (
          <AgentItem key={agent.id} agent={agent} />
        ))}
        {hasMore && (
          <Link
            to="/$org/agents"
            params={{ org: org || "" }}
            className="flex flex-col items-center justify-center gap-2 min-w-[80px] max-w-[80px] group"
          >
            <div className="size-[56px] rounded-xl bg-muted flex items-center justify-center transition-colors group-hover:bg-muted/80">
              <ChevronRight className="size-6 text-muted-foreground" />
            </div>
            <span className="text-sm text-foreground text-center leading-tight">
              See all
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton loader for agents list
 */
function AgentsListSkeleton() {
  return (
    <div className="w-full">
      <Skeleton className="h-5 w-40 mb-4" />
      <div className="flex items-center gap-4 overflow-x-auto pb-2 -mx-2 px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-2 min-w-[80px] max-w-[80px]"
          >
            <Skeleton className="size-[56px] rounded-xl" />
            <Skeleton className="h-4 w-full" />
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
