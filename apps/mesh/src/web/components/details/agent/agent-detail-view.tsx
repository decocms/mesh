import {
  VirtualMCPEntitySchema,
  type VirtualMCPEntity,
} from "@/tools/virtual-mcp/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import {
  KEYS,
  listPrompts,
  listResources,
  useConnection,
  useProjectContext,
  useVirtualMCP,
  useVirtualMCPActions,
} from "@decocms/mesh-sdk";
import { useQueries } from "@tanstack/react-query";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  ChevronRight,
  ChevronUp,
  CpuChip02,
  CubeOutline,
  File02,
  FlipBackward,
  Loading01,
  Play,
  Plus,
  Save01,
  Share07,
  Tool01,
} from "@untitledui/icons";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ViewActions, ViewLayout } from "../layout";
import { VirtualMCPShareModal } from "../virtual-mcp";
import {
  ConnectionSelectionDialog,
  type ConnectionSelection,
} from "./connection-selection-dialog";

// Form validation schema
const AgentFormSchema = VirtualMCPEntitySchema.pick({
  title: true,
  description: true,
  status: true,
  metadata: true,
}).extend({
  title: z.string().min(1, "Name is required").max(255),
});

type AgentFormData = z.infer<typeof AgentFormSchema>;

/**
 * Connection Icon Preview Component - Shows a connection icon
 */
function ConnectionIconPreview({ connection_id }: { connection_id: string }) {
  const connection = useConnection(connection_id);

  if (!connection) return null;

  return (
    <div className="shrink-0 bg-background ring-1 ring-background rounded-lg">
      <IntegrationIcon
        icon={connection.icon}
        name={connection.title}
        size="xs"
      />
    </div>
  );
}

/**
 * Skill Item Component - Shows a connection with inline badges
 */
function SkillItem({
  connection_id,
  selected_tools,
  selected_resources,
  selected_prompts,
  onClick,
}: {
  connection_id: string;
  selected_tools: string[] | null;
  selected_resources: string[] | null;
  selected_prompts: string[] | null;
  onClick: () => void;
}) {
  const connection = useConnection(connection_id);

  if (!connection) return null;

  const toolCount = selected_tools?.length ?? 0;
  const resourceCount = selected_resources?.length ?? 0;
  const promptCount = selected_prompts?.length ?? 0;

  return (
    <div
      onClick={onClick}
      className="w-full h-12 flex items-center gap-2 px-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
    >
      <IntegrationIcon
        icon={connection.icon}
        name={connection.title}
        size="xs"
      />
      <p className="flex-1 text-sm font-normal text-foreground truncate">
        {connection.title}
      </p>
      <Badge
        variant="secondary"
        className="bg-muted h-5 gap-2 px-1.5 py-1 flex items-center"
      >
        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <span>{toolCount}</span>
          <Tool01 size={12} />
        </div>
        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <span>{resourceCount}</span>
          <CubeOutline size={12} />
        </div>
        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <span>{promptCount}</span>
          <File02 size={12} />
        </div>
      </Badge>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
    </div>
  );
}

