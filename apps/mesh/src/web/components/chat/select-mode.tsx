import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { ToolSelectionStrategy } from "@/mcp-clients/virtual-mcp/types";
import {
  ArrowsRight,
  Check,
  ChevronDown,
  Code01,
  Lightbulb02,
} from "@untitledui/icons";
import { useState } from "react";

/**
 * Mode configuration with business-friendly labels and descriptions
 */
const MODE_CONFIGS: Record<
  ToolSelectionStrategy,
  {
    label: string;
    description: string;
    icon: typeof ArrowsRight;
    recommended?: boolean;
  }
> = {
  passthrough: {
    label: "Direct access",
    description: "Best for small teams or when you need predictable behavior",
    icon: ArrowsRight,
  },
  smart_tool_selection: {
    label: "Smart discovery",
    description:
      "Ideal for large teams with many tools - AI finds what it needs",
    icon: Lightbulb02,
  },
  code_execution: {
    label: "Smart execution",
    description: "Maximum flexibility - AI can write code to orchestrate tools",
    icon: Code01,
    recommended: true,
  },
};

function ModeItemContent({
  mode,
  isSelected,
  onSelect,
}: {
  mode: ToolSelectionStrategy;
  isSelected?: boolean;
  onSelect: () => void;
}) {
  const config = MODE_CONFIGS[mode];
  const Icon = config.icon;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 py-3 px-3 hover:bg-accent cursor-pointer rounded-lg transition-colors",
        isSelected && "bg-accent",
      )}
    >
      {/* Icon */}
      <div className="p-1.5 shrink-0 rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>

      {/* Text Content */}
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {config.label}
          </span>
          {config.recommended && (
            <Badge variant="outline" className="text-xs">
              Recommended
            </Badge>
          )}
          {isSelected && (
            <Check size={16} className="text-foreground shrink-0 ml-auto" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {config.description}
        </p>
      </div>
    </div>
  );
}

function SelectedModeDisplay({
  mode,
  placeholder = "Select mode",
}: {
  mode: ToolSelectionStrategy | undefined;
  placeholder?: string;
}) {
  if (!mode) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{placeholder}</span>
        <ChevronDown
          size={14}
          className="text-muted-foreground opacity-50 shrink-0"
        />
      </div>
    );
  }

  const config = MODE_CONFIGS[mode];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-0 group-hover:gap-2 group-data-[state=open]:gap-2 min-w-0 overflow-hidden transition-all duration-200">
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground group-hover:text-foreground group-data-[state=open]:text-foreground truncate whitespace-nowrap max-w-0 opacity-0 group-hover:max-w-[150px] group-hover:opacity-100 group-data-[state=open]:max-w-[150px] group-data-[state=open]:opacity-100 transition-all duration-200 ease-in-out overflow-hidden">
        {config.label}
      </span>
      <ChevronDown
        size={14}
        className="text-muted-foreground opacity-0 max-w-0 group-hover:opacity-50 group-hover:max-w-[14px] group-data-[state=open]:opacity-50 group-data-[state=open]:max-w-[14px] shrink-0 transition-all duration-200 ease-in-out overflow-hidden"
      />
    </div>
  );
}

export interface ModeSelectorProps {
  selectedMode: ToolSelectionStrategy;
  onModeChange: (mode: ToolSelectionStrategy) => void;
  variant?: "borderless" | "bordered";
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Mode selector component for choosing agent execution mode.
 * Displays business-friendly labels consistent with the share modal.
 */
export function ModeSelector({
  selectedMode,
  onModeChange,
  variant = "borderless",
  className,
  placeholder = "Mode",
  disabled = false,
}: ModeSelectorProps) {
  const [open, setOpen] = useState(false);

  const handleModeChange = (mode: ToolSelectionStrategy) => {
    onModeChange(mode);
    setOpen(false);
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant={variant === "borderless" ? "ghost" : "outline"}
                size="sm"
                className={cn(
                  "text-sm hover:bg-accent rounded-lg py-0.5 px-1 gap-1 shadow-none cursor-pointer border-0 group focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0 shrink justify-start overflow-hidden",
                  variant === "borderless" && "md:border-none",
                  disabled && "cursor-not-allowed opacity-50",
                  className,
                )}
                disabled={disabled}
                data-state={open ? "open" : "closed"}
              >
                <SelectedModeDisplay
                  mode={selectedMode}
                  placeholder={placeholder}
                />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {MODE_CONFIGS[selectedMode]?.description ?? "Choose agent mode"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        className="w-[350px] p-0 overflow-hidden"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col p-1">
          {(Object.keys(MODE_CONFIGS) as ToolSelectionStrategy[]).map(
            (mode) => (
              <ModeItemContent
                key={mode}
                mode={mode}
                isSelected={mode === selectedMode}
                onSelect={() => handleModeChange(mode)}
              />
            ),
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
