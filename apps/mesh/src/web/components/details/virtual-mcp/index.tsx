import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { PromptSetSelector } from "@/web/components/virtual-mcp/prompt-selector.tsx";
import { ResourceSetSelector } from "@/web/components/virtual-mcp/resource-selector.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import { ToolSetSelector } from "@/web/components/tool-set-selector.tsx";
import {
  createMCPClient,
  useConnections,
  useProjectContext,
  useVirtualMCP,
  useVirtualMCPActions,
  listPrompts,
  listResources,
  KEYS,
  VirtualMCPEntitySchema,
  type VirtualMCPEntity,
} from "@decocms/mesh-sdk";
import { useQueries } from "@tanstack/react-query";
import { slugify } from "@/web/utils/slugify";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  RadioGroup,
  RadioGroupItem,
} from "@deco/ui/components/radio-group.tsx";
import { ResourceTabs } from "@deco/ui/components/resource-tabs.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
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
  useSearch,
} from "@tanstack/react-router";
import {
  ArrowsRight,
  Check,
  Code01,
  Copy01,
  CpuChip02,
  FlipBackward,
  InfoCircle,
  Lightbulb02,
  Loading01,
  Save01,
  Share07,
} from "@untitledui/icons";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ViewActions, ViewLayout, ViewTabs } from "../layout";

type VirtualMCPTabId = "settings" | "tools" | "resources" | "prompts";

/**
 * Unicode-safe base64 encoding for browser environments
 */
function utf8ToBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );
  return btoa(binary);
}

// Form validation schema
const virtualMcpFormSchema = VirtualMCPEntitySchema.pick({
  title: true,
  description: true,
  status: true,
  tool_selection_mode: true,
  metadata: true,
}).extend({
  title: z.string().min(1, "Name is required").max(255),
});

type VirtualMCPFormData = z.infer<typeof virtualMcpFormSchema>;

/**
 * Convert virtual MCP connections to ToolSetSelector format.
 * When selected_tools is null, it means "all tools" - we need to expand this
 * using the actual connection's tools.
 */
function virtualMcpToToolSet(
  virtualMcp: VirtualMCPEntity,
  connectionToolsMap: Map<string, string[]>,
): Record<string, string[]> {
  const toolSet: Record<string, string[]> = {};

  for (const conn of virtualMcp.connections) {
    if (conn.selected_tools === null) {
      // null means all tools - get from connection
      const allTools = connectionToolsMap.get(conn.connection_id) ?? [];
      if (allTools.length > 0) {
        toolSet[conn.connection_id] = allTools;
      }
    } else if (conn.selected_tools.length > 0) {
      toolSet[conn.connection_id] = conn.selected_tools;
    }
  }

  return toolSet;
}

/**
 * Convert virtual MCP connections to ResourceSetSelector format.
 */
function virtualMcpToResourceSet(
  virtualMcp: VirtualMCPEntity,
): Record<string, string[]> {
  const resourceSet: Record<string, string[]> = {};

  for (const conn of virtualMcp.connections) {
    if (
      conn.selected_resources !== null &&
      conn.selected_resources !== undefined &&
      conn.selected_resources.length > 0
    ) {
      resourceSet[conn.connection_id] = conn.selected_resources;
    }
  }

  return resourceSet;
}

/**
 * Convert virtual MCP connections to PromptSetSelector format.
 */
function virtualMcpToPromptSet(
  virtualMcp: VirtualMCPEntity,
): Record<string, string[]> {
  const promptSet: Record<string, string[]> = {};

  for (const conn of virtualMcp.connections) {
    if (
      conn.selected_prompts !== null &&
      conn.selected_prompts !== undefined &&
      conn.selected_prompts.length > 0
    ) {
      promptSet[conn.connection_id] = conn.selected_prompts;
    }
  }

  return promptSet;
}

/**
 * Merge tool, resource, and prompt sets into virtual MCP connections format.
 */
