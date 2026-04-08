/**
 * ProjectSettings — Simplified settings for a project.
 * Just: name, icon, description, and which agents are assigned.
 * No instructions, no connections, no layout — those belong to agents.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { Page } from "@/web/components/page";
import { AgentAvatar } from "@/web/components/agent-icon";
import { IconPicker } from "@/web/components/icon-picker";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { AddAgentDialog } from "@/web/views/virtual-mcp/add-agent-dialog";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import { Check, ChevronRight, Plus, Trash01 } from "@untitledui/icons";
import {
  useProjectContext,
  useVirtualMCP,
  useVirtualMCPActions,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { toast } from "sonner";

function AgentCard({
  agentId,
  orgSlug,
  onRemove,
}: {
  agentId: string;
  orgSlug: string;
  onRemove: () => void;
}) {
  const agent = useVirtualMCP(agentId);
  const navigate = useNavigate();

  if (!agent) return null;

  const connectionCount = agent.connections.length;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
      <button
        type="button"
        onClick={() =>
          navigate({
            to: "/$org/$virtualMcpId",
            params: { org: orgSlug, virtualMcpId: agent.id },
            search: { main: "settings", mainOpen: 1 },
          })
        }
        className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity cursor-pointer"
      >
        <AgentAvatar
          icon={agent.icon}
          name={agent.title}
          size="sm"
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {agent.title}
          </p>
          {connectionCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {connectionCount}{" "}
              {connectionCount === 1 ? "connection" : "connections"}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="text-muted-foreground shrink-0" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        title="Remove from project"
      >
        <Trash01 size={14} />
      </button>
    </div>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
      <Skeleton className="size-9 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

/**
 * LayoutSection — Shows which agent connections have UIs and lets
 * the user set one as the default view for this project.
 */
