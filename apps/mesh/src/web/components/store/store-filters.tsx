import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import {
  ChevronDown,
  XClose,
  Check,
  SearchMd,
  FilterLines,
} from "@untitledui/icons";
import { useState } from "react";
import type { FilterItem } from "./types";

interface StoreFiltersProps {
  availableTags?: FilterItem[];
  availableCategories?: FilterItem[];
  selectedTags: string[];
  selectedCategories: string[];
  onTagChange: (tags: string[]) => void;
  onCategoryChange: (categories: string[]) => void;
}

/** Sort filters by count (descending) and limit to top N */
function getTopFilters(filters: FilterItem[], limit: number): FilterItem[] {
  return [...filters].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Filter dropdown component */
function FilterDropdown({
  label,
  items,
  selectedItems,
  onToggle,
  onClear,
}: {
  label: string;
  items: FilterItem[];
  selectedItems: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filteredItems = search
    ? items.filter((item) =>
        item.value.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  // Sort by count descending
  const sortedItems = [...filteredItems].sort((a, b) => b.count - a.count);

  const selectedCount = selectedItems.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 gap-1.5 text-xs font-normal flex-1"
        >
          <span>{label}</span>
          {selectedCount > 0 && (
            <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-medium">
              {selectedCount}
            </span>
          )}
          <ChevronDown size={14} className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {/* Search input */}
        <div className="shrink-0 w-full border-b border-border h-10">
          <label className="flex items-center gap-2.5 h-10 px-4 cursor-text">
            <SearchMd size={16} className="text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border-0 shadow-none focus-visible:ring-0 px-0 h-full text-sm placeholder:text-muted-foreground/50 bg-transparent"
            />
          </label>
        </div>

        {/* Items list */}
        <div className="max-h-64 overflow-y-auto p-1 flex flex-col gap-1">
          {sortedItems.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              No results found
            </div>
          ) : (
            sortedItems.map((item) => {
              const isSelected = selectedItems.includes(item.value);
              return (
                <button
                  key={item.value}
                  onClick={() => onToggle(item.value)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded cursor-pointer transition-colors",
                    isSelected
                      ? "bg-accent/50 text-foreground"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <span className="truncate flex items-center gap-2">
                    {isSelected && (
                      <Check
                        size={16}
                        className="text-muted-foreground shrink-0"
                      />
                    )}
                    {item.value}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {item.count}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Clear selection */}
        {selectedCount > 0 && (
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function StoreFilters({
  availableTags,
  availableCategories,
  selectedTags,
  selectedCategories,
  onTagChange,
  onCategoryChange,
}: StoreFiltersProps) {
  const hasFiltersAvailable =
    (availableTags && availableTags.length > 0) ||
    (availableCategories && availableCategories.length > 0);

  const hasActiveFilters =
    selectedTags.length > 0 || selectedCategories.length > 0;

  if (!hasFiltersAvailable) {
    return null;
  }

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagChange([...selectedTags, tag]);
    }
  };

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      onCategoryChange(selectedCategories.filter((c) => c !== category));
    } else {
      onCategoryChange([...selectedCategories, category]);
    }
  };

  const clearAllFilters = () => {
    onTagChange([]);
    onCategoryChange([]);
  };

  // Get top categories for quick access
  const topCategories = availableCategories
    ? getTopFilters(availableCategories, 6)
    : [];

  // Get all selected categories (including those not in topCategories)
  const allSelectedCategories = selectedCategories;
  const allSelectedTags = selectedTags;

  // Get top category values for deduplication
  const topCategoryValues = new Set(topCategories.map((c) => c.value));

  return (
    <div className="flex items-center border-b border-border">
      {/* Filter icon + selectors */}
      <div className="flex items-center gap-3 flex-wrap px-5 py-3 border-r border-border">
        {/* Filter icon */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <FilterLines size={16} />
        </div>

        {/* Category dropdown */}
        {availableCategories && availableCategories.length > 0 && (
          <FilterDropdown
            label="Categories"
            items={availableCategories}
            selectedItems={selectedCategories}
            onToggle={toggleCategory}
            onClear={() => onCategoryChange([])}
          />
        )}

        {/* Tags dropdown */}
        {availableTags && availableTags.length > 0 && (
          <FilterDropdown
            label="Tags"
            items={availableTags}
            selectedItems={selectedTags}
            onToggle={toggleTag}
            onClear={() => onTagChange([])}
          />
        )}
      </div>

      {/* Filters + clear all button */}
      <div className="flex items-center gap-3 flex-wrap px-5 py-3">
        {/* Quick category chips */}
        {topCategories.map((category) => {
          const isSelected = selectedCategories.includes(category.value);
          return (
            <div
              key={category.value}
              onClick={() => toggleCategory(category.value)}
              className={cn(
                "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer",
                isSelected
                  ? "bg-primary text-primary-foreground hover:bg-primary/80"
                  : "bg-muted hover:bg-accent text-muted-foreground",
              )}
            >
              <span>{category.value}</span>
              {isSelected && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCategory(category.value);
                  }}
                  className="hover:bg-primary/20 rounded-full p-0.5 -mr-1 cursor-pointer flex items-center"
                >
                  <XClose size={12} />
                </span>
              )}
            </div>
          );
        })}

        {/* Selected categories not in top categories */}
        {allSelectedCategories
          .filter((cat) => !topCategoryValues.has(cat))
          .map((cat) => (
            <div
              key={`cat-${cat}`}
              onClick={() => toggleCategory(cat)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-accent/50"
            >
              <span>{cat}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCategory(cat);
                }}
                className="hover:bg-primary/20 rounded-full p-0.5 -mr-1 cursor-pointer flex items-center"
              >
                <XClose size={12} />
              </span>
            </div>
          ))}

        {/* Selected tags */}
        {allSelectedTags.map((tag) => (
          <div
            key={`tag-${tag}`}
            onClick={() => toggleTag(tag)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-accent/50"
          >
            <span>{tag}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleTag(tag);
              }}
              className="hover:bg-primary/20 rounded-full p-0.5 -mr-1 cursor-pointer flex items-center"
            >
              <XClose size={12} />
            </span>
          </div>
        ))}

        {/* Clear all button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
          >
            <XClose size={14} />
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
