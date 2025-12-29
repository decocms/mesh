import type { BaseCollectionEntity } from "@decocms/bindings/collections";
import type { ReactNode } from "react";
import type { Filter } from "@deco/ui/components/filter-bar.tsx";
import type { TableColumn } from "@deco/ui/components/collection-table.tsx";
import type { JsonSchema } from "@/web/utils/constants";

export interface CollectionsListProps<T extends BaseCollectionEntity> {
  /**
   * The data to display
   */
  data: T[];

  /**
   * The JSON Schema defining the entity structure.
   * Used for rendering default cards and table columns.
   */
  schema: JsonSchema;

  /**
   * Current view mode
   */
  viewMode: "table" | "cards";

  /**
   * Callback when view mode changes
   */
  onViewModeChange?: (mode: "table" | "cards") => void;

  /**
   * Current search term
   */
  search: string;

  /**
   * Callback when search term changes
   */
  onSearchChange: (value: string) => void;

  /**
   * Current sort key
   */
  sortKey?: string;

  /**
   * Current sort direction
   */
  sortDirection?: "asc" | "desc" | null;

  /**
   * Callback when sort changes
   */
  onSort?: (key: string) => void;

  /**
   * Active filters
   */
  filters?: Filter[];

  /**
   * Callback when filters change
   */
  onFiltersChange?: (filters: Filter[]) => void;

  /**
   * Object mapping action names to their handlers.
   * Only available actions should be included in this object.
   * UI components will automatically filter actions based on what's provided.
   */
  actions?: Record<string, (item: T) => void | Promise<void>>;

  /**
   * Callback when an item is clicked
   */
  onItemClick?: (item: T) => void;

  /**
   * Extra content to render in the header (e.g. "New" button)
   */
  headerActions?: ReactNode;

  /**
   * Custom empty state component
   */
  emptyState?: ReactNode;

  /**
   * Whether the list is read-only (hides mutation actions)
   */
  readOnly?: boolean;

  /**
   * Custom table columns. If not provided, generated from schema.
   */
  columns?: TableColumn<T>[];

  /**
   * Whether to hide the toolbar (search, view toggle).
   * Useful if the parent component handles these controls.
   */
  hideToolbar?: boolean;

  /**
   * List of field names that should be sortable.
   * If not provided, most fields will be sortable by default.
   * Set to empty array to disable sorting.
   */
  sortableFields?: string[];

  /**
   * Default number of items per page
   * @default 12
   */
  defaultItemsPerPage?: number;

  /**
   * Options for items per page selector
   * @default [12, 24, 48, 96]
   */
  itemsPerPageOptions?: number[];

  /**
   * If true, shows only a simple trash icon for delete action
   * instead of the dropdown menu. Useful for FILES collection.
   */
  simpleDeleteOnly?: boolean;
}
