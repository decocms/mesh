import {
  getWellKnownOpenRouterConnection,
  OPENROUTER_ICON_URL,
  OPENROUTER_MCP_URL,
} from "@/core/well-known-mcp";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import { EmptyState } from "@/web/components/empty-state";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { DecoChatEmptyState } from "@deco/ui/components/deco-chat-empty-state.tsx";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CpuChip02, Loading01, Plus, X } from "@untitledui/icons";
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
import { useChat } from "../../providers/chat-provider";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useGateways, useModels, type ModelChangePayload } from "./chat";
import { IceBreakers } from "./ice-breakers";
import { ThreadHistoryPopover } from "./thread-history-popover";

// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

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
 * Looks for pattern: /:org/mcps/:connectionId/:collectionName/:itemId
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
function useSystemPrompt(): string {
  const routerState = useRouterState();
  const { connectionId, collectionName, itemId } = parseRouteContext(
    routerState.location.pathname,
  );

  return `You are an AI assistant running in an MCP Mesh environment.

## About MCP Mesh
The Model Context Protocol (MCP) Mesh allows users to connect external MCP servers and expose their capabilities through gateways. Each gateway provides access to a curated set of tools from connected MCP servers.

## Important Notes
- All tool calls are logged and audited for security and compliance
- You have access to the tools exposed through the selected gateway
- MCPs may expose resources that users can browse and edit

## Current Editing Context
${connectionId ? `- Connection ID: ${connectionId}` : ""}
${collectionName ? `- Collection Name: ${collectionName}` : ""}
${itemId ? `- Item ID: ${itemId}` : ""}

Help the user understand and work with this resource.
`;
}

