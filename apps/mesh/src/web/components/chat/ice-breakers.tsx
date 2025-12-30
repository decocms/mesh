import { cn } from "@deco/ui/lib/utils.ts";
import { MessageChatSquare } from "@untitledui/icons";
import type { GatewayPrompt } from "@/web/hooks/use-gateway-prompts";

export interface IceBreakersProps {
  prompts: GatewayPrompt[];
  onSelect: (prompt: GatewayPrompt) => void;
  className?: string;
}

/**
 * IceBreakers - Displays gateway prompts as clickable conversation starters
 *
 * Shows prompts as cards that, when clicked, submit the prompt as the first message
 */
export function IceBreakers({
  prompts,
  onSelect,
  className,
}: IceBreakersProps) {
  if (prompts.length === 0) return null;

  // Show max 4 prompts
  const displayPrompts = prompts.slice(0, 4);

  return (
    <div className={cn("flex flex-col gap-3 w-full", className)}>
      <p className="text-xs text-muted-foreground text-center">Try asking</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {displayPrompts.map((prompt) => (
          <button
            key={prompt.name}
            type="button"
            onClick={() => onSelect(prompt)}
            className={cn(
              "flex items-start gap-3 p-3 rounded-xl",
              "bg-muted/50 hover:bg-muted transition-colors",
              "text-left cursor-pointer group",
              "border border-transparent hover:border-border",
            )}
          >
            <div className="shrink-0 mt-0.5">
              <MessageChatSquare
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-sm font-medium text-foreground truncate">
                {(prompt.title ?? prompt.name).replace(/_/g, " ")}
              </span>
              {prompt.description && (
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {prompt.description}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
