import { cn } from "@deco/ui/lib/utils.ts";
import type { GatewayPrompt } from "@/web/hooks/use-gateway-prompts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";

export interface IceBreakersProps {
  prompts: GatewayPrompt[];
  onSelect: (prompt: GatewayPrompt) => void;
  className?: string;
}

const MAX_VISIBLE = 3;

function PromptPill({
  prompt,
  onSelect,
}: {
  prompt: GatewayPrompt;
  onSelect: (prompt: GatewayPrompt) => void;
}) {
  const promptText = prompt.description ?? prompt.name;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(prompt)}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full hover:bg-accent/50 transition-colors cursor-pointer"
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
export function IceBreakers({
  prompts,
  onSelect,
  className,
}: IceBreakersProps) {
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