function AgentDetailViewWithData({
  virtualMcp,
  virtualMcpId,
}: {
  virtualMcp: VirtualMCPEntity;
  virtualMcpId: string;
}) {
  const routerState = useRouterState();
  const url = routerState.location.href;
  const router = useRouter();
  const actions = useVirtualMCPActions();
  const { locator } = useProjectContext();

  // Dialog states
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null,
  );
  const [skillsOpen, setSkillsOpen] = useState(
    virtualMcp.connections.length > 0,
  );

  // Auto-open chat with this agent selected
  const [, setChatOpen] = useDecoChatOpen();
  const [, setSelectedVirtualMcpId] = useLocalStorage<string | null>(
    `${locator}:selected-virtual-mcp-id`,
    null,
  );

  // Open chat on mount (without selecting the agent)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    setChatOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters are unstable, only run on virtualMcpId change
  }, [virtualMcpId]);

  const handleTestAgent = () => {
    setSelectedVirtualMcpId(virtualMcpId);
    setChatOpen(true);
  };

  // Form setup
  const form = useForm<AgentFormData>({
    resolver: zodResolver(AgentFormSchema),
    defaultValues: virtualMcp,
  });

  const hasFormChanges = form.formState.isDirty;

  const handleSave = async () => {
    try {
      const formData = form.getValues();

      const data = await actions.update.mutateAsync({
        id: virtualMcpId,
        data: formData,
      });

      form.reset(data);
      toast.success("Agent saved successfully");
    } catch (error) {
      console.error("Failed to save agent:", error);
      toast.error("Failed to save agent");
    }
  };

  const handleCancel = () => {
    form.reset(virtualMcp);
  };

  const handleAddConnection = () => {
    setEditingConnectionId(null);
    setConnectionDialogOpen(true);
  };

  const handleEditConnection = (connectionId: string) => {
    setEditingConnectionId(connectionId);
    setConnectionDialogOpen(true);
  };

  const handleConnectionSave = async (selections: ConnectionSelection[]) => {
    try {
      await actions.update.mutateAsync({
        id: virtualMcpId,
        data: {
          tool_selection_mode: "inclusion",
          connections: selections.map((sel) => ({
            connection_id: sel.connectionId,
            selected_tools: sel.selectedTools,
            selected_resources: sel.selectedResources,
            selected_prompts: sel.selectedPrompts,
          })),
        },
      });

      setConnectionDialogOpen(false);
      toast.success("Connections updated");
    } catch (error) {
      console.error("Failed to save connections:", error);
      toast.error("Failed to save connections");
    }
  };

  const isSaving = actions.update.isPending;

  return (
    <ViewLayout onBack={() => router.history.back()}>
      <ViewActions>
        <TooltipProvider>
          {hasFormChanges && (
            <>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7 border border-input"
                      disabled={isSaving}
                      onClick={handleCancel}
                      aria-label="Cancel"
                    >
                      <FlipBackward size={14} />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Cancel</TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7 border border-input"
                      disabled={isSaving}
                      onClick={handleSave}
                      aria-label="Save"
                    >
                      {isSaving ? (
                        <Loading01 size={14} className="animate-spin" />
                      ) : (
                        <Save01 size={14} />
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Save</TooltipContent>
              </Tooltip>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 border border-input"
            onClick={handleTestAgent}
          >
            <Play size={14} />
            Test Agent
          </Button>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 border border-input"
                  onClick={() => setShareDialogOpen(true)}
                  aria-label="Share"
                >
                  <Share07 size={14} />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Share</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PinToSidebarButton
          title={virtualMcp.title}
          url={url}
          icon={virtualMcp.icon ?? "cpu_chip"}
        />
      </ViewActions>

      <div className="flex h-full w-full bg-background overflow-auto">
        <div className="flex flex-col w-full">
          {/* Header section */}
          <div className="flex items-start justify-between gap-4 p-6 shrink-0">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <IntegrationIcon
                icon={virtualMcp.icon}
                name={form.watch("title") || "Agent"}
                size="lg"
                className="shrink-0 shadow-sm"
                fallbackIcon={<CpuChip02 />}
              />
              <div className="flex flex-col flex-1 min-w-0">
                <Input
                  {...form.register("title")}
                  className="h-auto py-0.5 text-lg! font-medium leading-7 px-1 -mx-1 border-transparent hover:bg-input/25 focus:border-input bg-transparent transition-all"
                  placeholder="Agent Name"
                />
                <Input
                  {...form.register("description")}
                  className="h-auto py-0.5 text-base text-muted-foreground leading-6 px-1 -mx-1 border-transparent hover:bg-input/25 focus:border-input bg-transparent transition-all"
                  placeholder="Add a description..."
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={form.watch("status") === "active"}
                onCheckedChange={(checked) =>
                  form.setValue("status", checked ? "active" : "inactive", {
                    shouldDirty: true,
                  })
                }
              />
            </div>
          </div>

          {/* Skills section - Collapsible */}
          <Collapsible
            open={skillsOpen}
            onOpenChange={setSkillsOpen}
            className="border-t border-border shrink-0 max-h-[400px] overflow-hidden flex flex-col"
          >
            {virtualMcp.connections.length === 0 ? (
              <button
                type="button"
                onClick={handleAddConnection}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <p className="text-sm font-medium text-muted-foreground">
                  Skills
                </p>
                <div className="h-7 px-2 inline-flex items-center justify-center gap-1 rounded-md text-sm text-muted-foreground">
                  <Plus size={14} />
                  Add
                </div>
              </button>
            ) : (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    Skills
                  </p>
                  <div className="flex items-center">
                    {/* Icons preview - collapses instantly when open, expands smoothly when closed */}
                    <div
                      className="flex items-center -space-x-2 ease-(--ease-out-expo)"
                      style={{
                        width: skillsOpen ? 0 : "auto",
                        marginRight: skillsOpen ? 0 : 4,
                        opacity: skillsOpen ? 0 : 1,
                        pointerEvents: skillsOpen ? "none" : "auto",
                        transitionProperty: "all",
                        transitionDuration: skillsOpen ? "0ms" : "200ms",
                      }}
                    >
                      {virtualMcp.connections.slice(0, 4).map((conn) => (
                        <ConnectionIconPreview
                          key={conn.connection_id}
                          connection_id={conn.connection_id}
                        />
                      ))}
                    </div>
                    {/* Plus button that expands to "+ Add" when open */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="h-7 inline-flex items-center justify-center rounded-md text-sm text-muted-foreground overflow-hidden transition-all duration-200 ease-(--ease-out-expo) hover:bg-accent hover:text-accent-foreground"
                      style={{
                        width: skillsOpen ? "auto" : 28,
                        paddingLeft: skillsOpen ? 8 : 0,
                        paddingRight: skillsOpen ? 8 : 0,
                        gap: skillsOpen ? 4 : 0,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAddConnection();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          e.preventDefault();
                          handleAddConnection();
                        }
                      }}
                    >
                      <Plus size={14} className="shrink-0" />
                      <span
                        className="overflow-hidden whitespace-nowrap transition-all duration-200 ease-(--ease-out-expo)"
                        style={{
                          width: skillsOpen ? "auto" : 0,
                          opacity: skillsOpen ? 1 : 0,
                        }}
                      >
                        Add
                      </span>
                    </div>
                    {/* Chevron - expands when open, pushing plus left */}
                    <div
                      className="h-7 inline-flex items-center justify-center overflow-hidden transition-all duration-200 ease-(--ease-out-expo)"
                      style={{
                        width: skillsOpen ? 28 : 0,
                        opacity: skillsOpen ? 1 : 0,
                      }}
                    >
                      <ChevronUp size={16} className="shrink-0" />
                    </div>
                  </div>
                </button>
              </CollapsibleTrigger>
            )}

            {/* Animated content - using grid-rows for smooth height animation */}
            <div
              className="grid overflow-hidden transition-[grid-template-rows] duration-200 ease-(--ease-out-expo)"
              style={{
                gridTemplateRows: skillsOpen ? "1fr" : "0fr",
              }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="overflow-y-auto max-h-[300px] mask-[linear-gradient(to_bottom,black_calc(100%-40px),transparent_100%)]">
                  <div className="flex flex-col gap-2 px-6 pb-4 pt-2">
                    {virtualMcp.connections.map((conn) => (
                      <SkillItem
                        key={conn.connection_id}
                        connection_id={conn.connection_id}
                        selected_tools={conn.selected_tools}
                        selected_resources={conn.selected_resources}
                        selected_prompts={conn.selected_prompts}
                        onClick={() => handleEditConnection(conn.connection_id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Collapsible>

          {/* Instructions section */}
          <div className="flex flex-col flex-1 p-6 border-t border-border overflow-auto">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Instructions
            </p>
            <Textarea
              value={virtualMcp.metadata?.instructions ?? ""}
              onChange={(e) =>
                form.setValue("metadata", {
                  ...virtualMcp.metadata,
                  instructions: e.target.value,
                })
              }
              placeholder="Write instructions here..."
              className="min-h-[200px] resize-none text-sm placeholder:text-muted-foreground/50 leading-relaxed border-0 rounded-none shadow-none px-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ConnectionSelectionDialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
        connectionId={editingConnectionId}
        virtualMcp={virtualMcp}
        connectionPrompts={new Map()}
        connectionResources={new Map()}
        onSave={handleConnectionSave}
      />

      <VirtualMCPShareModal
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        virtualMcp={virtualMcp}
      />
    </ViewLayout>
  );
}

function AgentDetailViewContent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    org: string;
    agentId?: string;
    virtualMcpId?: string;
  };
  const { org } = params;
  const virtualMcpId = params.agentId ?? params.virtualMcpId ?? "";

  const virtualMcp = useVirtualMCP(virtualMcpId);

  if (!virtualMcp) {
    return (
      <div className="flex h-full w-full bg-background">
        <EmptyState
          title="Agent not found"
          description="This Agent may have been deleted or you may not have access."
          actions={
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: "/$org/agents",
                  params: { org },
                })
              }
            >
              Back to agents
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <AgentDetailViewWithData
      virtualMcp={virtualMcp}
      virtualMcpId={virtualMcpId}
    />
  );
}

export default function AgentDetailView() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <AgentDetailViewContent />
      </Suspense>
    </ErrorBoundary>
  );
}
