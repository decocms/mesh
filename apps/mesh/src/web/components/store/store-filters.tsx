import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { ChevronDown, XClose, FilterLines } from "@untitledui/icons";
import { useState } from "react";
import type { FilterItem } from "./store-discovery";

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
}: {
  label: string;
  items: FilterItem[];
  selectedItems: string[];
  onToggle: (value: string) => void;
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
          className="h-8 gap-1.5 text-xs font-normal"
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
        <div className="p-2 border-b border-border">
          <input
            type="text"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-muted rounded border-0 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Items list */}
        <div className="max-h-64 overflow-y-auto p-1">
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
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-sm rounded cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className="truncate">{item.value}</span>
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
              onClick={() => {
                selectedItems.forEach((item) => onToggle(item));
              }}
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

  return (
    <div className="px-5 py-3 border-b border-border">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter icon */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <FilterLines size={16} />
          <span className="text-sm font-medium">Filters</span>
        </div>

        {/* Category dropdown */}
        {availableCategories && availableCategories.length > 0 && (
          <FilterDropdown
            label="Categories"
            items={availableCategories}
            selectedItems={selectedCategories}
            onToggle={toggleCategory}
          />
        )}

        {/* Tags dropdown */}
        {availableTags && availableTags.length > 0 && (
          <FilterDropdown
            label="Tags"
            items={availableTags}
            selectedItems={selectedTags}
            onToggle={toggleTag}
          />
        )}

        {/* Divider */}
        {topCategories.length > 0 && (
          <div className="h-5 w-px bg-border mx-1" />
        )}

        {/* Quick category chips */}
        {topCategories.map((category) => {
          const isSelected = selectedCategories.includes(category.value);
          return (
            <button
              key={category.value}
              onClick={() => toggleCategory(category.value)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {category.value}
            </button>
          );
        })}

        {/* Active filters summary & clear */}
        {hasActiveFilters && (
          <>
            <div className="h-5 w-px bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
            >
              <XClose size={14} />
              Clear all
            </Button>
          </>
        )}
      </div>

      {/* Selected filters chips */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-muted-foreground">Active:</span>
          {selectedCategories.map((cat) => (
            <span
              key={`cat-${cat}`}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
            >
              {cat}
              <button
                onClick={() => toggleCategory(cat)}
                className="hover:bg-primary/20 rounded-full p-0.5 cursor-pointer"
              >
                <XClose size={12} />
              </button>
            </span>
          ))}
          {selectedTags.map((tag) => (
            <span
              key={`tag-${tag}`}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
            >
              {tag}
              <button
                onClick={() => toggleTag(tag)}
                className="hover:bg-secondary/80 rounded-full p-0.5 cursor-pointer"
              >
                <XClose size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
