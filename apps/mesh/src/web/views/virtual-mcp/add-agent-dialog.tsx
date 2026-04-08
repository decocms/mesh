/**
 * AddAgentDialog — Browse existing Virtual MCPs to add as agents to a project,
 * or create a new agent.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { CollectionSearch } from "@deco/ui/components/collection-search.tsx";
import { Plus } from "@untitledui/icons";
import { isDecopilot, useVirtualMCPs } from "@decocms/mesh-sdk";
import { useState, Suspense } from "react";
import { AgentAvatar } from "@/web/components/agent-icon";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

function AddAgentDialogContent({
  projectId,
  addedAgentIds,
  onAdd,
  onClose,
}: {
  projectId: string;
  addedAgentIds: Set<string>;
  onAdd: (agentId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const allVirtualMcps = useVirtualMCPs();
  const { createVirtualMCP, isCreating } = useCreateVirtualMCP({
    navigateOnCreate: false,
  });

  const lowerSearch = search.toLowerCase();

  // Show all Virtual MCPs except: decopilot, current project, already added
  const available = allVirtualMcps.filter(
    (v) =>
      !isDecopilot(v.id) &&
      v.id !== projectId &&
      !addedAgentIds.has(v.id) &&
      (!search || v.title.toLowerCase().includes(lowerSearch)),
  );

  const handleCreateAndAdd = async () => {
    const result = await createVirtualMCP();
    if (result?.id) {
      onAdd(result.id);
      onClose();
    }
  };

  return (
    <div className="flex flex-col max-h-[min(640px,80dvh)]">
      <CollectionSearch
        value={search}
        onChange={setSearch}
        placeholder="Search agents..."
      />

      <div className="overflow-y-auto flex-1 min-h-0 px-3 pb-3">
        <div className="px-1 pt-3 pb-2">
          <span className="text-xs font-medium text-muted-foreground">
            Available Agents
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {/* Create new agent */}
          <button
            type="button"
            disabled={isCreating}
            onClick={handleCreateAndAdd}
            className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors hover:bg-accent cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <Plus size={18} className="text-muted-foreground" />
            </div>
            <span className="text-xs leading-tight text-center text-muted-foreground group-hover:text-foreground">
              Create new
            </span>
          </button>

          {available.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                onAdd(agent.id);
                onClose();
              }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors hover:bg-accent cursor-pointer group"
            >
              <AgentAvatar
                icon={agent.icon}
                name={agent.title}
                size="md"
                className="transition-transform group-hover:scale-105"
              />
              <span className="text-xs leading-tight text-center text-muted-foreground group-hover:text-foreground line-clamp-2 w-full">
                {agent.title}
              </span>
              {agent.connections.length > 0 && (
                <span className="text-[10px] text-muted-foreground/60">
                  {agent.connections.length}{" "}
                  {agent.connections.length === 1
                    ? "connection"
                    : "connections"}
                </span>
              )}
            </button>
          ))}
        </div>

        {available.length === 0 && !isCreating && (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {search
              ? "No agents found"
              : "No available agents. Create a new one."}
          </div>
        )}
      </div>
    </div>
  );
}

export function AddAgentDialog({
  open,
  onOpenChange,
  projectId,
  addedAgentIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  addedAgentIds: Set<string>;
  onAdd: (agentId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md p-0 overflow-hidden")}>
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle className="text-base font-semibold">
            Add Agent
          </DialogTitle>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <Skeleton className="h-4 w-24" />
            </div>
          }
        >
          <AddAgentDialogContent
            projectId={projectId}
            addedAgentIds={addedAgentIds}
            onAdd={onAdd}
            onClose={() => onOpenChange(false)}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
