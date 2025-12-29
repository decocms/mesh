import { EmptyState } from "@/web/components/empty-state";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { DecoChatEmptyState } from "@deco/ui/components/deco-chat-empty-state.tsx";
import { CpuChip02, Plus, X } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Chat, useGateways, useModels, type ModelChangePayload } from "./chat";
import { toast } from "sonner";
import { useThreads } from "../../hooks/use-chat-store";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { useChat } from "../../providers/chat-provider";
import { ThreadHistoryPopover } from "./thread-history-popover";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { usePersistedChat } from "../../hooks/use-persisted-chat";
import { useConnections } from "../../hooks/collections/use-connection";
import { useBindingConnections } from "../../hooks/use-binding";

// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

export function ChatPanel() {
  const {
    org: { slug: orgSlug },
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

  // Use shared persisted chat hook - must be called unconditionally (Rules of Hooks)
  const chat = usePersistedChat({
    threadId: activeThreadId,
    onCreateThread: (thread) =>
      createThread({ id: thread.id, title: thread.title }),
  });

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

        <Chat.Main
          className="flex flex-col items-center"
          innerClassName="max-w-2xl mx-auto w-full min-w-0"
        >
          <Chat.EmptyState>
            <EmptyState
              title={title}
              description={description}
              actions={
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate({
                      to: hasModelsBinding ? "/$org/gateways" : "/$org/mcps",
                      params: { org: orgSlug },
                      search: hasModelsBinding
                        ? undefined
                        : { action: "create" },
                    })
                  }
                >
                  {hasModelsBinding ? "Create gateway" : "Add connection"}
                </Button>
              }
            />
          </Chat.EmptyState>
        </Chat.Main>
      </Chat>
    );
  }

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

      <Chat.Main innerClassName="max-w-2xl mx-auto w-full min-w-0">
        {chat.messages.length === 0 ? (
          <Chat.EmptyState>
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
