import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Zap } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { SearchInput } from "@deco/ui/components/search-input.tsx";
import { Page } from "@/web/components/page";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { useAutomationsList } from "@/web/hooks/use-automations";
import { AutomationCard } from "./automation-card";

export function AutomationsList({ virtualMcpId }: { virtualMcpId: string }) {
  const navigate = useNavigate();
  const { data: automations = [] } = useAutomationsList(virtualMcpId);
  const [search, setSearch] = useState("");

  const lowerSearch = search.toLowerCase();
  const filtered = automations.filter((a) =>
    a.name.toLowerCase().includes(lowerSearch),
  );

  const goToDetail = (id: string) =>
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        main: "automation:" + id,
      }),
      replace: true,
    });

  const goToNew = () => goToDetail("new");

  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <Page.Title
              actions={
                <Button size="sm" onClick={goToNew}>
                  <Plus size={14} />
                  New automation
                </Button>
              }
            >
              Automations
            </Page.Title>
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
                description="Create your first automation to run this agent on a schedule or in response to events."
                actions={
                  <Button size="sm" onClick={goToNew}>
                    <Plus size={14} />
                    New automation
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
                    onClick={() => goToDetail(a.id)}
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
