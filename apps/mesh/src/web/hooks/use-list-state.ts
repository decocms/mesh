import type { Filter } from "@deco/ui/components/filter-bar.tsx";
import { usePersistedFilters } from "@deco/ui/hooks/use-persisted-filters.ts";
import { useViewMode } from "@deco/ui/hooks/use-view-mode.ts";
import type { BaseCollectionEntity } from "@decocms/bindings/collections";
import type { SortPreset } from "@decocms/bindings/collections";
import { useDeferredValue, useState } from "react";

// Custom collection entity type that allows nullable IDs
export type ListStateEntity = Omit<BaseCollectionEntity, "id"> & {
  id: string | null;
};

export interface UseListStateOptions {
  /** Organization/namespace for storage keys */
  namespace: string;
  /** Resource name for storage keys (e.g., "connections", "models") */
  resource: string;
  /** Default sort preset */
  defaultSort?: SortPreset;
  /** Default view mode */
  defaultViewMode?: "table" | "cards";
}

export interface ListState {
  // Search
  search: string;
  searchTerm: string;
  setSearch: (value: string) => void;

  // Filters
  filters: Filter[];
  setFilters: (filters: Filter[]) => void;
  filterBarVisible: boolean;
  setFilterBarVisible: (visible: boolean) => void;
  toggleFilterBar: () => void;

  // View mode
  viewMode: "table" | "cards";
  setViewMode: (mode: "table" | "cards") => void;

  // Sorting
  sort: SortPreset;
  setSort: (sort: SortPreset) => void;
}

/**
 * Hook to consolidate list UI state (search, filters, sorting, view mode)
 * with localStorage persistence for applicable state.
 */
export function useListState(options: UseListStateOptions): ListState {
  const {
    namespace,
    resource,
    defaultSort = "newest",
    defaultViewMode = "table",
  } = options;

  // Search state
  const [search, setSearch] = useState("");
  const searchTerm = useDeferredValue(search);

  // Filters (persisted)
  const filterPersistKey = `${namespace}-${resource}`;
  const [filters, setFilters] = usePersistedFilters(filterPersistKey);

  // Filter bar visibility (persisted)
  const filterBarVisibilityKey = `mesh-${resource}-filter-visible-${namespace}`;
  const [filterBarVisible, setFilterBarVisibleState] = useState(() => {
    const stored = globalThis.localStorage?.getItem(filterBarVisibilityKey);
    return stored === "true";
  });

  const setFilterBarVisible = (visible: boolean) => {
    setFilterBarVisibleState(visible);
    globalThis.localStorage?.setItem(filterBarVisibilityKey, String(visible));
  };

  const toggleFilterBar = () => {
    setFilterBarVisible(!filterBarVisible);
  };

  // View mode (persisted)
  const [viewMode, setViewMode] = useViewMode(
    `mesh-${resource}-${namespace}`,
    defaultViewMode,
  );

  // Sort preset (persisted in localStorage)
  const sortKey = `mesh-${resource}-sort-${namespace}`;
  const [sort, setSortState] = useState<SortPreset>(() => {
    const stored = globalThis.localStorage?.getItem(sortKey);
    if (
      stored === "newest" ||
      stored === "oldest" ||
      stored === "a-z" ||
      stored === "z-a"
    ) {
      return stored;
    }
    return defaultSort;
  });

  const setSort = (newSort: SortPreset) => {
    setSortState(newSort);
    globalThis.localStorage?.setItem(sortKey, newSort);
  };

  return {
    // Search
    search,
    searchTerm,
    setSearch,

    // Filters
    filters,
    setFilters,
    filterBarVisible,
    setFilterBarVisible,
    toggleFilterBar,

    // View mode
    viewMode,
    setViewMode,

    // Sorting
    sort,
    setSort,
  };
}
