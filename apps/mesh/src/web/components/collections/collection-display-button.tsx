import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useEffect, useRef, useState } from "react";

interface CollectionDisplayButtonProps {
  viewMode: "table" | "cards";
  onViewModeChange: (mode: "table" | "cards") => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc" | null;
  onSort?: (key: string) => void;
  sortOptions?: Array<{ id: string; label: string }>;
}

export function CollectionDisplayButton({
  viewMode,
  onViewModeChange,
  sortKey,
  sortDirection,
  onSort,
  sortOptions = [],
}: CollectionDisplayButtonProps) {
  const tableRef = useRef<HTMLButtonElement>(null);
  const cardsRef = useRef<HTMLButtonElement>(null);
  const [indicatorPosition, setIndicatorPosition] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const updateIndicator = (ref: React.RefObject<HTMLButtonElement | null>) => {
    if (!ref.current) return;
    const { offsetLeft, offsetWidth } = ref.current;
    setIndicatorPosition({
      left: offsetLeft,
      width: offsetWidth,
      opacity: 1,
    });
  };

  // Initialize indicator position based on current viewMode
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const ref = viewMode === "table" ? tableRef : cardsRef;
    updateIndicator(ref);
  }, [viewMode]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          // Update indicator when dropdown opens to ensure correct position
          setTimeout(() => {
            const ref = viewMode === "table" ? tableRef : cardsRef;
            updateIndicator(ref);
          }, 0);
        }
      }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-7 border border-input"
              >
                <Icon name="tune" size={16} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Search filters</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="w-[200px] p-0 gap-0">
        {/* View Mode Toggle */}
        <div className="p-2 border-b border-border">
          <div className="relative bg-muted rounded-lg p-1">
            <div className="relative flex gap-0">
              <button
                ref={tableRef}
                type="button"
                onClick={() => {
                  onViewModeChange("table");
                }}
                className="relative z-10 flex-1 flex items-center justify-center gap-2 h-12 px-4 rounded-lg"
              >
                <Icon
                  name="table_rows"
                  size={16}
                  className={cn(
                    "transition-colors ease-out duration-200",
                    viewMode === "table"
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                />
              </button>
              <button
                ref={cardsRef}
                type="button"
                onClick={() => {
                  onViewModeChange("cards");
                }}
                className="relative z-10 flex-1 flex items-center justify-center gap-2 h-12 px-4 rounded-lg"
              >
                <Icon
                  name="grid_view"
                  size={16}
                  className={cn(
                    "transition-colors ease-out duration-200",
                    viewMode === "cards"
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                />
              </button>
              {/* Sliding indicator */}
              <div
                className="absolute z-0 h-12 bg-background border border-border rounded-lg transition-all ease-out duration-200"
                style={{
                  left: `${indicatorPosition.left}px`,
                  width: `${indicatorPosition.width}px`,
                  opacity: indicatorPosition.opacity,
                }}
              />
            </div>
          </div>
        </div>

        {/* Sort Options */}
        {sortOptions.length > 0 && onSort && (
          <div className="p-2">
            <div className="px-2 py-1.5 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Sort by
            </div>
            {sortOptions.map((option) => {
              const isSelected = sortKey === option.id;
              return (
                <DropdownMenuItem
                  key={option.id}
                  onClick={() => onSort(option.id)}
                  className={cn(
                    "h-8 px-2 py-0 cursor-pointer",
                    isSelected && "bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2 w-full">
                    {isSelected && (
                      <Icon
                        name="check"
                        size={16}
                        className="text-foreground shrink-0"
                      />
                    )}
                    {!isSelected && <div className="w-4 shrink-0" />}
                    <span className="text-sm text-foreground flex-1">
                      {option.label}
                    </span>
                    {isSelected && sortDirection && (
                      <Icon
                        name={
                          sortDirection === "asc"
                            ? "arrow_upward"
                            : "arrow_downward"
                        }
                        size={16}
                        className="text-foreground shrink-0"
                      />
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
