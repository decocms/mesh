import { CollectionDisplayButton } from "./collection-display-button.tsx";
import type { ReactNode } from "react";

interface CollectionHeaderProps {
  title: string;
  viewMode?: "table" | "cards";
  onViewModeChange?: (mode: "table" | "cards") => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc" | null;
  onSort?: (key: string) => void;
  sortOptions?: Array<{ id: string; label: string }>;
  ctaButton?: ReactNode;
}

export function CollectionHeader({
  title,
  viewMode,
  onViewModeChange,
  sortKey,
  sortDirection,
  onSort,
  sortOptions = [],
  ctaButton,
}: CollectionHeaderProps) {
  return (
    <div className="shrink-0 w-full border-b border-border h-12">
      <div className="flex items-center justify-between gap-3 h-12 px-4">
        <h1 className="text-sm font-medium text-foreground">{title}</h1>
        <div className="flex items-center gap-2">
          {viewMode && onViewModeChange && (
            <CollectionDisplayButton
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              sortOptions={sortOptions}
            />
          )}
          {ctaButton}
        </div>
      </div>
    </div>
  );
}
