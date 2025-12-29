/**
 * SavedLoadersPanel - Manage saved/reusable loaders
 */
import { useState, useMemo } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import {
  loaderRegistry,
  BUILTIN_LOADERS,
  type LoaderConfig,
  type LoaderDefinition,
} from "../lib/loader-registry";
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Package,
  Database,
  ShoppingCart,
  FileText,
  Navigation,
  Search,
  RefreshCw,
  Copy,
} from "lucide-react";

const LOADER_ICONS: Record<string, React.ReactNode> = {
  "ProductListLoader": <Package className="h-5 w-5" />,
  "ProductDetailLoader": <Package className="h-5 w-5" />,
  "ProductSearchLoader": <Search className="h-5 w-5" />,
  "CartLoader": <ShoppingCart className="h-5 w-5" />,
  "WishlistLoader": <ShoppingCart className="h-5 w-5" />,
  "ContentLoader": <FileText className="h-5 w-5" />,
  "NavigationLoader": <Navigation className="h-5 w-5" />,
};

function getLoaderIcon(loaderType: string): React.ReactNode {
  const typeName = loaderType.split("/").pop()?.replace(".ts", "") ?? "";
  return LOADER_ICONS[typeName] ?? <Database className="h-5 w-5" />;
}

interface SavedLoadersPanelProps {
  onLoaderSelect?: (loader: LoaderConfig) => void;
}

export function SavedLoadersPanel({ onLoaderSelect }: SavedLoadersPanelProps) {
  const [savedLoaders, setSavedLoaders] = useState(() =>
    loaderRegistry.getSavedLoaders()
  );
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New loader form state
  const [newLoaderName, setNewLoaderName] = useState("");
  const [newLoaderType, setNewLoaderType] = useState("");

  // Filter loaders
  const filteredLoaders = useMemo(() => {
    if (!search) return savedLoaders;
    const searchLower = search.toLowerCase();
    return savedLoaders.filter(
      (l) =>
        l.name.toLowerCase().includes(searchLower) ||
        l.id.toLowerCase().includes(searchLower) ||
        l.__resolveType.toLowerCase().includes(searchLower)
    );
  }, [savedLoaders, search]);

  // Group by loader type
  const groupedLoaders = useMemo(() => {
    return filteredLoaders.reduce((acc, loader) => {
      const typeName = loader.__resolveType.split("/").pop()?.replace(".ts", "") ?? "Other";
      if (!acc[typeName]) acc[typeName] = [];
      acc[typeName].push(loader);
      return acc;
    }, {} as Record<string, LoaderConfig[]>);
  }, [filteredLoaders]);

  const handleCreateLoader = () => {
    if (!newLoaderName.trim() || !newLoaderType) return;

    const id = `loaders/${newLoaderName.toLowerCase().replace(/\s+/g, "-")}`;
    
    const newLoader = loaderRegistry.saveLoader({
      id,
      name: newLoaderName,
      __resolveType: newLoaderType,
      props: {},
    });

    setSavedLoaders(loaderRegistry.getSavedLoaders());
    setIsCreating(false);
    setNewLoaderName("");
    setNewLoaderType("");
  };

  const handleDeleteLoader = (id: string) => {
    if (confirm("Are you sure you want to delete this loader?")) {
      loaderRegistry.deleteLoader(id);
      setSavedLoaders(loaderRegistry.getSavedLoaders());
    }
  };

  const handleDuplicateLoader = (loader: LoaderConfig) => {
    const newId = `${loader.id}-copy-${Date.now()}`;
    loaderRegistry.saveLoader({
      id: newId,
      name: `${loader.name} (Copy)`,
      __resolveType: loader.__resolveType,
      props: { ...loader.props },
    });
    setSavedLoaders(loaderRegistry.getSavedLoaders());
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Saved Loaders</h2>
          <p className="text-sm text-muted-foreground">
            Reusable loaders called once per request
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Loader
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search loaders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Create new loader form */}
      {isCreating && (
        <Card className="mb-4 border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create New Loader</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="loader-name">Name</Label>
              <Input
                id="loader-name"
                placeholder="e.g., Featured Products"
                value={newLoaderName}
                onChange={(e) => setNewLoaderName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="loader-type">Loader Type</Label>
              <select
                id="loader-type"
                value={newLoaderType}
                onChange={(e) => setNewLoaderType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Select a loader type...</option>
                {BUILTIN_LOADERS.map((def) => (
                  <option key={def.type} value={def.type}>
                    {def.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleCreateLoader}>
                <Save className="h-4 w-4 mr-1" />
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setNewLoaderName("");
                  setNewLoaderType("");
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loader list */}
      <div className="flex-1 overflow-auto space-y-4">
        {Object.entries(groupedLoaders).map(([typeName, loaders]) => (
          <div key={typeName}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              {getLoaderIcon(loaders[0].__resolveType)}
              {typeName.replace(/Loader$/, "")}
              <span className="text-muted-foreground/50">({loaders.length})</span>
            </h3>
            <div className="space-y-2">
              {loaders.map((loader) => (
                <Card
                  key={loader.id}
                  className="hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => onLoaderSelect?.(loader)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {getLoaderIcon(loader.__resolveType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {loader.name}
                          </span>
                          <RefreshCw className="h-3 w-3 text-primary shrink-0" />
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          #{loader.id}
                        </div>
                        {Object.keys(loader.props).length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {Object.entries(loader.props)
                              .slice(0, 3)
                              .map(([key, val]) => (
                                <span key={key} className="inline-block mr-2">
                                  <span className="text-foreground/70">{key}:</span>{" "}
                                  {String(val).slice(0, 20)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateLoader(loader);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLoader(loader.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {filteredLoaders.length === 0 && !isCreating && (
          <div className="text-center py-12 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">No saved loaders</p>
            <p className="text-sm">Create a loader to reuse across your site</p>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>
            Saved loaders are deduplicated - using the same loader multiple times
            only triggers one API call per page request.
          </span>
        </div>
      </div>
    </div>
  );
}

export default SavedLoadersPanel;

