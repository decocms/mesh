import type { GatewayEntity } from "@/tools/gateway/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { ToolSetSelector } from "@/web/components/tool-set-selector.tsx";
import { PromptSetSelector } from "@/web/components/gateway/prompt-selector.tsx";
import { ResourceSetSelector } from "@/web/components/gateway/resource-selector.tsx";
import {
  useGateway,
  useGatewayActions,
} from "@/web/hooks/collections/use-gateway";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useConnectionsPrompts } from "@/web/hooks/use-connection-prompts";
import { useConnectionsResources } from "@/web/hooks/use-connection-resources";
import { Button } from "@deco/ui/components/button.tsx";
import {
  InfoCircle,
  Loading01,
  Check,
  Copy01,
  CpuChip02,
  Plus,
  FlipBackward,
  Edit03,
  Save01,
} from "@untitledui/icons";
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
import { ResourceTabs } from "@deco/ui/components/resource-tabs.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { slugify } from "@/web/utils/slugify";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import { ViewLayout, ViewActions, ViewTabs } from "../layout";
import {
  Chat,
  ModelSelector,
  UsageStats,
  useModels,
} from "@/web/components/chat";
import { IceBreakers } from "@/web/components/chat/ice-breakers";
import { useChat } from "@/web/components/chat/chat-context";
import {
  useGatewayPrompts,
  type GatewayPrompt,
} from "@/web/hooks/use-gateway-prompts";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { usePersistedChat } from "@/web/hooks/use-persisted-chat";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { cn } from "@deco/ui/lib/utils.ts";
import { authClient } from "@/web/lib/auth-client";
import { ThreadHistoryPopover } from "@/web/components/chat/thread-history-popover";
import { useThreads, useThreadActions } from "@/web/hooks/use-chat-store";
import type { Thread } from "@/web/types/chat-threads";

type GatewayTabId = "settings" | "tools" | "resources" | "prompts";

/**
 * Hardcoded system prompt for gateway chat
 */
const GATEWAY_SYSTEM_PROMPT =
  "You are a helpful assistant. Please try answering the user's questions using your available tools.";

/**
 * Ice breakers component that uses suspense to fetch gateway prompts
 */
function GatewayIceBreakers({
  gatewayId,
  onSelect,
}: {
  gatewayId: string;
  onSelect: (prompt: GatewayPrompt) => void;
}) {
  const { data: prompts } = useGatewayPrompts(gatewayId);

  if (prompts.length === 0) return null;

  return <IceBreakers prompts={prompts} onSelect={onSelect} className="mt-6" />;
}

/**
 * Helper to find stored item in array, fallback to first item
 */
function findOrFirst<T>(
  array: T[],
  predicate: (item: T) => boolean,
): T | undefined {
  return array.find(predicate) ?? array[0];
}

/**
 * Hook that combines useLocalStorage with findOrFirst to manage selected items
 */
function useStoredSelection<TState, TItem>(
  key: string,
  items: TItem[],
  predicate: (item: TItem, state: TState) => boolean,
  initialValue: TState | null = null,
) {
  const [storedState, setStoredState] = useLocalStorage<TState | null>(
    key,
    initialValue,
  );

  const selectedItem = findOrFirst(items, (item) =>
    storedState ? predicate(item, storedState) : false,
  );

  return [selectedItem, setStoredState] as const;
}

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
                  {copiedConfig ? <Check size={14} /> : <Copy01 size={14} />}
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
                  <Check size={14} className="ml-2 text-green-500" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add to Claude Code</TooltipContent>
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
 * Convert gateway connections to ResourceSetSelector format.
 */
