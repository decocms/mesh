import { useDeferredValue, useRef, useState } from "react";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { LLMModelSelector } from "@deco/ui/components/llm-model-selector.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deco/ui/components/table.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deco/ui/components/toggle-group.tsx";
import { useViewMode } from "@deco/ui/hooks/use-view-mode.ts";
import { toast } from "sonner";
import {
  DotsVertical,
  Globe01,
  Link01,
  Loading01,
  SearchMd,
} from "@untitledui/icons";
import {
  useCollectionList,
  useConnections,
  useMCPClientOptional,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { PLUGIN_ID } from "../../shared";
import { CsvImportDialog } from "./csv-import-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { ImageUpload } from "./image-upload";
import { RegistryItemCard } from "./registry-item-card";
import { RegistryItemDialog } from "./registry-item-dialog";
import {
  useRegistryConfig,
  useRegistryFilters,
  useRegistryItems,
  useRegistryMutations,
} from "../hooks/use-registry";
import { useImageUpload } from "../hooks/use-image-upload";
import type {
  RegistryCreateInput,
  RegistryItem,
  RegistryUpdateInput,
} from "../lib/types";

function toggleSelection(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((current) => current !== value)
    : [...list, value];
}

function extractTags(item: RegistryItem): string[] {
  return item._meta?.["mcp.mesh"]?.tags ?? [];
}

function extractCategories(item: RegistryItem): string[] {
  return item._meta?.["mcp.mesh"]?.categories ?? [];
}

function extractRemoteUrl(item: RegistryItem): string {
  return item.server?.remotes?.[0]?.url ?? "-";
}

export default function RegistryPage() {
  const { org } = useProjectContext();
  const { uploadImage, isUploading: isUploadingIcon } = useImageUpload();
  const [searchInput, setSearchInput] = useState("");
  const search = useDeferredValue(searchInput);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<RegistryItem | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [iconDraft, setIconDraft] = useState("");
  const [llmConnectionDraft, setLLMConnectionDraft] = useState("");
  const [llmModelDraft, setLLMModelDraft] = useState("");
  const [viewMode, setViewMode] = useViewMode("private-registry-list", "cards");
  const observerRef = useRef<IntersectionObserver | null>(null);

  const itemsQuery = useRegistryItems({
    search,
    tags: selectedTags,
    categories: selectedCategories,
  });
  const filtersQuery = useRegistryFilters();
  const {
    registryName,
    registryIcon,
    registryLLMConnectionId,
    registryLLMModelId,
    saveRegistryConfigMutation,
  } = useRegistryConfig(PLUGIN_ID);
  const allConnections = useConnections();
  const llmConnections = (allConnections ?? []).filter((connection) =>
    (connection.tools ?? []).some((tool) => tool.name === "LLM_DO_GENERATE"),
  );
  const effectiveLLMConnectionId =
    llmConnectionDraft ||
    registryLLMConnectionId ||
    llmConnections[0]?.id ||
    "";
  const llmClient = useMCPClientOptional({
    connectionId: effectiveLLMConnectionId || undefined,
    orgId: org.id,
  });
  const llmModels = useCollectionList<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    description?: string | null;
    logo?: string | null;
    capabilities?: string[];
  }>(effectiveLLMConnectionId || "no-llm-connection", "LLM", llmClient);
  const { createMutation, updateMutation, deleteMutation, bulkCreateMutation } =
    useRegistryMutations();

  const items =
    itemsQuery.data?.pages
      .flatMap((page) => page.items ?? [])
      .filter(Boolean) ?? [];
  const totalCount = itemsQuery.data?.pages[0]?.totalCount ?? items.length;
  const hasActiveFilters =
    selectedTags.length > 0 ||
    selectedCategories.length > 0 ||
    search.length > 0;
  const filters = filtersQuery.data;
  const tags = Array.isArray(filters?.tags) ? filters.tags : [];
  const categories = Array.isArray(filters?.categories)
    ? filters.categories
    : [];

  // Count public items from all loaded pages (unflitered list check via first page totalCount)
  const allItems =
    itemsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const publicCount = allItems.filter((item) => item.is_public).length;
  const publicStoreUrl = `${window.location.origin}/org/${org.slug}/registry/mcp`;

  const setLoadMoreSentinel = (node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node || !itemsQuery.hasNextPage || itemsQuery.isFetchingNextPage) {
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          itemsQuery.hasNextPage &&
          !itemsQuery.isFetchingNextPage
        ) {
          void itemsQuery.fetchNextPage();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observerRef.current.observe(node);
  };

  const openIdentityDialog = () => {
    setNameDraft(registryName);
    setIconDraft(registryIcon);
    setLLMConnectionDraft(registryLLMConnectionId);
    setLLMModelDraft(registryLLMModelId);
    setIdentityOpen(true);
  };

  const handleIconFileUpload = async (file: File) => {
    if (!file) return;

    // Generate path for registry icon
    const extension = file.name.split(".").pop() || "png";
    const iconPath = `registry/${org.id}/identity/icon.${extension}`;

    // Upload to object storage
    const url = await uploadImage(file, iconPath);

    if (url) {
      setIconDraft(url);
    } else {
      toast.error("Failed to upload icon. Please try again.");
    }
  };

  const handleSaveRegistryConfig = async () => {
    const nextName = nameDraft.trim();
    if (!nextName) return;
    const nextModelId = llmModelDraft.trim();
    const nextConnectionId = nextModelId
      ? llmConnectionDraft.trim() || effectiveLLMConnectionId || ""
      : llmConnectionDraft.trim();
    try {
      await saveRegistryConfigMutation.mutateAsync({
        registryName: nextName,
        registryIcon: iconDraft.trim(),
        llmConnectionId: nextConnectionId,
        llmModelId: nextModelId,
      });
      toast.success("Registry settings updated");
      setIdentityOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save registry settings",
      );
    }
  };

  const handleCreateOrEdit = async (
    payload: RegistryCreateInput | { id: string; data: RegistryUpdateInput },
  ) => {
    try {
      if ("data" in payload) {
        await updateMutation.mutateAsync(payload);
        await Promise.all([itemsQuery.refetch(), filtersQuery.refetch()]);
        toast.success("Registry item updated");
      } else {
        await createMutation.mutateAsync(payload);
        await Promise.all([itemsQuery.refetch(), filtersQuery.refetch()]);
        toast.success("Registry item created");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save item",
      );
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await deleteMutation.mutateAsync(deletingItem.id);
      toast.success("Registry item deleted");
      setDeletingItem(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete item",
      );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-4 md:px-6 py-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-accent transition-colors cursor-pointer"
            onClick={openIdentityDialog}
          >
            <div className="size-7 rounded-lg border border-border overflow-hidden bg-muted/20 flex items-center justify-center shrink-0">
              {registryIcon ? (
                <img
                  src={registryIcon}
                  alt={registryName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {registryName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold">{registryName}</h2>
          </button>
          <Badge variant="secondary">{totalCount} items</Badge>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              Import CSV
            </Button>
            <Button onClick={() => setCreateOpen(true)}>Add MCP</Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl">
            <SearchMd className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
            <Input
              className="pl-9"
              placeholder="Search by id, title, description, or server name"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value === "cards" || value === "table") {
                setViewMode(value);
              }
            }}
            variant="outline"
          >
            <ToggleGroupItem value="cards" aria-label="Cards view">
              Cards
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              Table
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.value}
              type="button"
              onClick={() =>
                setSelectedTags((current) =>
                  toggleSelection(current, tag.value),
                )
              }
            >
              <Badge
                variant={
                  selectedTags.includes(tag.value) ? "default" : "secondary"
                }
              >
                {tag.value} ({tag.count})
              </Badge>
            </button>
          ))}

          {categories.map((category) => (
            <button
              key={category.value}
              type="button"
              onClick={() =>
                setSelectedCategories((current) =>
                  toggleSelection(current, category.value),
                )
              }
            >
              <Badge
                variant={
                  selectedCategories.includes(category.value)
                    ? "default"
                    : "secondary"
                }
              >
                {category.value} ({category.count})
              </Badge>
            </button>
          ))}

          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                setSelectedTags([]);
                setSelectedCategories([]);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Public store URL banner */}
      {publicCount > 0 && (
        <div className="border-b border-border bg-green-50/50 dark:bg-green-950/20 px-4 md:px-6 py-2.5 flex items-center gap-3 text-sm">
          <Globe01
            size={16}
            className="shrink-0 text-green-600 dark:text-green-400"
          />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{publicCount}</strong> public{" "}
            {publicCount === 1 ? "item" : "items"} — Store URL:
          </span>
          <code className="flex-1 min-w-0 truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
            {publicStoreUrl}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(publicStoreUrl);
              toast.success("URL copied to clipboard");
            }}
          >
            <Link01 size={12} />
            Copy
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
        {items.length === 0 ? (
          <div className="min-h-[320px] rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-3 p-6 text-center">
            {itemsQuery.isLoading ? (
              <>
                <Loading01 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading items...
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-medium">
                  {hasActiveFilters
                    ? "No items found"
                    : "No MCPs in your registry"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {hasActiveFilters
                    ? "Try removing filters or changing your search to find matching MCPs."
                    : "Add your first MCP item to start building your private registry catalog."}
                </p>
                {!hasActiveFilters && (
                  <Button onClick={() => setCreateOpen(true)}>Add MCP</Button>
                )}
              </>
            )}
          </div>
        ) : viewMode === "cards" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <RegistryItemCard
                  key={item.id}
                  item={item}
                  onEdit={setEditingItem}
                  onDelete={setDeletingItem}
                />
              ))}
            </div>
            {itemsQuery.hasNextPage && (
              <div ref={setLoadMoreSentinel} className="h-2" />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[56px]">Icon</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Remote URL</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead className="text-right w-[68px]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="size-8 rounded-md border border-border bg-muted/20 overflow-hidden flex items-center justify-center">
                          {item.server?.icons?.[0]?.src ? (
                            <img
                              src={item.server.icons[0].src}
                              alt={item.title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {item.title.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell className="font-mono">{item.id}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {extractTags(item)
                            .slice(0, 3)
                            .map((tag) => (
                              <Badge
                                key={`${item.id}-tag-${tag}`}
                                variant="outline"
                              >
                                {tag}
                              </Badge>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {extractCategories(item)
                            .slice(0, 3)
                            .map((category) => (
                              <Badge
                                key={`${item.id}-category-${category}`}
                                variant="outline"
                              >
                                {category}
                              </Badge>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell>{extractRemoteUrl(item)}</TableCell>
                      <TableCell>
                        {item.is_public ? (
                          <Badge variant="default" className="gap-1">
                            <Globe01 size={10} />
                            Public
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Private</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <DotsVertical size={18} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditingItem(item)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeletingItem(item)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {itemsQuery.hasNextPage && (
              <div ref={setLoadMoreSentinel} className="h-2" />
            )}
          </div>
        )}

        {itemsQuery.isFetchingNextPage && (
          <div className="py-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loading01 className="size-4 animate-spin" />
            Loading more items...
          </div>
        )}
      </div>

      <RegistryItemDialog
        key={editingItem?.id ?? "create"}
        open={createOpen || Boolean(editingItem)}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditingItem(null);
          }
        }}
        item={editingItem}
        availableTags={tags.map((tag) => tag.value)}
        availableCategories={categories.map((category) => category.value)}
        defaultLLMConnectionId={registryLLMConnectionId}
        defaultLLMModelId={registryLLMModelId}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleCreateOrEdit}
      />

      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        isImporting={bulkCreateMutation.isPending}
        onImport={async (parsedItems) => {
          try {
            const result = await bulkCreateMutation.mutateAsync(parsedItems);
            toast.success(`Imported ${result.created} item(s)`);
            return result;
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Failed to import CSV",
            );
            throw error;
          }
        }}
      />

      <DeleteConfirmDialog
        open={Boolean(deletingItem)}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        title={deletingItem?.title ?? deletingItem?.id ?? ""}
        isDeleting={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      <Dialog open={identityOpen} onOpenChange={setIdentityOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registry identity</DialogTitle>
            <DialogDescription>
              Customize how this registry appears in the Store selector.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="identity-name">Name</Label>
              <Input
                id="identity-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Private Registry"
              />
            </div>

            <ImageUpload
              value={iconDraft}
              onChange={setIconDraft}
              onFileUpload={handleIconFileUpload}
              isUploading={isUploadingIcon}
            />
            <div className="rounded-xl border border-border p-3 grid gap-3">
              <h4 className="text-sm font-medium">Default AI configuration</h4>
              <p className="text-xs text-muted-foreground">
                Define a default LLM for AI suggestions in this private
                registry.
              </p>
              <LLMModelSelector
                connectionId={effectiveLLMConnectionId}
                modelId={llmModelDraft}
                connections={llmConnections.map((connection) => ({
                  id: connection.id,
                  title: connection.title,
                  icon: connection.icon ?? null,
                }))}
                models={llmModels.map((model) => ({
                  id: model.id,
                  title: model.title || model.id,
                  logo: model.logo ?? null,
                  capabilities: model.capabilities ?? [],
                }))}
                onConnectionChange={(value) => {
                  setLLMConnectionDraft(value);
                  setLLMModelDraft("");
                }}
                onModelChange={setLLMModelDraft}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIdentityOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRegistryConfig}
              disabled={
                saveRegistryConfigMutation.isPending || !nameDraft.trim()
              }
            >
              {saveRegistryConfigMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
