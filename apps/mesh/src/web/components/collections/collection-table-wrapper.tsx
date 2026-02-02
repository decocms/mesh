import { CollectionTable, type TableColumn } from "./collection-table.tsx";
import type { ReactNode } from "react";

interface CollectionTableWrapperProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  sortKey?: string;
  sortDirection?: "asc" | "desc" | null;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}

export function CollectionTableWrapper<T>({
  columns,
  data,
  isLoading = false,
  sortKey,
  sortDirection,
  onSort,
  onRowClick,
  emptyState,
}: CollectionTableWrapperProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        {emptyState || (
          <div className="text-center py-12 text-muted-foreground">
            No items found
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <CollectionTable
        columns={columns}
        data={data}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={onSort}
        onRowClick={onRowClick}
      />
    </div>
  );
}
