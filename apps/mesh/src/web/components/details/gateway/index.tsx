import type { GatewayEntity } from "@/tools/gateway/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { ToolSetSelector } from "@/web/components/tool-set-selector.tsx";
import {
  useGateway,
  useGatewayActions,
} from "@/web/hooks/collections/use-gateway";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { slugify } from "@/web/utils/slugify";
import { ViewLayout, ViewActions } from "../layout";

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

interface IDEIntegrationProps {
  serverName: string;
  gatewayUrl: string;
}

function IDEIntegration({ serverName, gatewayUrl }: IDEIntegrationProps) {
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  // Slugify the server name to ensure it's safe for MCP clients
  const slugifiedServerName = slugify(serverName);

  // MCP connection configuration (For Cursor, Claude Code, and Windsurf)
  const connectionConfig = { type: "http", url: gatewayUrl };

  // Full MCP configuration object
  const mcpConfig = { [slugifiedServerName]: connectionConfig };

  const configJson = JSON.stringify(mcpConfig, null, 2);
  const clientConnectionConfig = (client: string) =>
    JSON.stringify(
      {
        ...connectionConfig,
        headers: {
          "x-mesh-client": client,
        },
      },
      null,
      2,
    );

  // Generate Cursor deeplink
  const cursorDeeplink = (() => {
    const base64Config = utf8ToBase64(clientConnectionConfig("Cursor"));
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(slugifiedServerName)}&config=${encodeURIComponent(base64Config)}`;
  })();

  // Generate Windsurf deeplink (similar to Cursor)
  const windsurfDeeplink = (() => {
    const base64Config = utf8ToBase64(clientConnectionConfig("Windsurf"));
    return `windsurf://codeium.windsurf/mcp/install?name=${encodeURIComponent(slugifiedServerName)}&config=${encodeURIComponent(base64Config)}`;
  })();

  // Claude Code CLI command - uses JSON format
  const claudeConfigJson = clientConnectionConfig("Claude Code");
  const claudeCommand = `claude mcp add "${slugifiedServerName}" --config '${claudeConfigJson.replace(/'/g, "'\\''")}'`;

  const handleCopyConfig = async () => {
    await navigator.clipboard.writeText(configJson);
    setCopiedConfig(true);
    toast.success("Configuration copied to clipboard");
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  const handleCopyCommand = async (command: string, label: string) => {
    await navigator.clipboard.writeText(command);
    setCopiedCommand(label);
    toast.success(`${label} command copied`);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const handleOpenDeeplink = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="text-sm font-medium text-foreground mb-1">
          Install in your IDE
        </h4>
      </div>

      {/* MCP Configuration with copy button */}
      <div className="relative flex flex-col gap-2 p-3 bg-muted/50 rounded-lg">
        <div className="absolute top-2 right-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={handleCopyConfig}
                >
                  <Icon
                    name={copiedConfig ? "check" : "content_copy"}
                    size={14}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy configuration</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <pre
          className="text-xs font-mono text-foreground overflow-auto max-h-40 whitespace-pre-wrap wrap-break-word cursor-pointer"
          onClick={handleCopyConfig}
        >
          {configJson}
        </pre>
      </div>

      {/* IDE buttons grid */}
      <div className="flex flex-wrap gap-2">
        {/* Cursor */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto py-3 px-4 justify-center gap-2 flex-1 min-w-fit"
                onClick={() => handleOpenDeeplink(cursorDeeplink)}
              >
                <img
                  src="/logos/cursor.svg"
                  alt="Cursor"
                  className="h-6 w-6"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(11%) sepia(8%) saturate(785%) hue-rotate(1deg) brightness(95%) contrast(89%)",
                  }}
                />
                <span className="text-sm font-medium">Cursor</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add to Cursor</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Claude Code */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto py-3 px-4 justify-center gap-2 flex-1 min-w-fit"
                onClick={() => handleCopyCommand(claudeCommand, "Claude")}
              >
                <img
                  src="/logos/Claude Code.svg"
                  alt="Claude Code"
                  className="h-6 w-6"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(55%) sepia(31%) saturate(1264%) hue-rotate(331deg) brightness(92%) contrast(86%)",
                  }}
                />
                <span className="text-sm font-medium">Claude Code</span>
                {copiedCommand === "Claude" && (
                  <Icon
                    name="check"
                    size={14}
                    className="ml-2 text-green-500"
                  />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add to Claude Code</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Windsurf */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto py-3 px-4 justify-center gap-2 flex-1 min-w-fit"
                onClick={() => handleOpenDeeplink(windsurfDeeplink)}
              >
                <img
                  src="/logos/Windsurf.svg"
                  alt="Windsurf"
                  className="h-6 w-6"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(6%) sepia(68%) saturate(3620%) hue-rotate(204deg) brightness(92%) contrast(103%)",
                  }}
                />
                <span className="text-sm font-medium">Windsurf</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add to Windsurf</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// Form validation schema
