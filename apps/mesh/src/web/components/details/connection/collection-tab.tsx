import { generatePrefixedId } from "@/shared/utils/generate-id";
import { createToolCaller } from "@/tools/client";
import { CollectionDisplayButton } from "@/web/components/collections/collection-display-button.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import {
  CollectionsList,
  generateSortOptionsFromSchema,
} from "@/web/components/collections/collections-list.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import type { ValidatedCollection } from "@/web/hooks/use-binding";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import { useConnection } from "@/web/hooks/collections/use-connection";
import {
  useCollectionActions,
  useCollectionList,
} from "@/web/hooks/use-collections";
import { useFileMutations, useFileUpload } from "@/web/hooks/use-file-storage";
import { useListState } from "@/web/hooks/use-list-state";
import { authClient } from "@/web/lib/auth-client";
import { BaseCollectionJsonSchema } from "@/web/utils/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import type { BaseCollectionEntity } from "@decocms/bindings/collections";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Upload01, Loading01 } from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { ViewActions } from "../layout";
import { cn } from "@deco/ui/lib/utils.ts";

interface UploadingFile {
  name: string;
  status: "uploading" | "done" | "error";
}

interface CollectionTabProps {
  connectionId: string;
  org: string;
  activeCollection: ValidatedCollection;
}