function gatewayToResourceSet(
  gateway: GatewayEntity,
): Record<string, string[]> {
  const resourceSet: Record<string, string[]> = {};

  for (const conn of gateway.connections) {
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
 * Convert gateway connections to PromptSetSelector format.
 */
function gatewayToPromptSet(gateway: GatewayEntity): Record<string, string[]> {
  const promptSet: Record<string, string[]> = {};

  for (const conn of gateway.connections) {
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
 * Merge tool, resource, and prompt sets into gateway connections format.
 */
function mergeSelectionsToGatewayConnections(
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
 * Chat Panel for Gateway
 */
interface GatewayChatPanelProps {
  gateway: GatewayEntity;
  activeThreadId: string;
  setActiveThreadId: (id: string) => void;
}

function GatewayChatPanelContent({
  gateway,
  activeThreadId,
  setActiveThreadId,
}: GatewayChatPanelProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  // Fetch models
  const models = useModels();

  // Model selection with localStorage
  const { locator } = useProjectContext();
  const [selectedModel, setSelectedModelState] = useStoredSelection<
    { id: string; connectionId: string },
    (typeof models)[number]
  >(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    models,
    (m, state) => m.id === state.id && m.connectionId === state.connectionId,
  );

  // Thread actions for storing threads with gateway association
  const threadActions = useThreadActions();

  // Use the shared persisted chat hook with hardcoded system prompt
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt: GATEWAY_SYSTEM_PROMPT,
    onCreateThread: (thread) => {
      // Store thread with gateway association
      const newThread: Thread = {
        id: thread.id,
        title: thread.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        hidden: false,
        gatewayId: gateway.id,
      };
      threadActions.insert.mutate(newThread);
    },
  });

  // Get input and branching state from context
  const { inputValue, setInputValue, branchContext, clearBranch } = useChat();

  const { isEmpty } = chat;

  // Chat config is valid when model is configured
  const hasChatConfig = Boolean(selectedModel);

  const handleSendMessage = async (text: string) => {
    if (!hasChatConfig || !selectedModel) {
      toast.error("No model configured");
      return;
    }

    // Clear input
    setInputValue("");

    // Clear editing state before sending
    clearBranch();

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: {
        id: selectedModel.id,
        connectionId: selectedModel.connectionId,
        provider: selectedModel.provider ?? undefined,
        limits: selectedModel.limits ?? undefined,
      },
      gateway: { id: gateway.id },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    await chat.sendMessage(text, metadata);
  };

  const handleModelChange = (model: { id: string; connectionId: string }) => {
    setSelectedModelState(model);
  };

  // Handle clicking on the branch preview to go back to original thread
  const handleGoToOriginalMessage = () => {
    if (!branchContext) return;
    setActiveThreadId(branchContext.originalThreadId);
    // Clear the branch context since we're going back
    clearBranch();
    setInputValue("");
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="flex flex-col items-center gap-4">
        <IntegrationIcon
          icon={gateway.icon}
          name={gateway.title || "Gateway"}
          size="lg"
          fallbackIcon={<CpuChip02 size={32} />}
          className="size-[60px]! rounded-[18px]!"
        />
        <h3 className="text-xl font-medium text-foreground">
          {gateway.title || "Gateway Chat"}
        </h3>
        {gateway.description ? (
          <div className="text-muted-foreground text-center text-sm max-w-md">
            {gateway.description}
          </div>
        ) : null}
      </div>

      {/* Ice Breakers */}
      <ErrorBoundary fallback={null}>
        <Suspense
          fallback={
            <div className="flex justify-center mt-6">
              <Loading01
                size={20}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <GatewayIceBreakers
            gatewayId={gateway.id}
            onSelect={(prompt) => {
              handleSendMessage(prompt.description ?? prompt.name);
            }}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );

  return (
    <Chat>
      <Chat.Main className="h-full relative overflow-hidden">
        {isEmpty ? (
          <Chat.EmptyState>{emptyState}</Chat.EmptyState>
        ) : (
          <Chat.Messages
            messages={chat.messages}
            status={chat.status}
            minHeightOffset={240}
          />
        )}
      </Chat.Main>

      <Chat.Footer>
        <div className="max-w-2xl mx-auto w-full min-w-0 flex flex-col gap-2">
          <Chat.ErrorBanner
            error={chat.error}
            onFixInChat={() => {
              if (chat.error) {
                handleSendMessage(
                  `I encountered this error: ${chat.error.message}. Can you help me fix it?`,
                );
              }
            }}
            onDismiss={chat.clearError}
          />
          <Chat.FinishReasonWarning
            finishReason={chat.finishReason}
            onContinue={() => {
              handleSendMessage("Please continue.");
            }}
            onDismiss={chat.clearFinishReason}
          />
          <Chat.BranchPreview
            branchContext={branchContext}
            clearBranchContext={clearBranch}
            onGoToOriginalMessage={handleGoToOriginalMessage}
            setInputValue={setInputValue}
          />
          <Chat.Input
            value={inputValue}
            onChange={setInputValue}
            onSubmit={async () => {
              if (!inputValue.trim()) return;
              await handleSendMessage(inputValue.trim());
            }}
            onStop={chat.stop}
            disabled={!hasChatConfig}
            isStreaming={
              chat.status === "submitted" || chat.status === "streaming"
            }
            placeholder={
              !selectedModel
                ? "Select a model to start chatting"
                : "Ask anything or @ for context"
            }
          >
            <ModelSelector
              selectedModel={selectedModel ?? undefined}
              onModelChange={handleModelChange}
              placeholder="Model"
              variant="borderless"
            />
            <UsageStats messages={chat.messages} />
          </Chat.Input>
        </div>
      </Chat.Footer>
    </Chat>
  );
}

function GatewayChatPanel(props: GatewayChatPanelProps) {
  return (
    <Chat.Provider>
      <GatewayChatPanelContent {...props} />
    </Chat.Provider>
  );
}

/**
 * Settings Tab - Gateway configuration (title, description, status, mode, strategy)
 */
function GatewaySettingsTab({
  form,
  gateway,
  icon,
}: {
  form: ReturnType<typeof useForm<GatewayFormData>>;
  gateway: GatewayEntity;
  icon?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] h-full">
      {/* Left panel - Settings */}
      <div className="lg:border-r border-b lg:border-b-0 border-border overflow-auto">
        <Form {...form}>
          <div className="flex flex-col">
            {/* Header section - Icon, Title, Description */}
            <div className="flex flex-col gap-4 p-5 border-b border-border">
              <div className="flex items-start justify-between">
                <IntegrationIcon
                  icon={icon}
                  name={form.watch("title") || "Gateway"}
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
            <div className="flex flex-col gap-4 p-5">
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

              {/* Gateway Strategy */}
              <FormField
                control={form.control}
                name="tool_selection_strategy"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-3">
                      <FormLabel className="mb-0">Gateway Strategy</FormLabel>
                      <div className="flex items-center gap-1.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Gateway strategy help"
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
                                  <strong>Passthrough:</strong> Pass tools
                                  through as-is (default).
                                </div>
                                <div>
                                  <strong>Smart Tool Selection:</strong>{" "}
                                  Intelligent tool selection behavior.
                                </div>
                                <div>
                                  <strong>Code Execution:</strong> Code
                                  execution behavior.
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
                            <SelectItem value="passthrough">
                              Passthrough
                            </SelectItem>
                            <SelectItem value="smart_tool_selection">
                              Smart Tool Selection
                            </SelectItem>
                            <SelectItem value="code_execution">
                              Code Execution
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
          </div>
        </Form>
      </div>

      {/* Right panel - IDE Integration */}
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
          <span className="text-muted-foreground uppercase text-xs">
            {gateway.updated_at
              ? formatDistanceToNow(new Date(gateway.updated_at), {
                  addSuffix: false,
                })
              : "Unknown"}
          </span>
        </div>
      </div>
    </div>
  );
}

function GatewayInspectorViewWithGateway({
  gateway,
  gatewayId,
  requestedTabId,
}: {
  gateway: GatewayEntity;
  gatewayId: string;
  requestedTabId: GatewayTabId;
}) {
  const routerState = useRouterState();
  const url = routerState.location.href;
  const router = useRouter();
  const navigate = useNavigate({ from: "/$org/gateways/$gatewayId" });
  const actions = useGatewayActions();
  const { locator } = useProjectContext();

  // Mode state: "chat" (default) or "edit"
  const [mode, setMode] = useState<"chat" | "edit">("chat");

  // Thread management for chat mode
  const [activeThreadId, setActiveThreadId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.gatewayChatActiveThread(locator, gatewayId),
    (existing) => existing || crypto.randomUUID(),
  );

  // Fetch threads filtered by gateway
  const { threads, refetch: refetchThreads } = useThreads({ gatewayId });
  const threadActions = useThreadActions();

  const handleHideThread = async (threadId: string) => {
    await threadActions.update.mutateAsync({
      id: threadId,
      updates: { hidden: true },
    });
  };

  // Fetch all connections to get tool names for "all tools" expansion
  const connections = useConnections({});

  // Get all connection IDs
  const connectionIds = connections.map((c) => c.id);

  // Fetch prompts and resources for all connections
  const { promptsMap: connectionPrompts } =
    useConnectionsPrompts(connectionIds);
  const { resourcesMap: connectionResources } =
    useConnectionsResources(connectionIds);

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

  // Initialize resourceSet from gateway connections
  const [resourceSet, setResourceSet] = useState<Record<string, string[]>>(() =>
    gatewayToResourceSet(gateway),
  );

  // Initialize promptSet from gateway connections
  const [promptSet, setPromptSet] = useState<Record<string, string[]>>(() =>
    gatewayToPromptSet(gateway),
  );

  // Track if any selection has changed
  const [selectionDirty, setSelectionDirty] = useState(false);

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
  const hasAnyChanges = hasFormChanges || selectionDirty;

  const handleSave = async () => {
    const formData = form.getValues();

    // Merge all selections into gateway connections format
    const newConnections = mergeSelectionsToGatewayConnections(
      toolSet,
      resourceSet,
      promptSet,
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
    setSelectionDirty(false);
    // Return to chat mode after save
    setMode("chat");
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
    navigate({ search: (prev) => ({ ...prev, tab: tabId }), replace: true });
  };

  const isSaving = actions.update.isPending;
  const isEditMode = mode === "edit";

  return (
    <ViewLayout onBack={() => router.history.back()}>
      {/* Header: Show chat header in chat mode, tabs in edit mode */}
      <ViewTabs>
        {isEditMode ? (
          <ResourceTabs
            tabs={tabs}
            activeTab={activeTabId}
            onTabChange={handleTabChange}
          />
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <IntegrationIcon
              icon={gateway.icon}
              name={gateway.title || "Gateway"}
              size="xs"
              fallbackIcon={<CpuChip02 size={12} />}
            />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {gateway.title}
              </span>
              {gateway.description ? (
                <>
                  <span className="text-xs text-muted-foreground font-normal">
                    •
                  </span>
                  <span className="text-xs text-muted-foreground font-normal truncate min-w-0 max-w-[20ch]">
                    {gateway.description}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        )}
      </ViewTabs>

      <ViewActions>
        <PinToSidebarButton
          title={gateway.title}
          url={url}
          icon={gateway.icon ?? "cpu_chip"}
        />
        {isEditMode ? (
          <>
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7 border border-input"
                      disabled={isSaving}
                      onClick={() => setMode("chat")}
                      aria-label="Cancel"
                    >
                      <FlipBackward size={14} />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Cancel</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {hasAnyChanges && (
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
            )}
          </>
        ) : (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    onClick={() => setActiveThreadId(crypto.randomUUID())}
                    aria-label="New thread"
                    variant="outline"
                    size="icon"
                    className="size-7 border border-input"
                  >
                    <Plus size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New thread</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ThreadHistoryPopover
              threads={threads}
              activeThreadId={activeThreadId}
              onSelectThread={setActiveThreadId}
              onRemoveThread={handleHideThread}
              onOpen={() => refetchThreads()}
              variant="outline"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    onClick={() => setMode("edit")}
                    aria-label="Edit"
                    variant="outline"
                    size="icon"
                    className="size-7 border border-input"
                  >
                    <Edit03 size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
      </ViewActions>

      <div className="flex h-full w-full bg-background overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          {/* Chat mode content */}
          <div
            className={cn(
              "h-full transition-opacity duration-200 ease-out",
              isEditMode
                ? "opacity-0 pointer-events-none hidden"
                : "opacity-100",
            )}
          >
            <GatewayChatPanel
              gateway={gateway}
              activeThreadId={activeThreadId}
              setActiveThreadId={setActiveThreadId}
            />
          </div>

          {/* Edit mode content */}
          <div
            className={cn(
              "h-full overflow-auto transition-opacity duration-200 ease-out",
              isEditMode
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none hidden",
            )}
          >
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
                  <GatewaySettingsTab
                    form={form}
                    gateway={gateway}
                    icon={gateway.icon}
                  />
                ) : activeTabId === "tools" ? (
                  <ToolSetSelector
                    toolSet={toolSet}
                    onToolSetChange={handleToolSetChange}
                  />
                ) : activeTabId === "resources" ? (
                  <ResourceSetSelector
                    resourceSet={resourceSet}
                    onResourceSetChange={handleResourceSetChange}
                    connectionResources={connectionResources}
                  />
                ) : activeTabId === "prompts" ? (
                  <PromptSetSelector
                    promptSet={promptSet}
                    onPromptSetChange={handlePromptSetChange}
                    connectionPrompts={connectionPrompts}
                  />
                ) : null}
              </Suspense>
            </ErrorBoundary>
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

  // Get tab from search params
  const search = useSearch({ from: "/shell/$org/gateways/$gatewayId" });
  const requestedTabId = (search.tab as GatewayTabId) || "settings";

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
    <GatewayInspectorViewWithGateway
      gateway={gateway}
      gatewayId={gatewayId}
      requestedTabId={requestedTabId}
    />
  );
}

export default function GatewayInspectorView() {
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
        <GatewayInspectorViewContent />
      </Suspense>
    </ErrorBoundary>
  );
}