const gatewayFormSchema = z.object({
  title: z.string().min(1, "Name is required").max(255),
  description: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
  tool_selection_mode: z.enum(["inclusion", "exclusion"]),
  tool_selection_strategy: z.enum([
    "passthrough",
    "smart_tool_selection",
    "code_execution",
  ]),
});

type GatewayFormData = z.infer<typeof gatewayFormSchema>;

/**
 * Convert gateway connections to ToolSetSelector format.
 * When selected_tools is null, it means "all tools" - we need to expand this
 * using the actual connection's tools.
 */
function gatewayToToolSet(
  gateway: GatewayEntity,
  connectionToolsMap: Map<string, string[]>,
): Record<string, string[]> {
  const toolSet: Record<string, string[]> = {};

  for (const conn of gateway.connections) {
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
 * Convert ToolSetSelector format back to gateway connections format.
 * When all tools for a connection are selected, we store null (meaning "all").
 */
function toolSetToGatewayConnections(
  toolSet: Record<string, string[]>,
  connectionToolsMap: Map<string, string[]>,
): Array<{ connection_id: string; selected_tools: string[] | null }> {
  return Object.entries(toolSet).map(([connectionId, selectedTools]) => {
    const allTools = connectionToolsMap.get(connectionId) ?? [];

    // If all tools are selected, store null (meaning "all")
    const hasAllTools =
      allTools.length > 0 &&
      allTools.every((tool) => selectedTools.includes(tool));

    return {
      connection_id: connectionId,
      selected_tools: hasAllTools ? null : selectedTools,
    };
  });
}

function GatewaySettingsForm({
  form,
  toolSet,
  onToolSetChange,
  icon,
}: {
  form: ReturnType<typeof useForm<GatewayFormData>>;
  toolSet: Record<string, string[]>;
  onToolSetChange: (newToolSet: Record<string, string[]>) => void;
  icon?: string | null;
}) {
  return (
    <Form {...form}>
      <div className="flex flex-col h-full">
        {/* Header section - Icon, Title, Description */}
        <div className="flex flex-col gap-4 p-5 border-b border-border">
          <div className="flex items-start justify-between">
            <IntegrationIcon
              icon={icon}
              name={form.watch("title") || "Gateway"}
              size="lg"
              className="shrink-0 shadow-sm"
              fallbackIcon="network_node"
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {field.value === "active" ? "Active" : "Inactive"}
                    </span>
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
                      placeholder="Gateway Name"
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

        {/* Settings section */}
        <div className="flex flex-col gap-4 p-5 border-b border-border">
          {/* Tool Selection Mode */}
          <FormField
            control={form.control}
            name="tool_selection_mode"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <FormLabel className="mb-0">Tool Selection Mode</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cursor-help flex items-center"
                          >
                            <Icon
                              name="info"
                              size={14}
                              className="text-muted-foreground"
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <div className="text-xs space-y-1">
                            <div>
                              <strong>Include:</strong> Only selected
                              connections/tools are exposed.
                            </div>
                            <div>
                              <strong>Exclude:</strong> All connections/tools
                              except selected ones are exposed.
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select value={field.value} onValueChange={field.onChange}>
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
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Gateway Strategy */}
          <FormField
            control={form.control}
            name="tool_selection_strategy"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <FormLabel className="mb-0">Gateway Strategy</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cursor-help flex items-center"
                          >
                            <Icon
                              name="info"
                              size={14}
                              className="text-muted-foreground"
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <div className="text-xs space-y-1">
                            <div>
                              <strong>Passthrough:</strong> Pass tools through
                              as-is (default).
                            </div>
                            <div>
                              <strong>Smart Tool Selection:</strong> Intelligent
                              tool selection behavior.
                            </div>
                            <div>
                              <strong>Code Execution:</strong> Code execution
                              behavior.
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="passthrough">Passthrough</SelectItem>
                      <SelectItem value="smart_tool_selection">
                        Smart Tool Selection
                      </SelectItem>
                      <SelectItem value="code_execution">
                        Code Execution
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Tool Selection section */}
        <div className="flex-1 min-h-0 overflow-auto">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center p-5">
                  <Icon
                    name="progress_activity"
                    size={32}
                    className="animate-spin text-muted-foreground"
                  />
                </div>
              }
            >
              <ToolSetSelector
                toolSet={toolSet}
                onToolSetChange={onToolSetChange}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </Form>
  );
}

