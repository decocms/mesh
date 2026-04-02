import { Spinner } from "@deco/ui/components/spinner.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@deco/ui/components/drawer.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { useIsMobile } from "@deco/ui/hooks/use-mobile.ts";
import {
  getPrompt,
  getWellKnownDecopilotVirtualMCP,
  useMCPClient,
  useMCPPromptsList,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { usePromptConnectionMap } from "./use-prompt-connection-map";
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
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
  connection: { icon: string | null; title: string } | null;
}

interface IceBreakersUIProps {
  items: PromptItem[];
  onSelect: (prompt: Prompt) => void;
  loadingPrompt?: Prompt | null;
  className?: string;
}

// ---------- UI ----------

const VISIBLE_COUNT = 3;

const CARD_BASE =
  "flex flex-col p-3.5 rounded-xl border border-foreground/10 text-sm leading-snug transition-colors cursor-pointer";

function PromptCard({
  item,
  onSelect,
  isLoading,
  isDisabled,
  tall,
}: {
  item: PromptItem;
  onSelect: (prompt: Prompt) => void;
  isLoading: boolean;
  isDisabled: boolean;
  tall?: boolean;
}) {
  const { prompt, connection } = item;
  const label =
    prompt.description ?? (prompt.title ?? prompt.name).replace(/_/g, " ");
  const name = (prompt.title ?? prompt.name).replace(/_/g, " ");

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(prompt)}
          disabled={isDisabled || isLoading}
          className={cn(
            CARD_BASE,
            tall ? "min-h-[180px]" : "min-h-[160px]",
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
          <div className="flex flex-col gap-0.5 w-full mt-auto">
            <span className="text-xs text-muted-foreground/60 truncate">
              {name}
            </span>
            <div className="flex items-end gap-1.5">
              <span
                className={cn(
                  "flex-1 text-sm",
                  tall ? "line-clamp-3" : "line-clamp-2",
                )}
              >
                {label}
              </span>
              {isLoading && <Spinner size="xs" />}
            </div>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function AllPromptsModal({
  items,
  open,
  onOpenChange,
  onSelect,
  loadingPrompt,
}: {
  items: PromptItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (prompt: Prompt) => void;
  loadingPrompt: Prompt | null | undefined;
}) {
  const [search, setSearch] = useState("");
  const isAnyLoading = !!loadingPrompt;

  const filtered = search.trim()
    ? items.filter((item) => {
        const q = search.toLowerCase();
        return (
          item.prompt.name.toLowerCase().includes(q) ||
          (item.prompt.title ?? "").toLowerCase().includes(q) ||
          (item.prompt.description ?? "").toLowerCase().includes(q) ||
          (item.connection?.title ?? "").toLowerCase().includes(q)
        );
      })
    : items;

  const isMobile = useIsMobile();

  const gridContent = (
    <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
        {filtered.length === 0 && (
          <p className="col-span-4 text-sm text-muted-foreground text-center py-8">
            No prompts match &ldquo;{search}&rdquo;
          </p>
        )}
        {filtered.map((item) => (
          <PromptCard
            key={item.prompt.name}
            item={item}
            tall
            onSelect={(prompt) => {
              onOpenChange(false);
              onSelect(prompt);
            }}
            isLoading={loadingPrompt?.name === item.prompt.name}
            isDisabled={
              isAnyLoading && loadingPrompt?.name !== item.prompt.name
            }
          />
        ))}
      </div>
    </div>
  );

  const searchBar = (
    <CollectionSearch
      value={search}
      onChange={setSearch}
      placeholder="Search prompts..."
      onKeyDown={(e) => {
        if (e.key === "Escape") setSearch("");
      }}
    />
  );

  if (isMobile) {
    return (
      <TooltipProvider delayDuration={400}>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="h-[85vh] flex flex-col p-0 gap-0">
            <DrawerHeader className="sr-only">
              <DrawerTitle>All prompts</DrawerTitle>
            </DrawerHeader>
            <div className="flex items-center h-12 border-b border-border px-4 shrink-0">
              <span className="text-sm font-medium text-foreground">
                Prompts
              </span>
            </div>
            {searchBar}
            {gridContent}
          </DrawerContent>
        </Drawer>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[1100px] h-[680px] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>All prompts</DialogTitle>
          </DialogHeader>
          <div className="flex items-center h-12 border-b border-border px-4 shrink-0">
            <span className="text-sm font-medium text-foreground">Prompts</span>
          </div>
          {searchBar}
          {gridContent}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
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
  const [modalOpen, setModalOpen] = useState(false);

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
    <TooltipProvider delayDuration={400}>
      <div className={cn("w-full mx-auto grid gap-2", colsClass, className)}>
        {visible.map((item) => (
          <PromptCard
            key={item.prompt.name}
            item={item}
            onSelect={onSelect}
            isLoading={loadingPrompt?.name === item.prompt.name}
            isDisabled={
              isAnyLoading && loadingPrompt?.name !== item.prompt.name
            }
          />
        ))}
        {hidden.length > 0 && (
          <button
            type="button"
            disabled={isAnyLoading}
            onClick={() => setModalOpen(true)}
            className={cn(
              CARD_BASE,
              "min-h-[160px] items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40",
              isAnyLoading && "opacity-50 cursor-not-allowed",
            )}
          >
            +{hidden.length} more
          </button>
        )}
      </div>
      <AllPromptsModal
        items={items}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSelect={onSelect}
        loadingPrompt={loadingPrompt}
      />
    </TooltipProvider>
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

  // Per-connection prompt → connection icon mapping
  const promptToConnection = usePromptConnectionMap(connectionId, org.id);

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