function mergeSelectionsToVirtualMCPConnections(
  toolSet: Record<string, string[]>,
  resourceSet: Record<string, string[]>,
  promptSet: Record<string, string[]>,
  connectionToolsMap: Map<string, string[]>,
): Array<{
  connection_id: string;
  selected_tools: string[] | null;
  selected_resources: string[] | null;
  selected_prompts: string[] | null;
}> {
  // Collect all connection IDs from all sets
  const allConnectionIds = new Set([
    ...Object.keys(toolSet),
    ...Object.keys(resourceSet),
    ...Object.keys(promptSet),
  ]);

  return Array.from(allConnectionIds).map((connectionId) => {
    const selectedTools = toolSet[connectionId] ?? [];
    const allTools = connectionToolsMap.get(connectionId) ?? [];

    // If all tools are selected, store null (meaning "all")
    const hasAllTools =
      allTools.length > 0 &&
      allTools.every((tool) => selectedTools.includes(tool));

    return {
      connection_id: connectionId,
      selected_tools:
        selectedTools.length === 0 ? null : hasAllTools ? null : selectedTools,
      selected_resources: resourceSet[connectionId] ?? null,
      selected_prompts: promptSet[connectionId] ?? null,
    };
  });
}

/**
 * Shared button props interfaces
 */
interface ShareButtonProps {
  url: string;
}

interface ShareWithNameProps extends ShareButtonProps {
  serverName: string;
}

/**
 * Copy URL Button Component
 */
function CopyUrlButton({ url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Agent URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleCopy}
      className="h-auto py-3 px-4 flex flex-col items-center gap-2"
    >
      {copied ? (
        <Check size={20} className="text-green-600" />
      ) : (
        <Copy01 size={20} />
      )}
      <span className="text-xs font-medium">
        {copied ? "Copied!" : "Copy URL"}
      </span>
    </Button>
  );
}

/**
 * Install on Cursor Button Component
 */
function InstallCursorButton({ url, serverName }: ShareWithNameProps) {
  const handleInstall = () => {
    const slugifiedServerName = slugify(serverName);
    const connectionConfig = {
      type: "http",
      url: url,
      headers: {
        "x-mesh-client": "Cursor",
      },
    };
    const base64Config = utf8ToBase64(
      JSON.stringify(connectionConfig, null, 2),
    );
    const deeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(slugifiedServerName)}&config=${encodeURIComponent(base64Config)}`;

    window.open(deeplink, "_blank");
    toast.success("Opening Cursor...");
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleInstall}
      className="h-auto py-3 px-4 flex flex-col items-center gap-2"
    >
      <img
        src="/logos/cursor.svg"
        alt="Cursor"
        className="h-5 w-5"
        style={{
          filter:
            "brightness(0) saturate(100%) invert(11%) sepia(8%) saturate(785%) hue-rotate(1deg) brightness(95%) contrast(89%)",
        }}
      />
      <span className="text-xs font-medium">Install on Cursor</span>
    </Button>
  );
}

/**
 * Install on Claude Code Button Component
 */
function InstallClaudeButton({ url, serverName }: ShareWithNameProps) {
  const [copied, setCopied] = useState(false);

  const handleInstall = async () => {
    const slugifiedServerName = slugify(serverName);
    const connectionConfig = {
      type: "http",
      url: url,
      headers: {
        "x-mesh-client": "Claude Code",
      },
    };
    const configJson = JSON.stringify(connectionConfig, null, 2);
    const command = `claude mcp add "${slugifiedServerName}" --config '${configJson.replace(/'/g, "'\\''")}'`;

    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success("Claude Code command copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleInstall}
      className="h-auto py-3 px-4 flex flex-col items-center gap-2"
    >
      {copied ? (
        <Check size={20} className="text-green-600" />
      ) : (
        <img
          src="/logos/Claude Code.svg"
          alt="Claude Code"
          className="h-5 w-5"
          style={{
            filter:
              "brightness(0) saturate(100%) invert(55%) sepia(31%) saturate(1264%) hue-rotate(331deg) brightness(92%) contrast(86%)",
          }}
        />
      )}
      <span className="text-xs font-medium">
        {copied ? "Copied!" : "Install on Claude"}
      </span>
    </Button>
  );
}

/**
 * Share Modal - Virtual MCP sharing and IDE integration
 */
