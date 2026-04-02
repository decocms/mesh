import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  createMCPClient,
  getPrompt,
  getWellKnownDecopilotVirtualMCP,
  listPrompts,
  useConnections,
  useMCPClient,
  useMCPPromptsList,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useReducer, useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "../error-boundary";
import { IntegrationIcon } from "../integration-icon";
import { useChatStream, useChatPrefs } from "./context";
import {
  PromptArgsDialog,
  type PromptArgumentValues,
} from "./dialog-prompt-arguments";
import { createMentionDoc } from "./tiptap/mention/node";
import { appendToTiptapDoc } from "./tiptap/utils";

// ---------- Types ----------

interface PromptItem {
  prompt: Prompt;
  connection: ConnectionEntity | null;
}

interface IceBreakersUIProps {
  items: PromptItem[];
  onSelect: (prompt: Prompt) => void;
  loadingPrompt?: Prompt | null;
  className?: string;
}

// ---------- Prompt → Connection mapping ----------

/**
 * Hook that fetches prompts per-connection to build an accurate prompt → connection map.
 * Creates an MCP client for each connection, lists its prompts, and returns enriched items.
 */
function usePromptsWithConnections(
  connectionIds: string[],
  connectionMap: Map<string, ConnectionEntity>,
  orgId: string,
): Map<string, ConnectionEntity> {
  const { data } = useSuspenseQuery({
    queryKey: ["ice-breakers-prompt-map", orgId, ...connectionIds],
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        connectionIds.map(async (connId) => {
          try {
            const client = await createMCPClient({
              connectionId: connId,
              orgId,
            });
            const result = await listPrompts(client);
            for (const p of result.prompts) {
              // First connection to claim a prompt wins (matches server dedup)
              if (!(p.name in map)) {
                map[p.name] = connId;
              }
            }
          } catch {
            // Connection might be down — skip it
          }
        }),
      );
      return map;
    },
    staleTime: 60_000,
  });

  const result = new Map<string, ConnectionEntity>();
  for (const [promptName, connId] of Object.entries(data)) {
    const conn = connectionMap.get(connId);
    if (conn) result.set(promptName, conn);
  }
  return result;
}

// ---------- UI ----------

const VISIBLE_COUNT = 3;

const CARD_BASE =
  "h-[140px] flex flex-col p-3.5 rounded-xl border border-foreground/10 text-sm leading-snug transition-colors cursor-pointer";

function PromptCard({
  item,
  onSelect,
  isLoading,
  isDisabled,
}: {
  item: PromptItem;
  onSelect: (prompt: Prompt) => void;
  isLoading: boolean;
  isDisabled: boolean;
}) {
  const { prompt, connection } = item;
  const label =
    prompt.description ?? (prompt.title ?? prompt.name).replace(/_/g, " ");

  return (
    <button
      type="button"
      onClick={() => onSelect(prompt)}
      disabled={isDisabled || isLoading}
      className={cn(
        CARD_BASE,
        "items-start justify-between text-left text-foreground hover:bg-accent/40",
        isLoading && "bg-accent/40",
        (isDisabled || isLoading) && "cursor-not-allowed opacity-50",
      )}
    >
      <IntegrationIcon
        icon={connection?.icon ?? null}
        name={connection?.title ?? "Integration"}
        size="xs"
        className="shrink-0 rounded-lg!"
      />
      <div className="flex items-end gap-1.5 w-full mt-auto">
        <span className="flex-1 line-clamp-3 text-sm">{label}</span>
        {isLoading && <Spinner size="xs" />}
      </div>
    </button>
  );
}

/**
 * IceBreakersUI — 2×2 grid: 3 prompt cards + "+N" overflow card.
 * Each card shows the connection icon (top-left) and prompt description (bottom-left).
 */
