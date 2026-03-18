import { Spinner } from "@deco/ui/components/spinner.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  getPrompt,
  useMCPClient,
  useMCPPromptsListQuery,
  useProjectContext,
} from "@decocms/mesh-sdk";
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import { Suspense, useReducer, useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "../error-boundary";
import { AgentAvatar } from "../agent-icon";
import { useChatStable } from "./context";
import {
  PromptArgsDialog,
  type PromptArgumentValues,
} from "./dialog-prompt-arguments";
import { createMentionDoc } from "./tiptap/mention/node";
import { appendToTiptapDoc } from "./tiptap/utils";

// ---------------------------------------------------------------------------
// Prompt card
// ---------------------------------------------------------------------------

function PromptCard({
  prompt,
  onSelect,
  isDisabled,
  isLoading,
  agentIcon,
  agentName,
}: {
  prompt: Prompt;
  onSelect: (prompt: Prompt) => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  agentIcon: string | null | undefined;
  agentName: string;
}) {
  const promptText =
    prompt.description ?? (prompt.title ?? prompt.name).replace(/_/g, " ");

  return (
    <button
      type="button"
      onClick={() => onSelect(prompt)}
      disabled={isDisabled || isLoading}
      className={cn(
        "flex flex-col gap-3 p-4 rounded-xl bg-muted/50 border border-border/60",
        "text-left cursor-pointer transition-all duration-150",
        "hover:bg-accent/60 hover:border-border hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isLoading && "bg-accent/60 border-border",
        (isDisabled || isLoading) && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex items-center justify-between">
        <AgentAvatar icon={agentIcon} name={agentName} size="xs" />
        {isLoading && <Spinner size="xs" />}
      </div>
      <p className="text-sm text-foreground leading-snug line-clamp-3">
        {promptText}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cards grid
// ---------------------------------------------------------------------------

interface IceBreakersUIProps {
  prompts: Prompt[];
  onSelect: (prompt: Prompt) => void;
  loadingPrompt?: Prompt | null;
  agentIcon: string | null | undefined;
  agentName: string;
}

function IceBreakersUI({
  prompts,
  onSelect,
  loadingPrompt,
  agentIcon,
  agentName,
}: IceBreakersUIProps) {
  if (prompts.length === 0) return null;

  const isAnyLoading = !!loadingPrompt;

  return (
    <div
      className={cn(
        "grid gap-3 w-full",
        prompts.length === 1 && "grid-cols-1 max-w-xs mx-auto",
        prompts.length >= 2 && "grid-cols-2",
      )}
    >
      {prompts.map((prompt) => (
        <PromptCard
          key={prompt.name}
          prompt={prompt}
          onSelect={onSelect}
          isLoading={loadingPrompt?.name === prompt.name}
          isDisabled={isAnyLoading && loadingPrompt?.name !== prompt.name}
          agentIcon={agentIcon}
          agentName={agentName}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type IceBreakerState =
  | { stage: "idle" }
  | {
      stage: "loading";
      prompt: Prompt;
      arguments?: PromptArgumentValues;
    };

type IceBreakerAction =
  | { type: "SELECT_PROMPT"; prompt: Prompt }
  | {
      type: "START_LOADING";
      prompt: Prompt;
      arguments?: PromptArgumentValues;
    }
  | { type: "RESET" };

function iceBreakerReducer(
  state: IceBreakerState,
  action: IceBreakerAction,
): IceBreakerState {
  switch (action.type) {
    case "SELECT_PROMPT":
      if (!action.prompt.arguments || action.prompt.arguments.length === 0) {
        return { stage: "loading", prompt: action.prompt };
      }
      return { stage: "idle" };

    case "START_LOADING":
      return {
        stage: "loading",
        prompt: action.prompt,
        arguments: action.arguments,
      };

    case "RESET":
      return { stage: "idle" };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Content (fetches prompts for a connection)
// ---------------------------------------------------------------------------

function IceBreakersContent({ connectionId }: { connectionId: string | null }) {
  const { tiptapDocRef, sendMessage, selectedVirtualMcp } = useChatStable();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId,
    orgId: org.id,
  });
  const { data } = useMCPPromptsListQuery({ client, staleTime: 60000 });
  const prompts = data?.prompts ?? [];
  const [state, dispatch] = useReducer(iceBreakerReducer, { stage: "idle" });
  const [dialogPrompt, setDialogPrompt] = useState<Prompt | null>(null);

  const agentIcon = selectedVirtualMcp?.icon ?? null;
  const agentName = selectedVirtualMcp?.title ?? "Agent";

  const loadPrompt = async (prompt: Prompt, args?: PromptArgumentValues) => {
    if (!client) {
      toast.error("MCP client not available");
      dispatch({ type: "RESET" });
      return;
    }

    try {
      const result = await getPrompt(client, prompt.name, args);

      dispatch({ type: "RESET" });

      const newTiptapDoc = appendToTiptapDoc(tiptapDocRef.current, {
        type: "paragraph",
        content: [
          createMentionDoc({
            id: prompt.name,
            name: prompt.name,
            metadata: result.messages,
            char: "/",
          }),
        ],
      });

      await sendMessage(newTiptapDoc);
    } catch (error) {
      console.error("[ice-breakers] Failed to fetch prompt:", error);
      toast.error("Failed to load prompt. Please try again.");
      dispatch({ type: "RESET" });
    }
  };

  const handlePromptSelection = async (prompt: Prompt) => {
    if (prompt.arguments && prompt.arguments.length > 0) {
      dispatch({ type: "SELECT_PROMPT", prompt });
      setDialogPrompt(prompt);
      return;
    }

    dispatch({ type: "START_LOADING", prompt });
    await loadPrompt(prompt);
  };

  const handleDialogSubmit = async (values: PromptArgumentValues) => {
    if (!dialogPrompt) return;

    dispatch({
      type: "START_LOADING",
      prompt: dialogPrompt,
      arguments: values,
    });
    setDialogPrompt(null);
    await loadPrompt(dialogPrompt, values);
  };

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full">
      <IceBreakersUI
        prompts={prompts}
        onSelect={handlePromptSelection}
        loadingPrompt={state.stage === "loading" ? state.prompt : null}
        agentIcon={agentIcon}
        agentName={agentName}
      />
      <PromptArgsDialog
        prompt={dialogPrompt}
        setPrompt={() => {
          setDialogPrompt(null);
          dispatch({ type: "RESET" });
        }}
        onSubmit={handleDialogSubmit}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

interface IceBreakersProps {
  className?: string;
}

export function IceBreakers({ className }: IceBreakersProps) {
  const { selectedVirtualMcp } = useChatStable();

  // Only show ice breakers for custom agents, not Decopilot
  if (!selectedVirtualMcp) return null;

  const connectionId = selectedVirtualMcp.id;

  return (
    <div className={cn("w-full mt-6", className)}>
      <ErrorBoundary fallback={null}>
        <Suspense key={connectionId} fallback={null}>
          <IceBreakersContent connectionId={connectionId} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
