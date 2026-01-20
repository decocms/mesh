import {
  fetchVirtualMCPPrompt,
  useVirtualMCPPrompts,
  type VirtualMCPPrompt,
  type VirtualMCPPromptResult,
} from "@/web/hooks/use-virtual-mcp-prompts";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useReducer } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ErrorBoundary } from "../error-boundary";
import { useChat } from "./context";

interface IceBreakersProps {
  prompts: VirtualMCPPrompt[];
  onSelect: (prompt: VirtualMCPPrompt) => void;
  loadingPrompt?: VirtualMCPPrompt | null;
  className?: string;
}

const MAX_VISIBLE = 3;

function PromptPill({
  prompt,
  onSelect,
  isSelected,
  isDisabled,
  isLoading,
}: {
  prompt: VirtualMCPPrompt;
  onSelect: (prompt: VirtualMCPPrompt) => void;
  isSelected?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
}) {
  const promptText = prompt.description ?? prompt.name;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(prompt)}
          disabled={isDisabled || isLoading}
          className={cn(
            "px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full hover:bg-accent/50 transition-colors cursor-pointer flex items-center gap-1.5",
            isSelected && "bg-accent/50 text-foreground",
            isLoading && "bg-accent/50 text-foreground",
            (isDisabled || isLoading) &&
              "cursor-not-allowed hover:bg-accent/50",
          )}
        >
          {(prompt.title ?? prompt.name).replace(/_/g, " ")}
          {isLoading && <Spinner size="xs" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="text-xs">{promptText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * IceBreakers - Displays gateway prompts as clickable conversation starters
 *
 * Shows prompts as compact pills that, when clicked, submit the prompt as the first message
 */
function IceBreakers({
  prompts,
  onSelect,
  loadingPrompt,
  className,
}: IceBreakersProps) {
  if (prompts.length === 0) return null;

  const visiblePrompts = prompts.slice(0, MAX_VISIBLE);
  const hiddenPrompts = prompts.slice(MAX_VISIBLE);
  const hasMore = hiddenPrompts.length > 0;
  const isAnyLoading = !!loadingPrompt;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-2",
          className,
        )}
      >
        {visiblePrompts.map((prompt) => (
          <PromptPill
            key={prompt.name}
            prompt={prompt}
            onSelect={onSelect}
            isLoading={loadingPrompt?.name === prompt.name}
            isDisabled={isAnyLoading && loadingPrompt?.name !== prompt.name}
          />
        ))}
        {hasMore && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={isAnyLoading}
                className={cn(
                  "size-7 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground border border-border rounded-full hover:bg-accent/50 transition-colors cursor-pointer",
                  isAnyLoading && "opacity-60 cursor-not-allowed",
                )}
              >
                +{hiddenPrompts.length}
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="center" className="w-auto p-2">
              <div className="flex flex-col gap-1">
                {hiddenPrompts.map((prompt) => {
                  const promptText = prompt.description ?? prompt.name;
                  const isLoading = loadingPrompt?.name === prompt.name;
                  return (
                    <Tooltip key={prompt.name}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onSelect(prompt)}
                          disabled={isAnyLoading && !isLoading}
                          className={cn(
                            "px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors cursor-pointer text-left flex items-center gap-1.5",
                            isLoading && "bg-accent/50 text-foreground",
                            isAnyLoading &&
                              !isLoading &&
                              "opacity-60 cursor-not-allowed",
                          )}
                        >
                          {(prompt.title ?? prompt.name).replace(/_/g, " ")}
                          {isLoading && <Spinner size="xs" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">{promptText}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TooltipProvider>
  );
}

type PromptArgumentValues = Record<string, string>;

function buildArgumentSchema(prompt: VirtualMCPPrompt) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const arg of prompt.arguments ?? []) {
    shape[arg.name] = arg.required ? z.string().min(1, "Required") : z.string();
  }

  return z.object(shape);
}

function buildDefaultValues(prompt: VirtualMCPPrompt): PromptArgumentValues {
  const defaults: PromptArgumentValues = {};
  for (const arg of prompt.arguments ?? []) {
    defaults[arg.name] = "";
  }
  return defaults;
}

function getPromptUserText(result: VirtualMCPPromptResult): string | null {
  for (const message of result.messages ?? []) {
    if (message.role !== "user") continue;
    if (message.content?.type !== "text") continue;
    const text = message.content.text?.trim();
    if (text) return text;
  }
  return null;
}

function ExpandedIceBreaker({
  prompt,
  onCancel,
  onSubmit,
}: {
  prompt: VirtualMCPPrompt;
  onCancel: () => void;
  onSubmit: (values: PromptArgumentValues) => Promise<void>;
}) {
  const schema = buildArgumentSchema(prompt) as z.ZodTypeAny;
  const resolver = zodResolver(schema as any);
  const form = useForm<PromptArgumentValues>({
    resolver: resolver as unknown as Resolver<PromptArgumentValues>,
    defaultValues: buildDefaultValues(prompt),
    mode: "onChange",
  });

  const argumentsList = prompt.arguments ?? [];

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <PromptPill prompt={prompt} onSelect={onCancel} isSelected />
      {prompt.description ? (
        <p className="text-xs text-muted-foreground max-w-xl text-center">
          {prompt.description}
        </p>
      ) : null}
      <Form {...form}>
        <form
          className="w-full max-w-xl flex flex-col gap-3"
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete="off"
        >
          {argumentsList.map((arg) => (
            <FormField
              key={arg.name}
              control={form.control}
              name={arg.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    {arg.name}
                    {arg.required ? " *" : ""}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      required={arg.required}
                      placeholder={arg.description ?? ""}
                      className="h-9"
                    />
                  </FormControl>
                  {arg.description ? (
                    <FormDescription className="text-xs">
                      {arg.description}
                    </FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={!form.formState.isValid}
            >
              Use prompt
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

interface GatewayIceBreakersProps {
  className?: string;
}

/**
 * Fallback component for Suspense that maintains min-height to prevent layout shift
 * Shows skeleton pills matching the actual IceBreakers appearance
 */
function IceBreakersFallback() {
  return (
    <>
      <Skeleton className="h-6 w-20 rounded-full border border-border" />
      <Skeleton className="h-6 w-24 rounded-full border border-border" />
    </>
  );
}

/**
 * State machine for ice breakers
 */
type IceBreakerState =
  | { stage: "idle" }
  | { stage: "collectingArguments"; prompt: VirtualMCPPrompt }
  | {
      stage: "loading";
      prompt: VirtualMCPPrompt;
      arguments?: PromptArgumentValues;
    };

type IceBreakerAction =
  | { type: "SELECT_PROMPT"; prompt: VirtualMCPPrompt }
  | { type: "CANCEL" }
  | {
      type: "START_LOADING";
      prompt: VirtualMCPPrompt;
      arguments?: PromptArgumentValues;
    }
  | { type: "RESET" };

function iceBreakerReducer(
  state: IceBreakerState,
  action: IceBreakerAction,
): IceBreakerState {
  switch (action.type) {
    case "SELECT_PROMPT":
      // If prompt has no arguments, go directly to loading
      if (!action.prompt.arguments || action.prompt.arguments.length === 0) {
        return { stage: "loading", prompt: action.prompt };
      }
      // Otherwise, collect arguments first
      return { stage: "collectingArguments", prompt: action.prompt };

    case "CANCEL":
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

/**
 * Inner component that fetches and displays prompts for a specific virtual MCP (agent)
 */
function VirtualMCPIceBreakersContent({
  virtualMcpId,
}: {
  virtualMcpId: string;
}) {
  const { setInputValue } = useChat();
  const { data: prompts } = useVirtualMCPPrompts(virtualMcpId);
  const [state, dispatch] = useReducer(iceBreakerReducer, { stage: "idle" });

  if (prompts.length === 0) {
    return null;
  }

  const loadPrompt = async (
    prompt: VirtualMCPPrompt,
    args?: PromptArgumentValues,
  ) => {
    try {
      const result = await fetchVirtualMCPPrompt(
        virtualMcpId,
        prompt.name,
        args,
      );
      const userText =
        getPromptUserText(result) ?? prompt.description ?? prompt.name;
      setInputValue(userText);
      dispatch({ type: "RESET" });
    } catch (error) {
      console.error("[ice-breakers] Failed to fetch prompt:", error);
      toast.error("Failed to load prompt. Please try again.");
      dispatch({ type: "RESET" });
    }
  };

  const handlePromptSelection = async (prompt: VirtualMCPPrompt) => {
    // If prompt has arguments, show the form
    if (prompt.arguments && prompt.arguments.length > 0) {
      dispatch({ type: "SELECT_PROMPT", prompt });
      return;
    }

    // No arguments - fetch directly
    dispatch({ type: "START_LOADING", prompt });
    await loadPrompt(prompt);
  };

  const handleCancel = () => {
    dispatch({ type: "CANCEL" });
  };

  const handlePromptSubmit = async (values: PromptArgumentValues) => {
    if (state.stage !== "collectingArguments") return;

    const { prompt } = state;
    dispatch({ type: "START_LOADING", prompt, arguments: values });
    await loadPrompt(prompt, values);
  };

  // Render based on current state with animation
  return (
    <div className="relative w-full">
      {state.stage === "collectingArguments" ? (
        <div
          key="expanded"
          className="animate-in fade-in-0 zoom-in-95 duration-300"
        >
          <ExpandedIceBreaker
            prompt={state.prompt}
            onCancel={handleCancel}
            onSubmit={handlePromptSubmit}
          />
        </div>
      ) : (
        <div
          key="list"
          className="animate-in fade-in-0 zoom-in-95 duration-300"
        >
          <IceBreakers
            prompts={prompts}
            onSelect={handlePromptSelection}
            loadingPrompt={state.stage === "loading" ? state.prompt : null}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Ice breakers component that uses suspense to fetch virtual MCP prompts
 * Uses the chat context for virtual MCP selection and message sending.
 * Includes ErrorBoundary, Suspense, and container internally.
 */
export function GatewayIceBreakers({ className }: GatewayIceBreakersProps) {
  const { selectedVirtualMcp } = useChat();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        className,
      )}
      style={{ minHeight: "32px" }}
    >
      {selectedVirtualMcp && (
        <ErrorBoundary key={selectedVirtualMcp.id} fallback={null}>
          <Suspense fallback={<IceBreakersFallback />}>
            <VirtualMCPIceBreakersContent
              virtualMcpId={selectedVirtualMcp.id}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
