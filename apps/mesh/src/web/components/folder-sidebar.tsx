/**
 * Folder Sidebar Component
 *
 * Displays a list of folders with options to create, edit, and manage items within them.
 * Shows items inside folders when expanded.
 */

import { useState } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
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
import { Input } from "@deco/ui/components/input.tsx";
import {
  FolderPlus,
  Folder,
  DotsVertical,
  Edit03,
  Trash01,
  ChevronRight,
  ChevronDown,
} from "@untitledui/icons";
import {
  useFolders,
  useFolderActions,
  type FolderEntity,
  type FolderType,
} from "../hooks/collections/use-folder";

interface FolderItem {
  id: string;
  title: string;
  folder_id?: string | null | undefined;
  icon?: string | null;
}

interface FolderSidebarProps<T extends FolderItem> {
  /** Type of folders to display - "connections" or "gateways" */
  type: FolderType;
  /** Items that can be organized into folders */
  items: T[];
  /** Currently selected folder ID (null = all items) */
  selectedFolderId: string | null;
  /** Callback when a folder is selected */
  onSelectFolder: (folderId: string | null) => void;
  /** Callback when an item is clicked */
  onItemClick?: (item: T) => void;
  /** Render function for item icon */
  renderItemIcon?: (item: T) => React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function FolderSidebar<T extends FolderItem>({
  type,
  items,
  selectedFolderId,
  onSelectFolder,
  onItemClick,
  renderItemIcon,
  className,
}: FolderSidebarProps<T>) {
  const { data: folders } = useFolders(type);
  const actions = useFolderActions(type);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderEntity | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderEntity | null>(
    null,
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  // Get items for a specific folder
  const getItemsInFolder = (folderId: string) =>
    items.filter(
      (item) => item.folder_id != null && item.folder_id === folderId,
    );

  const handleCreate = async () => {
    if (!newFolderName.trim()) return;
    await actions.create.mutateAsync({ title: newFolderName.trim() });
    setNewFolderName("");
    setIsCreateOpen(false);
  };

  const handleUpdate = async () => {
    if (!editingFolder || !newFolderName.trim()) return;
    await actions.update.mutateAsync({
      id: editingFolder.id,
      data: { title: newFolderName.trim() },
    });
    setEditingFolder(null);
    setNewFolderName("");
  };

  const handleDelete = async () => {
    if (!deletingFolder) return;
    await actions.delete.mutateAsync(deletingFolder.id);
    if (selectedFolderId === deletingFolder.id) {
      onSelectFolder(null);
    }
    setDeletingFolder(null);
  };

  const toggleExpanded = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* All Items */}
      <button
        type="button"
        onClick={() => onSelectFolder(null)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left",
          selectedFolderId === null
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50",
        )}
      >
        <Folder size={16} className="shrink-0" />
        <span className="truncate">All Items</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {items.length}
        </span>
      </button>

      {/* Folders */}
      {folders.map((folder) => {
        const folderItems = getItemsInFolder(folder.id);
        const hasItems = folderItems.length > 0;
        const isExpanded = expandedFolders.has(folder.id);

        return (
          <div key={folder.id}>
            <div className="group">
              <button
                type="button"
                onClick={() => onSelectFolder(folder.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors w-full text-left",
                  selectedFolderId === folder.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                {/* Expand/collapse toggle */}
                <button
                  type="button"
                  onClick={(e) => toggleExpanded(folder.id, e)}
                  className={cn(
                    "shrink-0 p-0.5 -ml-1 rounded hover:bg-accent",
                    !hasItems && "invisible",
                  )}
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-muted-foreground" />
                  ) : (
                    <ChevronRight size={14} className="text-muted-foreground" />
                  )}
                </button>

                <Folder size={16} className="shrink-0" />
                <span className="truncate flex-1">{folder.title}</span>
                <span className="text-xs text-muted-foreground mr-1">
                  {folderItems.length}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DotsVertical size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingFolder(folder);
                        setNewFolderName(folder.title);
                      }}
                    >
                      <Edit03 size={14} />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeletingFolder(folder)}
                    >
                      <Trash01 size={14} />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </button>
            </div>

            {/* Items inside folder (when expanded) */}
            {isExpanded && hasItems && (
              <div className="ml-6 border-l border-border pl-2 mt-1 space-y-0.5">
                {folderItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick?.(item)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent/50 w-full text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {renderItemIcon ? (
                      renderItemIcon(item)
                    ) : (
                      <div className="w-4 h-4 rounded bg-muted shrink-0" />
                    )}
                    <span className="truncate">{item.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Create Folder Button */}
      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition-colors"
      >
        <FolderPlus size={16} />
        <span>New Folder</span>
      </button>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your items.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newFolderName.trim() || actions.create.isPending}
            >
              {actions.create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog
        open={!!editingFolder}
        onOpenChange={(open) => !open && setEditingFolder(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleUpdate();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFolder(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!newFolderName.trim() || actions.update.isPending}
            >
              {actions.update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingFolder}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the folder &quot;{deletingFolder?.title}&quot;.
              Items in the folder will be moved to the root level.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
