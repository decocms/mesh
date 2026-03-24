import { Suspense, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import {
  ChevronDown,
  DotsHorizontal,
  Plus,
  Settings01,
} from "@untitledui/icons";
import { useProjectContext } from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { useAgents } from "@/web/hooks/use-agents";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { AgentAvatar } from "@/web/components/agent-icon";
import { cn } from "@deco/ui/lib/utils.ts";

function AgentListItem({
  agent,
  org,
}: {
  agent: VirtualMCPEntity;
  org: string;
}) {
  const navigate = useNavigate();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={agent.title}
        className="group/agent-row h-9"
        onClick={() =>
          navigate({
            to: "/$org/agents/$agentId",
            params: { org, agentId: agent.id },
          })
        }
      >
        <span className="relative shrink-0 size-4 flex items-center justify-center mr-1">
          <AgentAvatar icon={agent.icon} name={agent.title} size="xs" />
        </span>
        <span className="truncate flex-1 group-data-[collapsible=icon]:hidden">
          {agent.title}
        </span>
        {/* Gear icon: visible on hover */}
        <button
          type="button"
          className="text-muted-foreground opacity-0 group-hover/agent-row:opacity-100 transition-opacity group-data-[collapsible=icon]:hidden shrink-0 p-1 hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            navigate({
              to: "/$org/agents/$agentId",
              params: { org, agentId: agent.id },
            });
          }}
        >
          <Settings01 size={16} />
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AgentsSectionContent() {
  const agents = useAgents();
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  const { createVirtualMCP } = useCreateVirtualMCP({
    navigateOnCreate: true,
  });

  return (
    <>
      <div className="group/agents-section mt-2">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <SidebarGroup className="py-0 px-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {/* Section Header */}
                <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                  <div className="flex h-8 w-full items-center gap-1 rounded-md pl-2 pr-1">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-1 cursor-pointer min-w-0"
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          Agents
                        </span>
                        <ChevronDown
                          size={12}
                          className={cn(
                            "text-muted-foreground shrink-0 transition-transform duration-200",
                            !isOpen && "-rotate-90",
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/$org/agents",
                          params: { org: org.slug },
                        })
                      }
                      title="View all agents"
                      className="opacity-0 group-hover/agents-section:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex items-center justify-center size-6 rounded shrink-0"
                    >
                      <DotsHorizontal size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => createVirtualMCP()}
                      title="Create new agent"
                      className="opacity-0 group-hover/agents-section:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex items-center justify-center size-6 rounded shrink-0"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </SidebarMenuItem>

                {/* Agent List */}
                <CollapsibleContent>
                  {agents.length === 0 ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        No agents yet
                      </div>
                    </SidebarMenuItem>
                  ) : (
                    agents.map((agent) => (
                      <AgentListItem
                        key={agent.id}
                        agent={agent}
                        org={org.slug}
                      />
                    ))
                  )}
                </CollapsibleContent>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Collapsible>
      </div>
    </>
  );
}

export function SidebarAgentsSection() {
  return (
    <Suspense
      fallback={
        <SidebarGroup className="py-0 px-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <div className="flex items-center gap-2 px-2 py-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      }
    >
      <AgentsSectionContent />
    </Suspense>
  );
}