export function CollectionTab({
  connectionId,
  org,
  activeCollection,
}: CollectionTabProps) {
  const collectionName = activeCollection.name;
  const schema = activeCollection.schema ?? BaseCollectionJsonSchema;
  const hasCreateTool = activeCollection.hasCreateTool;
  const hasUpdateTool = activeCollection.hasUpdateTool;
  const hasDeleteTool = activeCollection.hasDeleteTool;
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id || "unknown";
  const connection = useConnection(connectionId);

  const toolCaller = createToolCaller(connectionId);
  const actions = useCollectionActions<BaseCollectionEntity>(
    connectionId,
    collectionName,
    toolCaller,
  );

  const {
    search,
    searchTerm,
    setSearch,
    viewMode,
    setViewMode,
    sortKey,
    sortDirection,
    handleSort,
  } = useListState<BaseCollectionEntity>({
    namespace: org,
    resource: `${connectionId}-${collectionName}`,
    defaultSortKey: "updated_at",
  });

  const items = useCollectionList<BaseCollectionEntity>(
    connectionId,
    collectionName,
    toolCaller,
    {
      searchTerm,
      sortKey,
      sortDirection,
    },
  );

  // Collection is read-only if ALL mutation tools are missing
  const isReadOnly = !hasCreateTool && !hasUpdateTool && !hasDeleteTool;

  // Check if this is the FILES collection for special handling
  const isFilesCollection = collectionName.toUpperCase() === "FILES";

  // Create action handlers
  const handleEdit = (item: BaseCollectionEntity) => {
    navigate({
      to: "/$org/mcps/$connectionId/$collectionName/$itemId",
      params: {
        org,
        connectionId,
        collectionName,
        itemId: item.id,
      },
    });
  };

  const handleDuplicate = async (item: BaseCollectionEntity) => {
    const now = new Date().toISOString();
    await actions.create.mutateAsync({
      ...item,
      id: generatePrefixedId("conn"),
      title: `${item.title} (Copy)`,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId,
    });
  };

  const [itemToDelete, setItemToDelete] = useState<BaseCollectionEntity | null>(
    null,
  );

  const handleDelete = (item: BaseCollectionEntity) => {
    setItemToDelete(item);
  };

  // File mutations for FILES collection
  const fileMutations = useFileMutations(connectionId);

  // Build actions object with only available actions
  // For FILES collection, always show delete (uses file deletion)
  const listItemActions: Record<string, (item: BaseCollectionEntity) => void> =
    isFilesCollection
      ? {
          edit: handleEdit,
          delete: handleDelete,
        }
      : {
          ...(hasUpdateTool && { edit: handleEdit }),
          ...(hasCreateTool && { duplicate: handleDuplicate }),
          ...(hasDeleteTool && { delete: handleDelete }),
        };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    if (isFilesCollection) {
      // Use file deletion mutation - item.id is the file path
      await fileMutations.delete.mutateAsync({ path: itemToDelete.id });
    } else {
      await actions.delete.mutateAsync(itemToDelete.id);
    }
    setItemToDelete(null);
  };

  const handleCreate = async () => {
    if (!hasCreateTool) {
      toast.error("Create operation is not available for this collection");
      return;
    }

    const now = new Date().toISOString();
    const newItem: BaseCollectionEntity = {
      id: generatePrefixedId("conn"),
      title: "New Item",
      description: "A brief description of the item",
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId,
    };

    try {
      const createdItem = await actions.create.mutateAsync(newItem);

      // Navigate to the new item's detail page
      navigate({
        to: "/$org/mcps/$connectionId/$collectionName/$itemId",
        params: {
          org,
          connectionId,
          collectionName,
          itemId: createdItem.id,
        },
      });
    } catch (error) {
      // Error toast is handled by the mutation's onError
      console.error("Failed to create item:", error);
    }
  };

  // Generate sort options from schema
  const sortOptions = generateSortOptionsFromSchema(schema);

  const hasItems = (items?.length ?? 0) > 0;
  const showCreateInToolbar = hasCreateTool && hasItems;
  const showCreateInEmptyState = hasCreateTool && !hasItems && !search;

  // File upload mutation for FILES collection
  const uploadMutation = useFileUpload(connectionId);

  // File drop zone state
  const [isDragOver, setIsDragOver] = useState(false);

  // Track uploading files for progress display
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;

    // Add files to uploading state
    const newUploads = files.map((f) => ({
      name: f.name,
      status: "uploading" as const,
    }));
    setUploadingFiles((prev) => [...prev, ...newUploads]);

    for (const file of files) {
      try {
        await uploadMutation.mutateAsync({ file });
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, status: "done" as const } : f,
          ),
        );
        toast.success(`Uploaded ${file.name}`);
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, status: "error" as const } : f,
          ),
        );
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    // Clear completed uploads after a delay
    setTimeout(() => {
      setUploadingFiles((prev) => prev.filter((f) => f.status === "uploading"));
    }, 2000);
  };

  const createButton = hasCreateTool ? (
    <Button
      onClick={handleCreate}
      size="sm"
      disabled={actions.create.isPending}
      className="h-7"
    >
      <Plus className="mr-2 h-4 w-4" />
      {actions.create.isPending ? "Creating..." : "Create"}
    </Button>
  ) : null;

  // Handle file uploads from button click
  const handleFileInputChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const newUploads = fileArray.map((f) => ({
      name: f.name,
      status: "uploading" as const,
    }));
    setUploadingFiles((prev) => [...prev, ...newUploads]);

    for (const file of fileArray) {
      try {
        await uploadMutation.mutateAsync({ file });
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, status: "done" as const } : f,
          ),
        );
        toast.success(`Uploaded ${file.name}`);
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, status: "error" as const } : f,
          ),
        );
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    // Clear completed uploads after a delay
    setTimeout(() => {
      setUploadingFiles((prev) => prev.filter((f) => f.status === "uploading"));
    }, 2000);
  };

  const isUploading = uploadingFiles.some((f) => f.status === "uploading");

  // File upload button for FILES collection
  const uploadButton = isFilesCollection ? (
    <label className="cursor-pointer">
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={isUploading}
        asChild
      >
        <span>
          {isUploading ? (
            <Loading01 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload01 className="mr-2 h-4 w-4" />
          )}
          {isUploading
            ? `Uploading (${uploadingFiles.filter((f) => f.status === "uploading").length})...`
            : "Upload"}
        </span>
      </Button>
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileInputChange(e.target.files);
          e.target.value = ""; // Reset input
        }}
      />
    </label>
  ) : null;

  return (
    <>
      <ViewActions>
        <CollectionDisplayButton
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortKey={sortKey as string}
          sortDirection={sortDirection}
          onSort={handleSort}
          sortOptions={sortOptions}
        />
        <PinToSidebarButton
          connectionId={connectionId}
          title={`${collectionName}s`}
          icon={connection?.icon ?? "grid_view"}
        />
        {uploadButton}
        {showCreateInToolbar && createButton}
      </ViewActions>

      <div
        className="flex flex-col h-full overflow-hidden relative"
        onDragOver={isFilesCollection ? handleDragOver : undefined}
        onDragLeave={isFilesCollection ? handleDragLeave : undefined}
        onDrop={isFilesCollection ? handleFileDrop : undefined}
      >
        {/* Drop zone overlay for FILES collection */}
        {isFilesCollection && isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Upload01 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Drop files to upload</h3>
                <p className="text-sm text-muted-foreground">
                  Files will be stored in local storage
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <CollectionSearch
          value={search}
          onChange={setSearch}
          placeholder={`Search ${collectionName}...`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearch("");
              (event.target as HTMLInputElement).blur();
            }
          }}
        />

        {/* Collections List with schema-based rendering */}
        <div className="flex-1 overflow-auto">
          <CollectionsList
            hideToolbar
            data={items ?? []}
            schema={schema}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            search={search}
            onSearchChange={setSearch}
            sortKey={sortKey as string}
            sortDirection={sortDirection}
            onSort={handleSort}
            actions={listItemActions}
            onItemClick={(item) => handleEdit(item)}
            readOnly={isReadOnly}
            simpleDeleteOnly={isFilesCollection}
            emptyState={
              isFilesCollection ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <Upload01 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No files yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag and drop files here or click to upload
                  </p>
                  {uploadButton}
                </div>
              ) : (
                <EmptyState
                  image={null}
                  title={search ? "No items found" : "No items found"}
                  description={
                    search
                      ? "Try adjusting your search terms"
                      : "This collection doesn't have any items yet."
                  }
                  actions={showCreateInEmptyState ? createButton : undefined}
                />
              )
            }
          />
        </div>

        {/* Upload progress indicator */}
        {uploadingFiles.length > 0 && (
          <div className="shrink-0 border-t border-border bg-muted/50 px-4 py-2">
            <div className="flex items-center gap-3">
              <Loading01 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  Uploading{" "}
                  {
                    uploadingFiles.filter((f) => f.status === "uploading")
                      .length
                  }{" "}
                  file(s)
                </div>
                <div className="flex items-center gap-2 overflow-x-auto text-xs text-muted-foreground">
                  {uploadingFiles.map((f) => (
                    <span
                      key={f.name}
                      className={cn(
                        "inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full",
                        f.status === "uploading" &&
                          "bg-primary/10 text-primary",
                        f.status === "done" && "bg-green-100 text-green-700",
                        f.status === "error" && "bg-red-100 text-red-700",
                      )}
                    >
                      {f.status === "uploading" && (
                        <Loading01 className="h-3 w-3 animate-spin" />
                      )}
                      {f.status === "done" && "✓"}
                      {f.status === "error" && "✗"}
                      {f.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!itemToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setItemToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFilesCollection ? "Delete file?" : "Delete item?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.title}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={
                isFilesCollection
                  ? fileMutations.isDeleting
                  : actions.delete.isPending
              }
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={
                isFilesCollection
                  ? fileMutations.isDeleting
                  : actions.delete.isPending
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {(
                isFilesCollection
                  ? fileMutations.isDeleting
                  : actions.delete.isPending
              )
                ? "Deleting..."
                : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