function GatewayInspectorViewWithGateway({
  gateway,
  gatewayId,
}: {
  gateway: GatewayEntity;
  gatewayId: string;
}) {
  const router = useRouter();
  const actions = useGatewayActions();

  // Fetch all connections to get tool names for "all tools" expansion
  const connections = useConnections({});

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

  // Initialize toolSet from gateway connections
  const [toolSet, setToolSet] = useState<Record<string, string[]>>(() =>
    gatewayToToolSet(gateway, connectionToolsMap),
  );

  // Track if toolSet has changed
  const [toolSetDirty, setToolSetDirty] = useState(false);

  const handleToolSetChange = (newToolSet: Record<string, string[]>) => {
    setToolSet(newToolSet);
    setToolSetDirty(true);
  };

  // Form setup
  const form = useForm<GatewayFormData>({
    resolver: zodResolver(gatewayFormSchema),
    defaultValues: {
      title: gateway.title,
      description: gateway.description,
      status: gateway.status,
      tool_selection_mode: gateway.tool_selection_mode ?? "inclusion",
      tool_selection_strategy: gateway.tool_selection_strategy ?? "passthrough",
    },
  });

  const hasFormChanges = form.formState.isDirty;
  const hasAnyChanges = hasFormChanges || toolSetDirty;

  const handleSave = async () => {
    const formData = form.getValues();

    // Convert toolSet back to gateway connections format
    const newConnections = toolSetToGatewayConnections(
      toolSet,
      connectionToolsMap,
    );

    await actions.update.mutateAsync({
      id: gatewayId,
      data: {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        tool_selection_mode: formData.tool_selection_mode,
        tool_selection_strategy: formData.tool_selection_strategy,
        connections: newConnections,
      },
    });

    // Reset dirty states
    form.reset(formData);
    setToolSetDirty(false);
  };

  return (
    <ViewLayout onBack={() => router.history.back()}>
      <ViewActions>
        {hasAnyChanges && (
          <Button
            onClick={handleSave}
            disabled={actions.update.isPending}
            size="sm"
            className="h-7"
          >
            {actions.update.isPending && (
              <Icon
                name="progress_activity"
                size={16}
                className="mr-2 animate-spin"
              />
            )}
            Save Changes
          </Button>
        )}
      </ViewActions>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] h-full">
        {/* Left sidebar - Gateway Settings with Tool Selection (2/3 on desktop, full on mobile) */}
        <div className="lg:border-r border-b lg:border-b-0 border-border overflow-auto">
          <GatewaySettingsForm
            form={form}
            toolSet={toolSet}
            onToolSetChange={handleToolSetChange}
            icon={gateway.icon}
          />
        </div>

        {/* Right panel - IDE Integration (1/3 on desktop, full on mobile) */}
        <div className="flex flex-col overflow-auto">
          <div className="p-5">
            <IDEIntegration
              serverName={gateway.title || `gateway-${gateway.id.slice(0, 8)}`}
              gatewayUrl={`${window.location.origin}/mcp/gateway/${gateway.id}`}
            />
          </div>

          {/* Last Updated section */}
          <div className="flex items-center gap-4 p-5 border-t border-border">
            <span className="flex-1 text-sm text-foreground">Last Updated</span>
            <span className="font-mono text-sm uppercase text-muted-foreground">
              {gateway.updated_at
                ? formatDistanceToNow(new Date(gateway.updated_at), {
                    addSuffix: false,
                  })
                : "Unknown"}
            </span>
          </div>
        </div>
      </div>
    </ViewLayout>
  );
}

function GatewayInspectorViewContent() {
  const navigate = useNavigate({ from: "/$org/gateways/$gatewayId" });
  const { gatewayId, org } = useParams({
    from: "/shell/$org/gateways/$gatewayId",
  });

  const gateway = useGateway(gatewayId);

  if (!gateway) {
    return (
      <div className="flex h-full w-full bg-background">
        <EmptyState
          title="Gateway not found"
          description="This gateway may have been deleted or you may not have access."
          actions={
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: "/$org/gateways",
                  params: { org: org as string },
                })
              }
            >
              Back to gateways
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <GatewayInspectorViewWithGateway gateway={gateway} gatewayId={gatewayId} />
  );
}

export default function GatewayInspectorView() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background">
            <Icon
              name="progress_activity"
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <GatewayInspectorViewContent />
      </Suspense>
    </ErrorBoundary>
  );
}