function LayoutSection({
  entity,
  allVirtualMcps,
}: {
  entity: {
    id: string;
    connections: Array<{ connection_id: string }>;
    metadata: Record<string, unknown>;
  };
  allVirtualMcps: Array<{
    id: string;
    title: string;
    icon: string | null;
    connections: Array<{ connection_id: string }>;
  }>;
}) {
  const actions = useVirtualMCPActions();
  const virtualMcpIds = new Set(allVirtualMcps.map((v) => v.id));

  // Find all connections (non-virtual) across all agents in this project
  const agentChildren = entity.connections.filter((c) =>
    virtualMcpIds.has(c.connection_id),
  );

  // Collect all real connections from agents
  const connectionEntries: Array<{
    agentTitle: string;
    connectionId: string;
  }> = [];
  for (const ac of agentChildren) {
    const agent = allVirtualMcps.find((v) => v.id === ac.connection_id);
    if (!agent) continue;
    for (const conn of agent.connections) {
      if (!virtualMcpIds.has(conn.connection_id)) {
        connectionEntries.push({
          agentTitle: agent.title,
          connectionId: conn.connection_id,
        });
      }
    }
  }

  // Get current default view
  const currentDefault = (
    entity.metadata?.ui as Record<string, unknown> | undefined
  )?.layout as
    | { defaultMainView?: { type: string; id?: string; toolName?: string } }
    | undefined;
  const currentDefaultId = currentDefault?.defaultMainView?.id;

  const handleSetDefault = async (connectionId: string, toolName: string) => {
    const isAlreadyDefault = currentDefaultId === connectionId;
    await actions.update.mutateAsync({
      id: entity.id,
      data: {
        metadata: {
          ...entity.metadata,
          instructions:
            ((entity.metadata as Record<string, unknown>)?.instructions as
              | string
              | null) ?? null,
          ui: {
            ...(entity.metadata?.ui as Record<string, unknown> | undefined),
            layout: {
              defaultMainView: isAlreadyDefault
                ? null
                : { type: "ext-apps", id: connectionId, toolName },
              chatDefaultOpen: true,
            },
          },
        },
      },
    });
  };

  if (connectionEntries.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-foreground mb-3">Layout</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Connections with UIs. Click to set as default view when opening this
        project.
      </p>
      <div className="flex flex-col gap-1.5">
        {connectionEntries.map((entry) => {
          const isDefault = currentDefaultId === entry.connectionId;
          return (
            <button
              key={entry.connectionId}
              type="button"
              onClick={() => handleSetDefault(entry.connectionId, "")}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors w-full",
                isDefault
                  ? "border-foreground/20 bg-accent/50"
                  : "border-border hover:bg-accent/30",
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {entry.connectionId.slice(0, 20)}...
                </p>
                <p className="text-xs text-muted-foreground">
                  via {entry.agentTitle}
                </p>
              </div>
              {isDefault && (
                <Check size={14} className="text-foreground shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectSettings({ virtualMcpId }: { virtualMcpId: string }) {
  const entity = useVirtualMCP(virtualMcpId);
  const actions = useVirtualMCPActions();
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const allVirtualMcps = useVirtualMCPs();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (!entity) return null;

  // Identify which children are agents (Virtual MCPs)
  const virtualMcpIds = new Set(allVirtualMcps.map((v) => v.id));
  const agentChildren = entity.connections.filter((c) =>
    virtualMcpIds.has(c.connection_id),
  );
  const addedAgentIds = new Set(agentChildren.map((c) => c.connection_id));

  const handleAddAgent = async (agentId: string) => {
    const current = entity.connections;
    await actions.update.mutateAsync({
      id: entity.id,
      data: {
        connections: [
          ...current,
          {
            connection_id: agentId,
            selected_tools: null,
            selected_resources: null,
            selected_prompts: null,
          },
        ],
      },
    });
    toast.success("Agent added to project");
  };

  const handleRemoveAgent = async (agentId: string) => {
    const current = entity.connections;
    await actions.update.mutateAsync({
      id: entity.id,
      data: {
        connections: current.filter((c) => c.connection_id !== agentId),
      },
    });
    toast.success("Agent removed from project");
  };

  const handleUpdateTitle = async (title: string) => {
    if (!title.trim()) return;
    await actions.update.mutateAsync({
      id: entity.id,
      data: { title: title.trim() },
    });
  };

  const handleUpdateDescription = async (description: string) => {
    await actions.update.mutateAsync({
      id: entity.id,
      data: { description: description || null },
    });
  };

  const handleIconChange = (icon: string | null) => {
    actions.update.mutate({ id: entity.id, data: { icon } });
  };

  const handleDelete = async () => {
    await actions.delete.mutateAsync(entity.id);
    toast.success(`Deleted "${entity.title}"`);
    navigate({ to: "/$org", params: { org: org.slug } });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <Page.Title
          actions={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash01 size={14} />
            </Button>
          }
        >
          Project Settings
        </Page.Title>

        {/* Basic info */}
        <div className="mt-6 flex items-start gap-4">
          <IconPicker
            value={entity.icon}
            onChange={handleIconChange}
            name={entity.title || "Project"}
            size="sm+"
            className="shrink-0"
            avatarClassName="[&_svg]:w-1/2 [&_svg]:h-1/2"
          />
          <div className="flex-1 flex flex-col gap-2">
            <Input
              defaultValue={entity.title}
              onBlur={(e) => handleUpdateTitle(e.target.value)}
              placeholder="Project name"
              className="text-base font-medium"
            />
            <Input
              defaultValue={entity.description ?? ""}
              onBlur={(e) => handleUpdateDescription(e.target.value)}
              placeholder="Add a description..."
              className="text-sm"
            />
          </div>
        </div>

        {/* Agents section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">Agents</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus size={13} />
              Add Agent
            </Button>
          </div>

          {agentChildren.length === 0 ? (
            <button
              type="button"
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-3 px-3 py-4 rounded-xl border border-dashed border-border hover:bg-accent/50 transition-colors w-full text-left cursor-pointer"
            >
              <div className="flex items-center justify-center size-9 rounded-lg text-muted-foreground/60 border border-dashed border-border shrink-0">
                <Plus size={16} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">No agents yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Add agents to give this project capabilities
                </p>
              </div>
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              {agentChildren.map((conn) => (
                <ErrorBoundary key={conn.connection_id} fallback={() => null}>
                  <Suspense fallback={<AgentCardSkeleton />}>
                    <AgentCard
                      agentId={conn.connection_id}
                      orgSlug={org.slug}
                      onRemove={() => handleRemoveAgent(conn.connection_id)}
                    />
                  </Suspense>
                </ErrorBoundary>
              ))}
            </div>
          )}
        </div>

        {/* Layout section — which UIs are available, set default */}
        <LayoutSection entity={entity} allVirtualMcps={allVirtualMcps} />
      </div>

      {/* Dialogs */}
      <AddAgentDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        projectId={entity.id}
        addedAgentIds={addedAgentIds}
        onAdd={handleAddAgent}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {entity.title}
              </span>{" "}
              and all its tasks. Agents will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
