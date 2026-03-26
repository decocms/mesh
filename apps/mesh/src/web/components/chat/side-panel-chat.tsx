import { AgentAvatar } from "@/web/components/agent-icon";
import { AgentsList } from "@/web/components/home/agents-list.tsx";
import { ImportFromDecoDialog } from "@/web/components/import-from-deco-dialog.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  getWellKnownDecopilotVirtualMCP,
  useIsOrgAdmin,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { ArrowRight, Users03 } from "@untitledui/icons";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { ErrorBoundary } from "../error-boundary";

import { Chat, useChat } from "./index";
import { ChatContextPanel } from "./context-panel";

import { useAiProviders } from "@/web/hooks/collections/use-llm";

// ---------- Import deco.cx Banner ----------

const DECO_BANNER_GRADIENT = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 500 64' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='0.6'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(55.083 -7.55 1.4151 14.867 -37.917 86)'><stop stop-color='rgba(165,149,255,1)' offset='0.0045422'/><stop stop-color='rgba(210,202,255,1)' offset='0.16426'/><stop stop-color='rgba(255,255,255,1)' offset='0.32398'/><stop stop-color='rgba(255,255,255,0.3)' offset='0.68776'/><stop stop-color='rgba(255,224,139,0.3)' offset='0.74761'/><stop stop-color='rgba(255,209,80,0.3)' offset='0.77753'/><stop stop-color='rgba(255,193,22,0.3)' offset='0.80745'/><stop stop-color='rgba(208,236,26,1)' offset='0.96307'/></radialGradient></defs></svg>")`;
const DECO_BANNER_TEXTURE = "/decotexture.svg";

function ImportDecoSiteBanner({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full relative flex items-center gap-4 px-4 py-4 rounded-lg border border-border bg-background overflow-hidden transition-colors text-left cursor-pointer group"
      style={{
        backgroundImage: DECO_BANNER_GRADIENT,
        backgroundSize: "100% 100%",
      }}
    >
      <div className="relative shrink-0 p-1.5 bg-[var(--brand-green-light)] rounded-lg border border-border">
        <IntegrationIcon
          icon="/logos/deco%20logo.svg"
          name="deco.cx"
          size="xs"
          className="border-0 rounded-none"
        />
      </div>
      <p className="flex-1 relative text-sm font-medium text-foreground leading-none whitespace-nowrap">
        Import your deco.cx site
      </p>
      <img
        src={DECO_BANNER_TEXTURE}
        alt=""
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: "274.5px",
          height: "272.25px",
          left: "calc(50% + 145.5px)",
          top: "calc(50% + 40px)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="relative bg-background flex items-center justify-center size-8 rounded-md shrink-0">
        <ArrowRight
          size={16}
          className="text-foreground transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </button>
  );
}

function useIsDecoUser() {
  const { data: session } = authClient.useSession();
  const { data } = useQuery({
    queryKey: KEYS.decoProfile(session?.user?.email),
    queryFn: async () => {
      const res = await fetch("/api/deco-sites/profile");
      if (!res.ok) return { isDecoUser: false };
      return res.json() as Promise<{ isDecoUser: boolean }>;
    },
    enabled: Boolean(session?.user?.email),
    staleTime: 5 * 60_000,
  });
  return data?.isDecoUser ?? false;
}

// ---------- Home empty state (greeting, agents, ice breakers, banner) ----------

