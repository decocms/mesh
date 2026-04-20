import { useState } from "react";
import { Plus, Zap } from "@untitledui/icons";
import { SearchInput } from "@deco/ui/components/search-input.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Page } from "@/web/components/page";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { useAutomationsList } from "@/web/hooks/use-automations";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { AutomationCard } from "@/web/views/automations/automation-card";
import { useVirtualMCPs, useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";

export default function SettingsAutomationsPage() {
  const { org } = useProjectContext();
  const { data: automations = [] } = useAutomationsList(undefined);
  const agents = useVirtualMCPs();
  const navigateToAgent = useNavigateToAgent();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const lowerSearch = search.toLowerCase();
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const filtered = automations.filter((a) => {
    if (!lowerSearch) return true;
    if (a.name.toLowerCase().includes(lowerSearch)) return true;
    const agent = a.agent ? agentMap.get(a.agent.id) : undefined;
    if (agent && agent.title.toLowerCase().includes(lowerSearch)) return true;
    return false;
  });

  const handleCardClick = (automationId: string, agentId: string | null) => {
    if (!agentId) return;
    navigateToAgent(agentId, {
      search: { main: "automation:" + automationId },
    });
  };

  const handleBrowseAgents = () => {
    navigate({ to: "/$org/settings/agents", params: { org: org.slug } });
  };

  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <Page.Title>Automations</Page.Title>
            {automations.length > 0 && (
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search automations..."
                className="w-full md:w-[375px]"
              />
            )}
          </div>

          {automations.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <EmptyState
                image={<Zap size={48} className="text-muted-foreground" />}
                title="No automations yet"
                description="Automations are created per agent. Open an agent and add one from its Automations tab."
                actions={
                  <Button size="sm" onClick={handleBrowseAgents}>
                    <Plus size={14} />
                    Browse agents
                  </Button>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <EmptyState
                image={<Zap size={48} className="text-muted-foreground" />}
                title="No automations found"
                description={`No automations match "${search}"`}
              />
            </div>
          ) : (
            <div className="mt-6 @container">
              <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4 gap-4">
                {filtered.map((a) => (
                  <AutomationCard
                    key={a.id}
                    automation={a}
                    showAgent
                    onClick={() => handleCardClick(a.id, a.agent?.id ?? null)}
                  />
                ))}
              </div>
            </div>
          )}
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
