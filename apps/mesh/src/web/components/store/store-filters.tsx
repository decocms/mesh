import { Button } from "@deco/ui/components/button.tsx";
import { XClose } from "@untitledui/icons";
import type { FilterItem } from "./store-discovery";

interface StoreFiltersProps {
  availableTags?: FilterItem[];
  availableCategories?: FilterItem[];
  selectedTags: string[];
  selectedCategories: string[];
  onTagChange: (tags: string[]) => void;
  onCategoryChange: (categories: string[]) => void;
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

  return (
    <div className="px-5 py-3 border-b border-border space-y-3">
      {/* Categories */}
      {availableCategories && availableCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium mr-1">
            Categories:
          </span>
          {availableCategories.map((category) => {
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
                {category.count > 0 && (
                  <span className="ml-1 opacity-70">({category.count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tags */}
      {availableTags && availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium mr-1">
            Tags:
          </span>
          {availableTags.map((tag) => {
            const isSelected = selectedTags.includes(tag.value);
            return (
              <button
                key={tag.value}
                onClick={() => toggleTag(tag.value)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {tag.value}
                {tag.count > 0 && (
                  <span className="ml-1 opacity-70">({tag.count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Clear filters button */}
      {hasActiveFilters && (
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <XClose size={14} />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