/**
 * OpenRouter illustration with radial mask for empty state
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

export function ChatPanel() {
  const {
    org: { slug: orgSlug, id: orgId },
    locator,
  } = useProjectContext();
  const [, setOpen] = useDecoChatOpen();
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
  const effectiveSelectedGatewayId =
    selectedGatewayState?.gatewayId ?? defaultGatewayId;

  const selectedGateway = gateways.find(
    (g) => g.id === effectiveSelectedGatewayId,
  );
  const selectedModel = models.find(
    (m) =>
      m.id === effectiveSelectedModelState?.id &&
      m.connectionId === effectiveSelectedModelState?.connectionId,
  );

  // Generate dynamic system prompt based on context
  const systemPrompt = useSystemPrompt();

  // Get the onToolCall handler for invalidating collection queries
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // Use shared persisted chat hook - must be called unconditionally (Rules of Hooks)
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt,
    onToolCall,
    onCreateThread: (thread) =>
      createThread({ id: thread.id, title: thread.title }),
  });

  const handleSendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: {
        id: selectedModel.id,
        connectionId: selectedModel.connectionId,
        provider: selectedModel.provider ?? undefined,
      },
      gateway: selectedGateway ? { id: selectedGateway.id } : undefined,
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    await chat.sendMessage(text, metadata);
  };

  const handleModelChange = (m: ModelChangePayload) => {
    setSelectedModelState({ id: m.id, connectionId: m.connectionId });
  };

  // OpenRouter installation - create directly or use existing
  const [isInstallingOpenRouter, setIsInstallingOpenRouter] = useState(false);
  const actions = useConnectionActions();

  const handleInstallOpenRouter = async () => {
    if (!orgId || !user?.id) {
      toast.error("Not authenticated");
      return;
    }

    setIsInstallingOpenRouter(true);
    try {
      // Check if OpenRouter already exists
      const existingConnection = allConnections?.find(
        (conn: { connection_url?: string | null }) =>
          conn.connection_url === OPENROUTER_MCP_URL,
      );

      if (existingConnection) {
        // Navigate to existing connection
        navigate({
          to: "/$org/mcps/$connectionId",
          params: { org: orgSlug, connectionId: existingConnection.id },
        });
        return;
      }

      // Create new OpenRouter connection
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

  if (!hasRequiredSetup) {
    let title: string;
    let description: string;

    if (!hasModelsBinding && !hasGateways) {
      title = "Connect your providers";
      description =
        "Connect an LLM provider and create a gateway to unlock AI-powered features.";
    } else if (!hasModelsBinding) {
      title = "No model provider connected";
      description =
        "Connect to a model provider to unlock AI-powered features.";
    } else {
      title = "No gateways configured";
      description = "Create a gateway to expose your MCP tools to the chat.";
    }

    return (
      <Chat>
        <Chat.Header>
          <Chat.Header.Left>
            <img
              src={CAPYBARA_AVATAR_URL}
              alt="deco chat"
              className="size-5 rounded"
            />
            <span className="text-sm font-medium">deco chat</span>
          </Chat.Header.Left>
          <Chat.Header.Right>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent transition-colors group cursor-pointer"
              title="Close chat"
            >
              <X
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
          </Chat.Header.Right>
        </Chat.Header>

        <Chat.Main className="flex flex-col items-center">
          <Chat.EmptyState>
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
                    Install MCP Server
                  </Button>
                </>
              }
            />
          </Chat.EmptyState>
        </Chat.Main>
      </Chat>
    );
  }
  const initialMessages = chat.messages.filter(
    (message) => message.role !== "system",
  );

  return (
    <Chat>
      <Chat.Header>
        <Chat.Header.Left>
          <IntegrationIcon
            icon={selectedGateway?.icon}
            name={selectedGateway?.title || "deco chat"}
            size="xs"
            fallbackIcon={<CpuChip02 size={12} />}
          />
          <span className="text-sm font-medium">
            {selectedGateway?.title || "deco chat"}
          </span>
        </Chat.Header.Left>
        <Chat.Header.Right>
          <button
            type="button"
            onClick={() => createThread()}
            className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
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
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent transition-colors group cursor-pointer"
            title="Close chat"
          >
            <X
              size={16}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </button>
        </Chat.Header.Right>
      </Chat.Header>

      <Chat.Main>
        {initialMessages.length === 0 ? (
          <Chat.EmptyState>
            <div className="flex flex-col items-center gap-6 w-full px-4">
              <DecoChatEmptyState
                title={selectedGateway?.title || "Ask deco chat"}
                description={
                  selectedGateway?.description ??
                  "Ask anything about configuring model providers or using MCP Mesh."
                }
                avatarNode={
                  <IntegrationIcon
                    icon={selectedGateway?.icon}
                    name={selectedGateway?.title || "deco chat"}
                    size="lg"
                    fallbackIcon={<CpuChip02 size={32} />}
                    className="size-[60px]! rounded-[18px]!"
                  />
                }
              />
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
                        // Submit the prompt name as the first message
                        handleSendMessage(prompt.description ?? prompt.name);
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
          </Chat.EmptyState>
        ) : (
          <Chat.Messages
            messages={chat.messages}
            status={chat.status}
            minHeightOffset={240}
          />
        )}
      </Chat.Main>

      <Chat.Footer>
        <div>
          <Chat.Input
            onSubmit={handleSendMessage}
            onStop={chat.stop}
            disabled={models.length === 0 || !effectiveSelectedModelState}
            isStreaming={
              chat.status === "submitted" || chat.status === "streaming"
            }
            placeholder={
              models.length === 0
                ? "Add an LLM binding connection to start chatting"
                : "Ask anything or @ for context"
            }
            usageMessages={chat.messages}
          >
            <Chat.Input.GatewaySelector
              disabled={false}
              selectedGatewayId={effectiveSelectedGatewayId}
              onGatewayChange={(gatewayId) => {
                if (!gatewayId) return;
                setSelectedGatewayState({ gatewayId });
              }}
            />
            <Chat.Input.ModelSelector
              disabled={false}
              selectedModel={effectiveSelectedModelState ?? undefined}
              onModelChange={handleModelChange}
            />
          </Chat.Input>
        </div>
      </Chat.Footer>
    </Chat>
  );
}