function VirtualMCPShareModal({
  open,
  onOpenChange,
  virtualMcp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  virtualMcp: VirtualMCPEntity;
}) {
  const [mode, setMode] = useState<
    "passthrough" | "smart_tool_selection" | "code_execution"
  >("code_execution");

  const handleModeChange = (value: string) => {
    if (
      value === "passthrough" ||
      value === "smart_tool_selection" ||
      value === "code_execution"
    ) {
      setMode(value);
    }
  };

  // Build URL with mode query parameter
  // Virtual MCPs (agents) are accessed via the virtual-mcp endpoint
  const virtualMcpUrl = new URL(
    `/mcp/virtual-mcp/${virtualMcp.id}`,
    window.location.origin,
  );
  virtualMcpUrl.searchParams.set("mode", mode);

  // Server name for IDE integrations
  const serverName = virtualMcp.title || `agent-${virtualMcp.id.slice(0, 8)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Agent</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {/* Mode Selection */}
          <div className="flex flex-col gap-3">
            <div>
              <h4 className="text-sm font-medium text-foreground mt-1">
                How should this agent work?
              </h4>
            </div>
            <RadioGroup
              value={mode}
              onValueChange={handleModeChange}
              className="flex flex-col gap-4.5"
            >
              {/* Passthrough Option */}
              <label
                htmlFor="mode-passthrough"
                className="flex items-center gap-3 px-3 py-5 rounded-lg border border-border hover:border-ring/50 cursor-pointer transition-colors has-checked:border-ring has-checked:bg-accent/5"
              >
                <div className="p-1.5 shrink-0">
                  <ArrowsRight className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Direct access
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoCircle className="size-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            All tools are exposed directly via tools/list. Best
                            for small tool surfaces with deterministic behavior.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Best for small teams or when you need predictable behavior
                  </p>
                </div>
                <RadioGroupItem id="mode-passthrough" value="passthrough" />
              </label>

              {/* Smart Tool Selection Option */}
              <label
                htmlFor="mode-smart"
                className="flex items-center gap-3 px-3 py-5 rounded-lg border border-border hover:border-ring/50 cursor-pointer transition-colors has-checked:border-ring has-checked:bg-accent/5"
              >
                <div className="p-1.5 shrink-0">
                  <Lightbulb02 className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Smart discovery
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoCircle className="size-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            Uses meta-tools (GATEWAY_SEARCH_TOOLS,
                            GATEWAY_DESCRIBE_TOOLS, GATEWAY_CALL_TOOL) to keep
                            the tool list small and request details on demand.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Ideal for large teams with many tools - AI finds what it
                    needs
                  </p>
                </div>
                <RadioGroupItem id="mode-smart" value="smart_tool_selection" />
              </label>

              {/* Code Execution Option */}
              <label
                htmlFor="mode-code"
                className="relative flex items-center gap-3 px-3 py-5 rounded-lg border border-border hover:border-ring/50 cursor-pointer transition-colors has-checked:border-ring has-checked:bg-accent/5"
              >
                <div className="p-1.5 shrink-0">
                  <Code01 className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Smart execution
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoCircle className="size-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            Exposes meta-tools for discovery + sandboxed
                            execution (GATEWAY_RUN_CODE). Reduces overhead on
                            large surfaces by shifting work into a controlled
                            runtime.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Maximum flexibility - AI can write code to orchestrate tools
                  </p>
                </div>
                <RadioGroupItem id="mode-code" value="code_execution" />
                <Badge
                  variant="outline"
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-background z-10"
                >
                  Recommended
                </Badge>
              </label>
            </RadioGroup>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <CopyUrlButton url={virtualMcpUrl.href} />
              <InstallCursorButton
                url={virtualMcpUrl.href}
                serverName={serverName}
              />
              <InstallClaudeButton
                url={virtualMcpUrl.href}
                serverName={serverName}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Settings Tab - Agent configuration (title, description, icon, system prompt)
 */
function VirtualMCPSettingsTab({
  form,
  icon,
}: {
  form: ReturnType<typeof useForm<VirtualMCPFormData>>;
  icon?: string | null;
}) {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Form {...form}>
        <div className="flex flex-col">
          {/* Header section - Icon, Title, Description */}
          <div className="flex flex-col gap-4 p-5 border-b border-border">
            <div className="flex items-start justify-between">
              <IntegrationIcon
                icon={icon}
                name={form.watch("title") || "Agent"}
                size="lg"
                className="shrink-0 shadow-sm"
                fallbackIcon={<CpuChip02 />}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          field.value === "active" ? "success" : "outline"
                        }
                      >
                        {field.value === "active" ? "Active" : "Inactive"}
                      </Badge>
                      <FormControl>
                        <Switch
                          checked={field.value === "active"}
                          onCheckedChange={(checked) =>
                            field.onChange(checked ? "active" : "inactive")
                          }
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex flex-col">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="w-full space-y-0">
                    <FormControl>
                      <Input
                        {...field}
                        className="h-auto text-lg! font-medium leading-7 px-0 border-transparent hover:border-input focus:border-input bg-transparent transition-all"
                        placeholder="Agent Name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="w-full space-y-0">
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        className="h-auto text-base text-muted-foreground leading-6 px-0 border-transparent hover:border-input focus:border-input bg-transparent transition-all"
                        placeholder="Add a description..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Configuration section */}
          <div className="flex flex-col gap-4 p-5 border-b border-border">
            {/* Selection Mode */}
            <FormField
              control={form.control}
              name="tool_selection_mode"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel className="mb-0">Selection Mode</FormLabel>
                    <div className="flex items-center gap-1.5">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-label="Selection mode help"
                            >
                              <InfoCircle
                                size={14}
                                className="text-muted-foreground"
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <div className="text-xs space-y-1">
                              <div>
                                <strong>Include:</strong> Only selected items
                                are exposed.
                              </div>
                              <div>
                                <strong>Exclude:</strong> All items except
                                selected ones are exposed.
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="inclusion">
                            Include Selected
                          </SelectItem>
                          <SelectItem value="exclusion">
                            Exclude Selected
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* System Prompt section */}
          <div className="flex flex-col gap-3 p-5">
            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem>
                  <div>
                    <FormLabel className="text-sm font-medium text-foreground mb-1">
                      Instructions
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Define the agent's role, capabilities, and behavior to
                      guide how it interprets requests, uses available tools,
                      and responds to users.
                    </p>
                  </div>
                  <FormControl>
                    <Textarea
                      value={field.value?.instructions ?? ""}
                      onChange={(e) =>
                        field.onChange({
                          ...(field.value ?? {}),
                          instructions: e.target.value || undefined,
                        })
                      }
                      placeholder="You are a helpful assistant that specializes in customer support. Your role is to help users resolve issues and answer questions..."
                      className="min-h-[240px] resize-none text-sm leading-relaxed"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </Form>
    </div>
  );
}

function VirtualMCPInspectorViewWithData({
  virtualMcp,
  virtualMcpId,
  requestedTabId,
}: {
  virtualMcp: VirtualMCPEntity;
  virtualMcpId: string;
  requestedTabId: VirtualMCPTabId;
}) {
  const routerState = useRouterState();
  const url = routerState.location.href;
  const router = useRouter();
  const navigate = useNavigate({ from: "/$org/agents/$agentId" });
  const actions = useVirtualMCPActions();
  const { org } = useProjectContext();

  // Fetch all connections to get tool names for "all tools" expansion
  const connections = useConnections({});

  // Get all connection IDs
  const connectionIds = connections.map((c) => c.id);

  // Fetch prompts for all connections using inline useQueries
  const promptsQueries = useQueries({
    queries: connectionIds.map((connectionId) => ({
      queryKey: KEYS.connectionPrompts(connectionId),
      queryFn: async () => {
        try {
          const client = await createMCPClient({
            connectionId,
            orgId: org.id,
          });
          return await listPrompts(client);
        } catch {
          return { prompts: [] };
        }
      },
      staleTime: 60000,
      retry: false,
    })),
  });

  // Fetch resources for all connections using inline useQueries
  const resourcesQueries = useQueries({
    queries: connectionIds.map((connectionId) => ({
      queryKey: KEYS.connectionResources(connectionId),
      queryFn: async () => {
        try {
          const client = await createMCPClient({
            connectionId,
            orgId: org.id,
          });
          return await listResources(client);
        } catch {
          return { resources: [] };
        }
      },
      staleTime: 60000,
      retry: false,
    })),
  });

  // Build prompts map from query results
  const connectionPrompts = new Map<
    string,
    Array<{ name: string; description?: string }>
  >();
  connectionIds.forEach((connectionId, index) => {
    const query = promptsQueries[index];
    if (query?.data) {
      connectionPrompts.set(
        connectionId,
        query.data.prompts.map((p) => ({
          name: p.name,
          description: p.description,
        })),
      );
    } else {
      connectionPrompts.set(connectionId, []);
    }
  });

  // Build resources map from query results
  const connectionResources = new Map<
    string,
    Array<{ uri: string; name?: string; description?: string }>
  >();
  connectionIds.forEach((connectionId, index) => {
    const query = resourcesQueries[index];
    if (query?.data) {
      connectionResources.set(
        connectionId,
        query.data.resources.map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
        })),
      );
    } else {
      connectionResources.set(connectionId, []);
    }
  });

  // Build a map of connectionId -> all tool names
  const connectionToolsMap = new Map<string, string[]>();
  for (const conn of connections) {
    if (conn.tools && conn.tools.length > 0) {
      connectionToolsMap.set(
        conn.id,
        conn.tools.map((t: { name: string }) => t.name),
      );
    }
  }

  // Initialize toolSet from virtual MCP connections
  const [toolSet, setToolSet] = useState<Record<string, string[]>>(() =>
    virtualMcpToToolSet(virtualMcp, connectionToolsMap),
  );

  // Initialize resourceSet from virtual MCP connections
  const [resourceSet, setResourceSet] = useState<Record<string, string[]>>(() =>
    virtualMcpToResourceSet(virtualMcp),
  );

  // Initialize promptSet from virtual MCP connections
  const [promptSet, setPromptSet] = useState<Record<string, string[]>>(() =>
    virtualMcpToPromptSet(virtualMcp),
  );

  // Track if any selection has changed
  const [selectionDirty, setSelectionDirty] = useState(false);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const handleToolSetChange = (newToolSet: Record<string, string[]>) => {
    setToolSet(newToolSet);
    setSelectionDirty(true);
  };

  const handleResourceSetChange = (
    newResourceSet: Record<string, string[]>,
  ) => {
    setResourceSet(newResourceSet);
    setSelectionDirty(true);
  };

  const handlePromptSetChange = (newPromptSet: Record<string, string[]>) => {
    setPromptSet(newPromptSet);
    setSelectionDirty(true);
  };

  // Form setup
  const form = useForm<VirtualMCPFormData>({
    resolver: zodResolver(virtualMcpFormSchema),
    defaultValues: {
      title: virtualMcp.title,
      description: virtualMcp.description,
      status: virtualMcp.status,
      tool_selection_mode: virtualMcp.tool_selection_mode ?? "inclusion",
      metadata: virtualMcp.metadata ?? { instructions: "" },
    },
  });

  const hasFormChanges = form.formState.isDirty;
  const hasAnyChanges = hasFormChanges || selectionDirty;

  const handleSave = async () => {
    try {
      const formData = form.getValues();

      // Merge all selections into virtual MCP connections format
      const newConnections = mergeSelectionsToVirtualMCPConnections(
        toolSet,
        resourceSet,
        promptSet,
        connectionToolsMap,
      );

      const updateData = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        tool_selection_mode: formData.tool_selection_mode,
        metadata: formData.metadata,
        connections: newConnections,
      };

      await actions.update.mutateAsync({
        id: virtualMcpId,
        data: updateData,
      });

      // Reset dirty states
      form.reset(formData);
      setSelectionDirty(false);
    } catch (error) {
      // Error is already handled by mutation's onError, but we catch here
      // to prevent unhandled promise rejection
      console.error("Failed to save virtual MCP:", error);
    }
  };

  const handleCancel = () => {
    // Reset react-hook-form to original values
    form.reset({
      title: virtualMcp.title,
      description: virtualMcp.description,
      status: virtualMcp.status,
      tool_selection_mode: virtualMcp.tool_selection_mode ?? "inclusion",
      metadata: virtualMcp.metadata ?? { instructions: "" },
    });

    // Reset selections to original virtual MCP values
    setToolSet(virtualMcpToToolSet(virtualMcp, connectionToolsMap));
    setResourceSet(virtualMcpToResourceSet(virtualMcp));
    setPromptSet(virtualMcpToPromptSet(virtualMcp));

    // Clear dirty flag
    setSelectionDirty(false);
  };

  // Define tabs
  const tabs = [
    { id: "settings", label: "Settings" },
    { id: "tools", label: "Tools" },
    { id: "resources", label: "Resources" },
    { id: "prompts", label: "Prompts" },
  ];

  const activeTabId = tabs.some((t) => t.id === requestedTabId)
    ? requestedTabId
    : "settings";

  const handleTabChange = (tabId: string) => {
    navigate({
      search: (prev: { tab?: string }) => ({ ...prev, tab: tabId }),
      replace: true,
    });
  };

  const isSaving = actions.update.isPending;

  return (
    <ViewLayout onBack={() => router.history.back()}>
      {/* Header: Show tabs */}
      <ViewTabs>
        <ResourceTabs
          tabs={tabs}
          activeTab={activeTabId}
          onTabChange={handleTabChange}
        />
      </ViewTabs>

      <ViewActions>
        {hasAnyChanges && (
          <>
            {/* Cancel button */}
            <TooltipProvider>
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
            </TooltipProvider>

            {/* Save button */}
            <TooltipProvider>
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
            </TooltipProvider>
          </>
        )}

        {/* Share button */}
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 border border-input"
                  onClick={() => setShareModalOpen(true)}
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

      <div className="flex h-full w-full bg-background overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          {/* Edit mode content */}
          <div className="h-full overflow-auto">
            <ErrorBoundary key={activeTabId}>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Loading01
                      size={32}
                      className="animate-spin text-muted-foreground"
                    />
                  </div>
                }
              >
                {activeTabId === "settings" ? (
                  <VirtualMCPSettingsTab form={form} icon={virtualMcp.icon} />
                ) : activeTabId === "tools" ? (
                  <ToolSetSelector
                    toolSet={toolSet}
                    onToolSetChange={handleToolSetChange}
                    excludeVirtualMcpId={virtualMcpId}
                  />
                ) : activeTabId === "resources" ? (
                  <ResourceSetSelector
                    resourceSet={resourceSet}
                    onResourceSetChange={handleResourceSetChange}
                    connectionResources={connectionResources}
                    excludeVirtualMcpId={virtualMcpId}
                  />
                ) : activeTabId === "prompts" ? (
                  <PromptSetSelector
                    promptSet={promptSet}
                    onPromptSetChange={handlePromptSetChange}
                    connectionPrompts={connectionPrompts}
                    excludeVirtualMcpId={virtualMcpId}
                  />
                ) : null}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <VirtualMCPShareModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        virtualMcp={virtualMcp}
      />
    </ViewLayout>
  );
}

function VirtualMCPInspectorViewContent() {
  const navigate = useNavigate({ from: "/$org/agents/$agentId" });
  const params = useParams({ strict: false });
  const { org } = params as { org: string };
  const virtualMcpId =
    (params as { agentId?: string }).agentId ??
    (params as { virtualMcpId?: string }).virtualMcpId ??
    "";

  // Get tab from search params
  const search = useSearch({ strict: false });
  const requestedTabId =
    ((search as { tab?: string }).tab as VirtualMCPTabId) || "settings";

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
                  params: { org: org as string },
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
    <VirtualMCPInspectorViewWithData
      virtualMcp={virtualMcp}
      virtualMcpId={virtualMcpId}
      requestedTabId={requestedTabId}
    />
  );
}

export default function VirtualMCPInspectorView() {
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
        <VirtualMCPInspectorViewContent />
      </Suspense>
    </ErrorBoundary>
  );
}
