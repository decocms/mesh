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
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

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
  return (
    <DropdownMenu>
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
          <ViewModeToggle
            value={viewMode}
            onValueChange={onViewModeChange}
            fullWidth
            options={[
              { value: "table", icon: "table_rows" },
              { value: "cards", icon: "grid_view" },
            ]}
          />
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
