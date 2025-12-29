/**
 * SavedLoaderSelect - Widget for selecting from saved/reusable loaders
 * 
 * This widget shows a list of saved loader instances that can be reused.
 * When you use the same loader in multiple places, it's only called once.
 */
import { useState, useMemo } from "react";
import type { WidgetProps, RJSFSchema, StrictRJSFSchema } from "@rjsf/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { loaderRegistry, type LoaderConfig } from "../../lib/loader-registry";
import {
  Search,
  Package,
  Database,
  ShoppingCart,
  FileText,
  Navigation,
  Plus,
  Check,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface SavedLoaderSelectProps<T = any, S extends StrictRJSFSchema = RJSFSchema>
  extends WidgetProps<T, S> {}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  product: <Package className="h-4 w-4" />,
  commerce: <ShoppingCart className="h-4 w-4" />,
  content: <FileText className="h-4 w-4" />,
  custom: <Database className="h-4 w-4" />,
};

const LOADER_TYPE_ICONS: Record<string, React.ReactNode> = {
  "ProductListLoader": <Package className="h-4 w-4" />,
  "ProductDetailLoader": <Package className="h-4 w-4" />,
  "ProductSearchLoader": <Search className="h-4 w-4" />,
  "CartLoader": <ShoppingCart className="h-4 w-4" />,
  "WishlistLoader": <ShoppingCart className="h-4 w-4" />,
  "ContentLoader": <FileText className="h-4 w-4" />,
  "NavigationLoader": <Navigation className="h-4 w-4" />,
};

function getLoaderIcon(loaderType: string): React.ReactNode {
  const typeName = loaderType.split("/").pop()?.replace(".ts", "") ?? "";
  return LOADER_TYPE_ICONS[typeName] ?? <Database className="h-4 w-4" />;
}

export function SavedLoaderSelect<T = any, S extends StrictRJSFSchema = RJSFSchema>(
  props: SavedLoaderSelectProps<T, S>
) {
  const { value, onChange, id, label, disabled } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Get saved loaders from registry
  const savedLoaders = useMemo(() => loaderRegistry.getSavedLoaders(), []);

  // Group loaders by type
  const groupedLoaders = useMemo(() => {
    const filtered = savedLoaders.filter((loader) => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        loader.name.toLowerCase().includes(searchLower) ||
        loader.__resolveType.toLowerCase().includes(searchLower) ||
        loader.id.toLowerCase().includes(searchLower)
      );
    });

    return filtered.reduce((acc, loader) => {
      const typeName = loader.__resolveType.split("/").pop()?.replace(".ts", "") ?? "Other";
      if (!acc[typeName]) acc[typeName] = [];
      acc[typeName].push(loader);
      return acc;
    }, {} as Record<string, LoaderConfig[]>);
  }, [savedLoaders, search]);

  // Current selection
  const currentValue = typeof value === "string" ? value : undefined;
  const selectedLoader = currentValue
    ? loaderRegistry.getSavedLoader(currentValue)
    : undefined;

  const handleSelect = (loader: LoaderConfig) => {
    // Store as reference: #loaders/xxx
    onChange(`#${loader.id}`);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div className="relative">
      {/* Selected loader display */}
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedLoader ? (
          <span className="flex items-center gap-2 truncate">
            <RefreshCw className="h-4 w-4 text-primary" />
            <span className="truncate">{selectedLoader.name}</span>
            <span className="text-xs text-muted-foreground truncate">
              (reusable)
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select a saved loader...</span>
        )}
        <Package className="h-4 w-4 shrink-0" />
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[300px] max-h-[400px] overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {/* Search */}
          <div className="sticky top-0 bg-popover p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search loaders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8"
                autoFocus
              />
            </div>
          </div>

          {/* Loader list */}
          <div className="p-2">
            {Object.entries(groupedLoaders).map(([typeName, loaders]) => (
              <div key={typeName} className="mb-3 last:mb-0">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                  {typeName.replace(/Loader$/, "")}
                </div>
                <div className="space-y-1">
                  {loaders.map((loader) => {
                    const isSelected = currentValue === `#${loader.id}`;
                    return (
                      <button
                        key={loader.id}
                        type="button"
                        onClick={() => handleSelect(loader)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors ${
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">
                          {getLoaderIcon(loader.__resolveType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {loader.name}
                            </span>
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            #{loader.id}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {Object.keys(groupedLoaders).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No loaders found</p>
              </div>
            )}
          </div>

          {/* Footer with hint */}
          <div className="sticky bottom-0 bg-muted/50 border-t border-border p-2">
            <p className="text-xs text-muted-foreground text-center">
              <RefreshCw className="inline h-3 w-3 mr-1" />
              Saved loaders are called once per page request
            </p>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsOpen(false);
            setSearch("");
          }}
        />
      )}
    </div>
  );
}

export default SavedLoaderSelect;

