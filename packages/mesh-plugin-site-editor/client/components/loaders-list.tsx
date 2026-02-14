/**
 * Loaders List Component
 *
 * Displays all scanned loaders grouped by category.
 * Navigates to loader detail view on click.
 * Uses SITE_BINDING tools (LIST_FILES, READ_FILE) via loader-api helpers.
 */

import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { AlertCircle, Loading01 } from "@untitledui/icons";
import { Database, Search } from "lucide-react";
import { loaderKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { listLoaders } from "../lib/loader-api";
import type { LoaderSummary } from "../lib/loader-api";

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
  // Sort loaders within each category
  for (const category of Object.keys(groups)) {
    groups[category].sort((a, b) => a.label.localeCompare(b.label));
  }
  return groups;
}

export default function LoadersList() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const navigate = siteEditorRouter.useNavigate();

  const {
    data: loaders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: loaderKeys.all(connectionId),
    queryFn: () => listLoaders(toolCaller),
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading loaders</h3>
        <p className="text-muted-foreground text-center">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const grouped = groupByCategory(loaders);
  const categoryNames = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <h2 className="text-sm font-medium">Loaders</h2>
        <Badge variant="secondary" className="text-xs">
          {loaders.length} loaders
        </Badge>
      </div>

      {/* Loader list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground mb-4"
            />
            <p className="text-sm text-muted-foreground">Loading loaders...</p>
          </div>
        ) : loaders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Search size={48} className="text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No loaders found</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Scan your codebase to discover data loaders and generate editable
              parameter forms automatically.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                console.log(
                  "[site-editor] Loader scan trigger placeholder -- wire to CMS_LOADER_SCAN",
                );
              }}
            >
              <Search size={14} className="mr-1" />
              Scan Codebase
            </Button>
          </div>
        ) : (
          categoryNames.map((category) => (
            <div key={category}>
              {/* Category header */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                {category}
              </div>

              {/* Loaders in category */}
              {grouped[category].map((loader) => (
                <button
                  key={loader.id}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/loaders/$loaderId",
                      params: { loaderId: loader.id },
                    })
                  }
                  className="group flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-muted/50 border-b border-border last:border-b-0 transition-colors"
                >
                  <Database
                    size={16}
                    className="text-muted-foreground shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="truncate font-medium text-sm block">
                      {loader.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
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
    </div>
  );
}