function HomeEmptyState({
  onOpenContextPanel,
}: {
  onOpenContextPanel: () => void;
}) {
  const { org } = useProjectContext();
  const isOrgAdmin = useIsOrgAdmin();
  const { data: session } = authClient.useSession();
  const { selectedVirtualMcp } = useChat();
  const [importOpen, setImportOpen] = useState(false);
  const isDecoUser = useIsDecoUser();

  const userName = session?.user?.name?.split(" ")[0] || "there";
  const defaultAgent = getWellKnownDecopilotVirtualMCP(org.id);
  const displayAgent = selectedVirtualMcp ?? defaultAgent;

  return (
    <>
      <div className="flex-1 flex flex-col items-center px-10">
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <div className="flex flex-col items-center w-full max-w-[600px]">
            <div className="flex justify-center mb-4">
              <AgentAvatar
                icon={displayAgent.icon}
                name={displayAgent.title}
                size="md"
                className={cn(
                  "transition-opacity duration-200",
                  !selectedVirtualMcp && "invisible",
                )}
              />
            </div>
            <div className="text-center mb-6">
              <p className="text-xl font-medium text-foreground">
                What's on your mind, {userName}?
              </p>
            </div>
            <Chat.IceBreakers className="w-full" />
            <div className="w-full">
              <Chat.Input onOpenContextPanel={onOpenContextPanel} />
            </div>
          </div>
          {isOrgAdmin && (
            <div className="w-full max-w-[800px] mt-10 mx-auto">
              <AgentsList />
            </div>
          )}
        </div>
        <div className="w-full max-w-[500px] mx-auto flex flex-col gap-2 pb-6">
          {isDecoUser && isOrgAdmin && (
            <ImportDecoSiteBanner onClick={() => setImportOpen(true)} />
          )}
        </div>
      </div>
      <ImportFromDecoDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

// ---------- Default sidebar empty state ----------

function SidebarEmptyState() {
  const { org } = useProjectContext();
  const { selectedVirtualMcp } = useChat();

  const defaultAgent = getWellKnownDecopilotVirtualMCP(org.id);
  const displayAgent = selectedVirtualMcp ?? defaultAgent;

  return (
    <Chat.EmptyState>
      <div className="flex flex-col items-center gap-3 md:gap-6 w-full px-4">
        <div className="flex flex-col items-center justify-center gap-2 md:gap-4 p-0 text-center">
          <IntegrationIcon
            icon={displayAgent.icon}
            name={displayAgent.title}
            size="lg"
            fallbackIcon={<Users03 size={32} />}
            className="size-10 min-w-10 md:size-[60px]! md:min-w-[60px] rounded-xl md:rounded-[18px]!"
          />
          <h3 className="text-base md:text-xl font-medium text-foreground">
            {displayAgent.title}
          </h3>
          <div className="text-muted-foreground text-center text-xs md:text-sm max-w-md line-clamp-2">
            {displayAgent.description ??
              "Ask anything about configuring model providers or using MCP Mesh."}
          </div>
        </div>
        <Chat.IceBreakers />
      </div>
    </Chat.EmptyState>
  );
}

// ---------- Panel content ----------

function ChatPanelContent({ variant }: { variant?: "home" | "default" }) {
  const aiProviders = useAiProviders();
  const { isChatEmpty } = useChat();
  const [activePanel, setActivePanel] = useState<"chat" | "context">("chat");

  if (aiProviders?.providers?.length === 0) {
    const title = "No model provider connected";
    const description =
      "Connect to a model provider to unlock AI-powered features.";

    return (
      <Chat className="animate-in fade-in-0 duration-200">
        <Chat.Main className="flex flex-col items-center">
          <Chat.EmptyState>
            <Chat.NoLlmBindingEmptyState
              title={title}
              description={description}
            />
          </Chat.EmptyState>
        </Chat.Main>
      </Chat>
    );
  }

  return (
    <Chat className="relative overflow-hidden animate-in fade-in-0 duration-200">
      {/* Chat view */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col transition-opacity duration-100 ease-out",
          activePanel !== "chat"
            ? "opacity-0 pointer-events-none"
            : "opacity-100",
        )}
      >
        {!isChatEmpty ? (
          <>
            <Chat.Main>
              <Chat.Messages />
            </Chat.Main>
            <Chat.Footer>
              <Chat.Input
                onOpenContextPanel={() => setActivePanel("context")}
              />
            </Chat.Footer>
          </>
        ) : variant === "home" ? (
          <HomeEmptyState
            onOpenContextPanel={() => setActivePanel("context")}
          />
        ) : (
          <>
            <Chat.Main>
              <SidebarEmptyState />
            </Chat.Main>
            <Chat.Footer>
              <Chat.Input
                onOpenContextPanel={() => setActivePanel("context")}
              />
            </Chat.Footer>
          </>
        )}
      </div>

      {/* Context view */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col transition-opacity duration-100 ease-out",
          activePanel === "context"
            ? "opacity-100"
            : "opacity-0 pointer-events-none",
        )}
      >
        <ChatContextPanel back onClose={() => setActivePanel("chat")} />
      </div>
    </Chat>
  );
}

export function ChatPanel({ variant }: { variant?: "home" | "default" }) {
  return (
    <ErrorBoundary fallback={<Chat.Skeleton />}>
      <Suspense fallback={<Chat.Skeleton />}>
        <ChatPanelContent variant={variant} />
      </Suspense>
    </ErrorBoundary>
  );
}
