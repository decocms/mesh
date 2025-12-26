import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@deco/ui/components/button.tsx";
import {
  FilterBar,
  type FilterBarUser,
  type Filter,
} from "@deco/ui/components/filter-bar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Tabs, TabsList, TabsTrigger } from "@deco/ui/components/tabs.tsx";
import {
  SearchMd,
  RefreshCw01,
  FilterLines,
  DotsHorizontal,
  Grid01,
  List,
  Check,
  ArrowUp,
  ArrowDown,
} from "@untitledui/icons";

export interface ResourceHeaderTab {
  id: string;
  label: string;
  onClick?: () => void;
  href?: string;
}

interface ResourceHeaderProps {
  tabs?: ResourceHeaderTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchBlur?: () => void;
  onSearchKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFilterClick?: () => void;
  onRefresh?: () => void;
  ctaButton?: ReactNode;
  viewMode?: "table" | "cards";
  onViewModeChange?: (mode: "table" | "cards") => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc" | null;
  onSort?: (key: string) => void;
  filterBarVisible?: boolean;
  filters?: Filter[];
  onFiltersChange?: (filters: Filter[]) => void;
  availableUsers?: FilterBarUser[];
  hideActions?: boolean;
  renderUserItem?: (user: FilterBarUser) => ReactNode;
  renderUserFilter?: (props: {
    users: FilterBarUser[];
    onSelect: (userId: string) => void;
  }) => ReactNode;
}

export function ResourceHeader({
  tabs,
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  onSearchBlur,
  onSearchKeyDown,
  onFilterClick,
  onRefresh,
  ctaButton,
  viewMode = "table",
  onViewModeChange,
  sortKey,
  sortDirection,
  onSort,
  filterBarVisible = false,
  filters = [],
  onFiltersChange,
  availableUsers = [],
  hideActions = false,
  renderUserItem,
  renderUserFilter,
}: ResourceHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3 w-full py-4">
      <div className="flex items-center justify-between border-b border-border w-full min-w-0">
        {tabs && tabs.length > 0 ? (
          <Tabs
            value={activeTab}
            onValueChange={(tabId) => {
              if (onTabChange) {
                onTabChange(tabId);
              } else {
                const tab = tabs.find((t) => t.id === tabId);
                tab?.onClick?.();
              }
            }}
            variant="underline"
          >
            <TabsList variant="underline" className="border-0 flex-nowrap">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} variant="underline">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <div className="flex-1" />
        )}

        {!hideActions && (
          <div className="flex items-center justify-end gap-2 py-2 shrink-0">
            {onSearchChange && (
              <div className="flex items-center gap-2">
                <SearchMd size={20} className="text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchValue}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  onBlur={onSearchBlur}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search..."
                  className="border-0 shadow-none focus-visible:ring-0 px-0 h-9 w-32 md:w-auto"
                />
              </div>
            )}

            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                className="h-9 w-9 flex items-center text-muted-foreground justify-center"
              >
                <RefreshCw01 size={20} />
              </Button>
            )}

            {onFilterClick && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onFilterClick}
                className="h-9 w-9 flex items-center justify-center"
              >
                <FilterLines
                  size={20}
                  className={
                    filters && filters.length > 0
                      ? "text-violet-500"
                      : "text-muted-foreground"
                  }
                />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 flex items-center text-muted-foreground justify-center"
                >
                  <DotsHorizontal size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1">
                <div className="flex items-center p-1">
                  <div className="flex gap-1 w-full">
                    <Button
                      variant={viewMode === "cards" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => onViewModeChange?.("cards")}
                      className="flex-1 h-10 "
                    >
                      <Grid01 size={20} className="text-muted-foreground" />
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => onViewModeChange?.("table")}
                      className="flex-1 h-10"
                    >
                      <List size={20} className="text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <DropdownMenuSeparator className="my-1" />

                <div className="p-2">
                  <p className="text-xs text-muted-foreground uppercase font-mono">
                    Sort by
                  </p>
                </div>

                <DropdownMenuItem
                  onClick={() => onSort?.("title")}
                  className="cursor-pointer"
                >
                  {sortKey === "title" && (
                    <Check size={16} className="mr-2 text-foreground" />
                  )}
                  {sortKey !== "title" && <span className="w-4 mr-2" />}
                  <span className="flex-1">Name</span>
                  {sortKey === "title" &&
                    sortDirection &&
                    (sortDirection === "asc" ? (
                      <ArrowUp
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ) : (
                      <ArrowDown
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ))}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => onSort?.("description")}
                  className="cursor-pointer"
                >
                  {sortKey === "description" && (
                    <Check size={16} className="mr-2 text-foreground" />
                  )}
                  {sortKey !== "description" && <span className="w-4 mr-2" />}
                  <span className="flex-1">Description</span>
                  {sortKey === "description" &&
                    sortDirection &&
                    (sortDirection === "asc" ? (
                      <ArrowUp
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ) : (
                      <ArrowDown
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ))}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => onSort?.("updated_at")}
                  className="cursor-pointer"
                >
                  {sortKey === "updated_at" && (
                    <Check size={16} className="mr-2 text-foreground" />
                  )}
                  {sortKey !== "updated_at" && <span className="w-4 mr-2" />}
                  <span className="flex-1">Date updated</span>
                  {sortKey === "updated_at" &&
                    sortDirection &&
                    (sortDirection === "asc" ? (
                      <ArrowUp
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ) : (
                      <ArrowDown
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ))}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => onSort?.("updated_by")}
                  className="cursor-pointer"
                >
                  {sortKey === "updated_by" && (
                    <Check size={16} className="mr-2 text-foreground" />
                  )}
                  {sortKey !== "updated_by" && <span className="w-4 mr-2" />}
                  <span className="flex-1">Updated by</span>
                  {sortKey === "updated_by" &&
                    sortDirection &&
                    (sortDirection === "asc" ? (
                      <ArrowUp
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ) : (
                      <ArrowDown
                        size={16}
                        className="ml-2 text-muted-foreground"
                      />
                    ))}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {ctaButton && <div className="hidden md:block">{ctaButton}</div>}
          </div>
        )}
      </div>

      {ctaButton && <div className="md:hidden w-full">{ctaButton}</div>}

      {filterBarVisible && onFiltersChange && (
        <FilterBar
          filters={filters}
          onFiltersChange={onFiltersChange}
          availableUsers={availableUsers}
          renderUserItem={renderUserItem}
          renderUserFilter={renderUserFilter}
        />
      )}
    </div>
  );
}
