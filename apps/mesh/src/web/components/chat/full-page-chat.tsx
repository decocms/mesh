/**
 * Full Page Chat Component
 *
 * A centered chat experience for the org home page.
 * Shows a greeting when empty, and expands to show messages when active.
 */

import {
  getWellKnownOpenRouterConnection,
  OPENROUTER_ICON_URL,
  OPENROUTER_MCP_URL,
} from "@/core/well-known-mcp";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import { EmptyState } from "@/web/components/empty-state";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CpuChip02, Loading01, Plus } from "@untitledui/icons";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import {
  useConnectionActions,
  useConnections,
} from "../../hooks/collections/use-connection";
import { useBindingConnections } from "../../hooks/use-binding";
import { useThreads } from "../../hooks/use-chat-store";
import {
  useGatewayPrompts,
  type GatewayPrompt,
} from "../../hooks/use-gateway-prompts";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { usePersistedChat } from "../../hooks/use-persisted-chat";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { ErrorBoundary } from "../error-boundary";
import { useChat } from "./chat-context";
import { IceBreakers } from "./ice-breakers";
import {
  Chat,
  GatewaySelector,
  ModelSelector,
  UsageStats,
  useGateways,
  useModels,
} from "./index";
import { ThreadHistoryPopover } from "./thread-history-popover";

/**
 * Route context extracted from collection detail routes
 */
interface RouteContext {
  connectionId: string | null;
  collectionName: string | null;
  itemId: string | null;
}

/**
 * Parse route context from the current URL pathname
 */
function parseRouteContext(pathname: string): RouteContext {
  const mcpsPattern = /\/[^/]+\/mcps\/([^/]+)\/([^/]+)\/([^/]+)/;
  const match = pathname.match(mcpsPattern);

  if (match && match[1] && match[2] && match[3]) {
    return {
      connectionId: decodeURIComponent(match[1]),
      collectionName: decodeURIComponent(match[2]),
      itemId: decodeURIComponent(match[3]),
    };
  }

  return { connectionId: null, collectionName: null, itemId: null };
}

/**
 * Hook that generates a dynamic system prompt based on context
 */
function useSystemPrompt(gatewayId?: string): string {
  const routerState = useRouterState();
  const { connectionId, collectionName, itemId } = parseRouteContext(
    routerState.location.pathname,
  );

  return `You are an AI assistant running in an MCP Mesh environment.

## About MCP Mesh
The Model Context Protocol (MCP) Mesh allows users to connect external MCP servers and expose their capabilities through toolboxes. Each toolbox provides access to a curated set of tools from connected MCP servers.

## Important Notes
- All tool calls are logged and audited for security and compliance
- You have access to the tools exposed through the selected toolbox
- MCPs may expose resources that users can browse and edit
- You have context to the current toolbox and its tools, resources, and prompts

## Current Editing Context
${connectionId ? `- Connection ID: ${connectionId}` : ""}
${collectionName ? `- Collection Name: ${collectionName}` : ""}
${itemId ? `- Item ID: ${itemId}` : ""}
${gatewayId ? `- Toolbox ID: ${gatewayId}` : ""}

Help the user understand and work with this resource.
`;
}

/**
 * OpenRouter illustration for empty state
 */
function OpenRouterIllustration() {
  return (
    <img
      src="/empty-state-openrouter.svg"
      alt=""
      width={336}
      height={320}
      aria-hidden="true"
      className="w-xs h-auto mask-radial-[100%_100%] mask-radial-from-20% mask-radial-to-50% mask-radial-at-center"
    />
  );
}

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

interface FullPageChatProps {
  /** Optional pre-selected gateway ID (for toolbox scoped chat) */
  gatewayId?: string;
  /** Hide the gateway selector (for toolbox scoped chat) */
  hideGatewaySelector?: boolean;
  /** Custom greeting message */
  greeting?: string;
}