function IceBreakersUI({
  items,
  onSelect,
  loadingPrompt,
  className,
}: IceBreakersUIProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, VISIBLE_COUNT);
  const hidden = items.slice(VISIBLE_COUNT);
  const isAnyLoading = !!loadingPrompt;

  // Total visible slots: prompt cards + overflow card (if any)
  const totalSlots = visible.length + (hidden.length > 0 ? 1 : 0);
  const colsClass =
    totalSlots === 1
      ? "grid-cols-1"
      : totalSlots === 2
        ? "grid-cols-2"
        : totalSlots === 3
          ? "grid-cols-2 @lg:grid-cols-3"
          : "grid-cols-2 @lg:grid-cols-4";

  return (
    <div className={cn("w-full mx-auto grid gap-2", colsClass, className)}>
      {visible.map((item) => (
        <PromptCard
          key={item.prompt.name}
          item={item}
          onSelect={onSelect}
          isLoading={loadingPrompt?.name === item.prompt.name}
          isDisabled={isAnyLoading && loadingPrompt?.name !== item.prompt.name}
        />
      ))}
      {hidden.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={isAnyLoading}
              className={cn(
                CARD_BASE,
                "items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40",
                isAnyLoading && "opacity-50 cursor-not-allowed",
              )}
            >
              +{hidden.length} more
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-[280px] max-h-[320px] overflow-y-auto p-2 flex flex-col gap-1"
          >
            {hidden.map((item) => {
              const label =
                item.prompt.description ??
                (item.prompt.title ?? item.prompt.name).replace(/_/g, " ");
              const isLoading = loadingPrompt?.name === item.prompt.name;
              const isDisabled = isAnyLoading && !isLoading;

              return (
                <button
                  key={item.prompt.name}
                  type="button"
                  onClick={() => onSelect(item.prompt)}
                  disabled={isDisabled || isLoading}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground rounded-lg transition-colors cursor-pointer hover:bg-accent/50",
                    isLoading && "bg-accent/50",
                    (isDisabled || isLoading) &&
                      "cursor-not-allowed opacity-50",
                  )}
                >
                  <IntegrationIcon
                    icon={item.connection?.icon ?? null}
                    name={item.connection?.title ?? "Integration"}
                    size="xs"
                    className="shrink-0 rounded-lg!"
                  />
                  <span className="flex-1 line-clamp-2">{label}</span>
                  {isLoading && <Spinner size="xs" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ---------- State machine ----------

interface IceBreakersProps {
  className?: string;
}

function IceBreakersFallback() {
  return null;
}

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

// ---------- Data fetching ----------

function IceBreakersContent({ connectionId }: { connectionId: string | null }) {
  const { sendMessage } = useChatStream();
  const { tiptapDocRef } = useChatPrefs();
  const { org } = useProjectContext();

  // Fetch prompts from the aggregated virtual MCP
  const client = useMCPClient({ connectionId, orgId: org.id });
  const { data } = useMCPPromptsList({ client, staleTime: 60000 });
  const prompts = data?.prompts ?? [];

  // Fetch virtual MCP entity + all connections for icon mapping
  const virtualMcp = useVirtualMCP(connectionId);
  const allConnections = useConnections();
  const connectionMap = new Map(allConnections.map((c) => [c.id, c]));
  const connectionIds = (virtualMcp?.connections ?? []).map(
    (c) => c.connection_id,
  );

  // Per-connection prompt fetching for accurate icon mapping
  const promptToConnection = usePromptsWithConnections(
    connectionIds,
    connectionMap,
    org.id,
  );

  const items: PromptItem[] = prompts.map((prompt) => ({
    prompt,
    connection: promptToConnection.get(prompt.name) ?? null,
  }));

  const [state, dispatch] = useReducer(iceBreakerReducer, { stage: "idle" });
  const [dialogPrompt, setDialogPrompt] = useState<Prompt | null>(null);

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

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <IceBreakersUI
        items={items}
        onSelect={handlePromptSelection}
        loadingPrompt={state.stage === "loading" ? state.prompt : null}
      />
      <PromptArgsDialog
        prompt={dialogPrompt}
        setPrompt={() => {
          setDialogPrompt(null);
          dispatch({ type: "RESET" });
        }}
        onSubmit={handleDialogSubmit}
      />
    </>
  );
}

// ---------- Export ----------

export function IceBreakers({ className }: IceBreakersProps) {
  const { selectedVirtualMcp } = useChatPrefs();
  const { org } = useProjectContext();
  const decopilotId = getWellKnownDecopilotVirtualMCP(org.id).id;
  const connectionId = selectedVirtualMcp?.id ?? decopilotId;

  return (
    <div className={cn("w-full @container", className)}>
      <ErrorBoundary fallback={null}>
        <Suspense
          key={connectionId ?? "default"}
          fallback={<IceBreakersFallback />}
        >
          <IceBreakersContent connectionId={connectionId} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
