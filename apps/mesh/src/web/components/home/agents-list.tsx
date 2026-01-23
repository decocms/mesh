/**
 * Agents List Component for Home Page
 *
 * Displays a list of agents (Virtual MCPs) with their icon, name, description, and connections.
 * Only shows when the organization has agents.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useConnections,
  useVirtualMCPs,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { Card } from "@deco/ui/components/card.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { CpuChip02 } from "@untitledui/icons";
import { Suspense, useContext } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChatContext } from "@/web/components/chat/context";

/**
 * Individual agent card component
 */
function AgentCard({
  agent,
  connectionsMap,
}: {
  agent: {
    id: string;
    title: string;
    description: string | null;
    icon: string | null;
    connections: Array<{ connection_id: string }>;
  };
  connectionsMap: Map<string, { title: string; icon: string | null }>;
}) {
  const chatContext = useContext(ChatContext);

  // Get connection details for this agent
  const agentConnections = agent.connections
    .map((conn) => {
      const connection = connectionsMap.get(conn.connection_id);
      return connection
        ? {
            id: conn.connection_id,
            title: connection.title,
            icon: connection.icon,
          }
        : null;
    })
    .filter((conn): conn is NonNullable<typeof conn> => conn !== null);

  const handleClick = () => {
    // Select the agent in the chat context
    if (chatContext?.setVirtualMcpId) {
      chatContext.setVirtualMcpId(agent.id);
    }
  };

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50 group"
      onClick={handleClick}
    >
      <div className="flex flex-col gap-3 p-6 relative">
        {/* Header: Icon + Connections in top right */}
        <div className="flex items-start justify-between gap-2">
          <IntegrationIcon
            icon={agent.icon}
            name={agent.title}
            size="sm"
            className="size-[40px] shrink-0 shadow-sm aspect-square"
            fallbackIcon={<CpuChip02 />}
          />
          {/* Connections - Icons only in top right, overlapping */}
          {agentConnections.length > 0 && (
            <div className="flex items-center justify-end -space-x-2">
              {agentConnections.map((conn, index) => (
                <div
                  key={conn.id}
                  className="relative rounded-md border border-muted bg-background p-0.5"
                  style={{ zIndex: agentConnections.length - index }}
                >
                  <IntegrationIcon
                    icon={conn.icon}
                    name={conn.title}
                    size="xs"
                    className="size-6 shrink-0 aspect-square border-0 rounded-md"
                    fallbackIcon={<CpuChip02 size={12} />}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Title and Description below icon */}
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium text-foreground truncate">
            {agent.title}
          </h3>
          {agent.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {agent.description}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Agents list content component
 */
function AgentsListContent() {
  const virtualMcps = useVirtualMCPs();
  const connections = useConnections();

  // Filter out the default Decopilot agent (it's not a real agent)
  const agents = virtualMcps.filter(
    (agent) => !agent.id.startsWith("decopilot-"),
  );

  // Create a map of connections by ID for quick lookup
  const connectionsMap = new Map(
    connections.map((conn) => [
      conn.id,
      { title: conn.title, icon: conn.icon },
    ]),
  );

  // Don't render if no agents
  if (agents.length === 0) {
    return null;
  }

  // Calculate optimal grid columns based on agent count
  const getGridCols = () => {
    if (agents.length === 1) return "grid-cols-1";
    if (agents.length === 2) return "grid-cols-2";
    if (agents.length <= 4) return "grid-cols-2";
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  };

  return (
    <div className="w-full max-w-[800px]">
      <h2 className="text-sm font-medium text-muted-foreground mb-4">
        Recently used agents
      </h2>
      <div className={cn("grid gap-4", getGridCols())}>
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            connectionsMap={connectionsMap}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton loader for agents list
 */
function AgentsListSkeleton() {
  return (
    <div className="w-full max-w-[800px]">
      <Skeleton className="h-5 w-40 mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <Skeleton className="size-12 rounded-lg shrink-0" />
                <div className="flex flex-col gap-2 flex-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
            </div>
          </Card>
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