function FullPageChatContent({
  gatewayId: fixedGatewayId,
  hideGatewaySelector = false,
  greeting,
}: FullPageChatProps) {
  const {
    org: { slug: orgSlug, id: orgId, name: orgName },
    locator,
  } = useProjectContext();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const { createThread, activeThreadId, setActiveThreadId, hideThread } =
    useChat();
  const { threads, refetch } = useThreads();

  // Fetch gateways and models directly from hooks
  const gateways = useGateways();
  const models = useModels();

  // Check for LLM binding connection
  const allConnections = useConnections();
  const [modelsConnection] = useBindingConnections({
    connections: allConnections,
    binding: "LLMS",
  });

  const hasModelsBinding = Boolean(modelsConnection);
  const hasGateways = gateways.length > 0;
  const hasRequiredSetup = hasModelsBinding && hasGateways;

  const [selectedModelState, setSelectedModelState] = useLocalStorage<{
    id: string;
    connectionId: string;
  } | null>(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    (existing) => existing ?? null,
  );

  const [selectedGatewayState, setSelectedGatewayState] = useLocalStorage<{
    gatewayId: string;
  } | null>(`${locator}:selected-gateway`, () => null);

  const defaultModel = models[0];
  const effectiveSelectedModelState =
    selectedModelState ??
    (defaultModel
      ? { id: defaultModel.id, connectionId: defaultModel.connectionId }
      : null);

  const defaultGatewayId = gateways[0]?.id;
  // Use fixed gateway if provided, otherwise use selected state
  const effectiveSelectedGatewayId =
    fixedGatewayId ?? selectedGatewayState?.gatewayId ?? defaultGatewayId;

  const selectedGateway = gateways.find(
    (g) => g.id === effectiveSelectedGatewayId,
  );
  const selectedModel = models.find(
    (m) =>
      m.id === effectiveSelectedModelState?.id &&
      m.connectionId === effectiveSelectedModelState?.connectionId,
  );

  // Generate dynamic system prompt based on context
  const systemPrompt = useSystemPrompt(effectiveSelectedGatewayId);

  // Get the onToolCall handler for invalidating collection queries
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // Use shared persisted chat hook
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt,
    onToolCall,
    onCreateThread: (thread) =>
      createThread({ id: thread.id, title: thread.title }),
  });

  // Get input and branching state from context
  const { inputValue, setInputValue, branchContext, clearBranch } = useChat();

  const { isEmpty } = chat;

  // Handle clicking on the branch preview to go back to original thread
  const handleGoToOriginalMessage = () => {
    if (!branchContext) return;
    setActiveThreadId(branchContext.originalThreadId);
    clearBranch();
    setInputValue("");
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    if (!selectedGateway?.id) {
      toast.error("No toolbox configured");
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
      },
      gateway: { id: selectedGateway.id },
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

  const handleGatewayChange = (gatewayId: string) => {
    setSelectedGatewayState({ gatewayId });
  };

  // OpenRouter installation
  const [isInstallingOpenRouter, setIsInstallingOpenRouter] = useState(false);
  const actions = useConnectionActions();

  const handleInstallOpenRouter = async () => {
    if (!orgId || !user?.id) {
      toast.error("Not authenticated");
      return;
    }

    setIsInstallingOpenRouter(true);
    try {
      const existingConnection = allConnections?.find(
        (conn: { connection_url?: string | null }) =>
          conn.connection_url === OPENROUTER_MCP_URL,
      );

      if (existingConnection) {
        navigate({
          to: "/$org/mcps/$connectionId",
          params: { org: orgSlug, connectionId: existingConnection.id },
        });
        return;
      }

      const connectionData = getWellKnownOpenRouterConnection({
        id: generatePrefixedId("conn"),
      });

      const result = await actions.create.mutateAsync(connectionData);

      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org: orgSlug, connectionId: result.id },
      });
    } catch (error) {
      toast.error(
        `Failed to connect OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsInstallingOpenRouter(false);
    }
  };

  // Determine the greeting text
  const greetingText =
    greeting ??
    (user?.name
      ? `Welcome back, ${user.name.split(" ")[0]}!`
      : `Welcome to ${orgName}`);

  if (!hasRequiredSetup) {
    let title: string;
    let description: string;

    if (!hasModelsBinding && !hasGateways) {
      title = "Connect your providers";
      description =
        "Connect an LLM provider and create a toolbox to unlock AI-powered features.";
    } else if (!hasModelsBinding) {
      title = "No model provider connected";
      description =
        "Connect to a model provider to unlock AI-powered features.";
    } else {
      title = "No toolboxes configured";
      description = "Create a toolbox to expose your tools to the chat.";
    }

    return (
      <div className="flex flex-col h-full w-full bg-background">
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            image={<OpenRouterIllustration />}
            title={title}
            description={description}
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={handleInstallOpenRouter}
                  disabled={isInstallingOpenRouter}
                >
                  <img
                    src={OPENROUTER_ICON_URL}
                    alt="OpenRouter"
                    className="size-4"
                  />
                  {isInstallingOpenRouter
                    ? "Installing..."
                    : "Install OpenRouter"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate({
                      to: "/$org/mcps",
                      params: { org: orgSlug },
                      search: { action: "create" },
                    })
                  }
                >
                  Add Connection
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isEmpty ? (
          /* Empty state: centered greeting and prompt */
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
            <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
              {/* Greeting */}
              <div className="flex flex-col items-center gap-4 text-center">
                <IntegrationIcon
                  icon={selectedGateway?.icon}
                  name={selectedGateway?.title || "Chat"}
                  size="lg"
                  fallbackIcon={<CpuChip02 size={32} />}
                  className="size-16 rounded-2xl"
                />
                <h1 className="text-2xl font-semibold text-foreground">
                  {greetingText}
                </h1>
                {selectedGateway?.description && (
                  <p className="text-muted-foreground text-center text-sm max-w-md">
                    {selectedGateway.description}
                  </p>
                )}
              </div>

              {/* Ice breakers */}
              {effectiveSelectedGatewayId && (
                <ErrorBoundary key={effectiveSelectedGatewayId} fallback={null}>
                  <Suspense
                    fallback={
                      <div className="flex justify-center">
                        <Loading01
                          size={20}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    }
                  >
                    <GatewayIceBreakers
                      gatewayId={effectiveSelectedGatewayId}
                      onSelect={(prompt) => {
                        handleSendMessage(prompt.description ?? prompt.name);
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
          </div>
        ) : (
          /* Messages view */
          <div className="flex-1 overflow-y-auto">
            <Chat.Messages
              messages={chat.messages}
              status={chat.status}
              minHeightOffset={180}
            />
          </div>
        )}

        {/* Input area - always at bottom */}
        <div className="flex-none border-t border-border bg-background p-4">
          <div className="max-w-2xl mx-auto flex flex-col gap-2">
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
              disabled={!selectedModel || !selectedGateway?.id}
              isStreaming={
                chat.status === "submitted" || chat.status === "streaming"
              }
              placeholder={
                !selectedModel
                  ? "Select a model to start chatting"
                  : "Ask anything..."
              }
            >
              {!hideGatewaySelector && (
                <GatewaySelector
                  selectedGatewayId={selectedGateway?.id}
                  onGatewayChange={handleGatewayChange}
                  placeholder="Toolbox"
                  variant="borderless"
                />
              )}
              <ModelSelector
                selectedModel={selectedModel ?? undefined}
                onModelChange={handleModelChange}
                placeholder="Model"
                variant="borderless"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => createThread()}
                  className="flex size-6 items-center justify-center rounded p-1 hover:bg-muted transition-colors group cursor-pointer"
                  title="New chat"
                >
                  <Plus
                    size={16}
                    className="text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                </button>
                <ThreadHistoryPopover
                  threads={threads}
                  activeThreadId={activeThreadId}
                  onSelectThread={setActiveThreadId}
                  onRemoveThread={hideThread}
                  onOpen={() => refetch()}
                />
              </div>
              <UsageStats messages={chat.messages} />
            </Chat.Input>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FullPageChat(props: FullPageChatProps) {
  return (
    <Chat.Provider>
      <FullPageChatContent {...props} />
    </Chat.Provider>
  );
}
