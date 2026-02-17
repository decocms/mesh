/**
 * Loader Picker Component
 *
 * Modal dialog for selecting a loader to bind to a section prop.
 * Lists available loaders grouped by category with a search filter.
 * Uses @deco/ui Dialog and fetches loaders via loader-api helpers.
 */

import { useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Database, Search } from "lucide-react";
import { Loading01 } from "@untitledui/icons";
import { loaderKeys } from "../lib/query-keys";
import { listLoaders } from "../lib/loader-api";
import type { LoaderSummary } from "../lib/loader-api";
import type { LoaderRef } from "../lib/page-api";

interface LoaderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (loaderRef: LoaderRef) => void;
  propName: string;
}

/**
 * Group loaders by category, sorted alphabetically within each group.
 */
function groupByCategory(
  loaders: LoaderSummary[],
): Record<string, LoaderSummary[]> {
  const groups: Record<string, LoaderSummary[]> = {};
  for (const loader of loaders) {
    const category = loader.category || "Other";
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(loader);
  }
  for (const category of Object.keys(groups)) {
    groups[category].sort((a, b) => a.label.localeCompare(b.label));
  }
  return groups;
}

export function LoaderPicker({
  open,
  onOpenChange,
  onSelect,
  propName,
}: LoaderPickerProps) {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const [filter, setFilter] = useState("");

  const { data: loaders = [], isLoading } = useQuery({
    queryKey: loaderKeys.all(connectionId),
    queryFn: () => listLoaders(toolCaller),
    enabled: open,
  });

  // Filter loaders by search term
  const filtered = filter
    ? loaders.filter(
        (l) =>
          l.label.toLowerCase().includes(filter.toLowerCase()) ||
          l.source.toLowerCase().includes(filter.toLowerCase()) ||
          l.category.toLowerCase().includes(filter.toLowerCase()),
      )
    : loaders;

  const grouped = groupByCategory(filtered);
  const categoryNames = Object.keys(grouped).sort();

  const handleSelect = (loader: LoaderSummary) => {
    const loaderRef: LoaderRef = {
      __loaderRef: loader.id,
      params: {},
    };
    onSelect(loaderRef);
    onOpenChange(false);
    setFilter("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setFilter("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bind Loader to {propName}</DialogTitle>
        </DialogHeader>

        {/* Search filter */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search loaders..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Loader list */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loading01
                size={24}
                className="animate-spin text-muted-foreground mb-2"
              />
              <p className="text-sm text-muted-foreground">
                Loading loaders...
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Search size={32} className="text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {filter
                  ? "No loaders match your search"
                  : "No loaders available"}
              </p>
            </div>
          ) : (
            categoryNames.map((category) => (
              <div key={category} className="mb-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider py-1.5">
                  {category}
                </div>
                {grouped[category].map((loader) => (
                  <button
                    key={loader.id}
                    type="button"
                    onClick={() => handleSelect(loader)}
                    className={cn(
                      "flex items-center gap-3 w-full text-left px-3 py-2 rounded transition-colors",
                      "hover:bg-muted/50",
                    )}
                  >
                    <Database
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {loader.label}
                      </span>
                      <span className="text-xs text-muted-foreground block truncate">
                        {loader.source}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {loader.inputParamsCount} params
                    </Badge>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
