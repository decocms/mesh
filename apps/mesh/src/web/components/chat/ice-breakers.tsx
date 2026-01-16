import {
  fetchGatewayPrompt,
  useGatewayPrompts,
  type GatewayPrompt,
  type GatewayPromptResult,
} from "@/web/hooks/use-gateway-prompts";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorBoundary } from "../error-boundary";
import { useChat } from "./context";

interface IceBreakersProps {
  prompts: GatewayPrompt[];
  onSelect: (prompt: GatewayPrompt) => void;
  className?: string;
}

const MAX_VISIBLE = 3;

function PromptPill({
  prompt,
  onSelect,
  isSelected,
  isDisabled,
}: {
  prompt: GatewayPrompt;
  onSelect: (prompt: GatewayPrompt) => void;
  isSelected?: boolean;
  isDisabled?: boolean;
}) {
  const promptText = prompt.description ?? prompt.name;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(prompt)}
          disabled={isDisabled}
          className={cn(
            "px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full hover:bg-accent/50 transition-colors cursor-pointer",
            isSelected && "bg-accent/50 text-foreground",
            isDisabled && "opacity-60 cursor-not-allowed hover:bg-transparent",
          )}
        >
          {(prompt.title ?? prompt.name).replace(/_/g, " ")}
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
function IceBreakers({ prompts, onSelect, className }: IceBreakersProps) {
  if (prompts.length === 0) return null;

  const visiblePrompts = prompts.slice(0, MAX_VISIBLE);
  const hiddenPrompts = prompts.slice(MAX_VISIBLE);
  const hasMore = hiddenPrompts.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-2",
          className,
        )}
      >
        {visiblePrompts.map((prompt) => (
          <PromptPill key={prompt.name} prompt={prompt} onSelect={onSelect} />
        ))}
        {hasMore && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="size-7 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground border border-border rounded-full hover:bg-accent/50 transition-colors cursor-pointer"
              >
                +{hiddenPrompts.length}
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="center" className="w-auto p-2">
              <div className="flex flex-col gap-1">
                {hiddenPrompts.map((prompt) => {
                  const promptText = prompt.description ?? prompt.name;
                  return (
                    <Tooltip key={prompt.name}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onSelect(prompt)}
                          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors cursor-pointer text-left"
                        >
                          {(prompt.title ?? prompt.name).replace(/_/g, " ")}
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

function buildArgumentSchema(prompt: GatewayPrompt) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const arg of prompt.arguments ?? []) {
    shape[arg.name] = arg.required
      ? z.string().min(1, "Required")
      : z.string();
  }

  return z.object(shape);
}

function buildDefaultValues(prompt: GatewayPrompt): PromptArgumentValues {
  const defaults: PromptArgumentValues = {};
  for (const arg of prompt.arguments ?? []) {
    defaults[arg.name] = "";
  }
  return defaults;
}

function getPromptUserText(result: GatewayPromptResult): string | null {
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
  isSubmitting,
  errorMessage,
}: {
  prompt: GatewayPrompt;
  onCancel: () => void;
  onSubmit: (values: PromptArgumentValues) => Promise<void>;
  isSubmitting: boolean;
  errorMessage: string | null;
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
      <div className="flex items-center gap-2">
        <PromptPill
          prompt={prompt}
          onSelect={onCancel}
          isSelected
          isDisabled={isSubmitting}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Change
        </Button>
      </div>
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
                      disabled={isSubmitting}
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
          {errorMessage ? (
            <p className="text-xs text-destructive">{errorMessage}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={!form.formState.isValid || isSubmitting}
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
 * Ice breakers component that uses suspense to fetch gateway prompts
 * Uses the chat context for gateway selection and message sending.
 * Includes ErrorBoundary, Suspense, and container internally.
 */
export function GatewayIceBreakers({ className }: GatewayIceBreakersProps) {
  const { selectedGateway } = useChat();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        className,
      )}
      style={{ minHeight: "32px" }}
    >
      {selectedGateway && (
        <ErrorBoundary key={selectedGateway.id} fallback={null}>
          <Suspense fallback={<IceBreakersFallback />}>
            <GatewayIceBreakersContent gatewayId={selectedGateway.id} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}

/**
 * Inner component that fetches and displays prompts for a specific gateway
 */
function GatewayIceBreakersContent({ gatewayId }: { gatewayId: string }) {
  const { sendMessage } = useChat();
  const { data: prompts } = useGatewayPrompts(gatewayId);
  const [selectedPrompt, setSelectedPrompt] = useState<GatewayPrompt | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (prompts.length === 0) {
    return null;
  }

  const handlePromptSelection = async (prompt: GatewayPrompt) => {
    if (isSubmitting) return;
    setErrorMessage(null);

    if (!prompt.arguments || prompt.arguments.length === 0) {
      setIsSubmitting(true);
      try {
        const result = await fetchGatewayPrompt(gatewayId, prompt.name);
        const userText =
          getPromptUserText(result) ?? prompt.description ?? prompt.name;
        await sendMessage(userText);
      } catch (error) {
        console.error("[ice-breakers] Failed to fetch prompt:", error);
        setErrorMessage("Failed to load prompt. Try again.");
      } finally {
        setIsSubmitting(false);
        setSelectedPrompt(null);
      }
      return;
    }

    setSelectedPrompt(prompt);
  };

  const handlePromptSubmit = async (values: PromptArgumentValues) => {
    if (!selectedPrompt) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await fetchGatewayPrompt(
        gatewayId,
        selectedPrompt.name,
        values,
      );
      const userText =
        getPromptUserText(result) ??
        selectedPrompt.description ??
        selectedPrompt.name;
      await sendMessage(userText);
      setSelectedPrompt(null);
    } catch (error) {
      console.error("[ice-breakers] Failed to fetch prompt:", error);
      setErrorMessage("Failed to load prompt. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedPrompt) {
    return (
      <ExpandedIceBreaker
        key={selectedPrompt.name}
        prompt={selectedPrompt}
        onCancel={() => setSelectedPrompt(null)}
        onSubmit={handlePromptSubmit}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
      />
    );
  }

  return (
    <IceBreakers
      prompts={prompts}
      onSelect={handlePromptSelection}
      className={isSubmitting ? "opacity-70 pointer-events-none" : undefined}
    />
  );
}
