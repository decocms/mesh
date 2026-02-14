/**
 * Pages List Component
 *
 * Displays all CMS pages with create and delete actions.
 * Navigates to page editor on row click.
 * Uses SITE_BINDING tools (READ_FILE, PUT_FILE, LIST_FILES) via page-api helpers.
 */

import { useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deco/ui/components/dialog.tsx";
import {
  File06,
  Plus,
  Trash01,
  Loading01,
  AlertCircle,
} from "@untitledui/icons";
import { toast } from "sonner";
import { queryKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { listPages, createPage, deletePage } from "../lib/page-api";

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function PagesList() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const queryClient = useQueryClient();
  const navigate = siteEditorRouter.useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPath, setNewPath] = useState("/");

  // Fetch pages list
  const {
    data: pages = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.pages.all(connectionId),
    queryFn: () => listPages(toolCaller),
  });

  // Create page mutation
  const createMutation = useMutation({
    mutationFn: (input: { title: string; path: string }) =>
      createPage(toolCaller, input),
    onSuccess: (page) => {
      toast.success(`Created page "${page.title}"`);
      queryClient.invalidateQueries({
        queryKey: queryKeys.pages.all(connectionId),
      });
      setDialogOpen(false);
      setNewTitle("");
      setNewPath("/");
      navigate({
        to: "/pages/$pageId",
        params: { pageId: page.id },
      });
    },
    onError: (err) => {
      toast.error(
        `Failed to create page: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  // Delete page mutation
  const deleteMutation = useMutation({
    mutationFn: (pageId: string) => deletePage(toolCaller, pageId),
    onSuccess: () => {
      toast.success("Page deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.pages.all(connectionId),
      });
    },
    onError: (err) => {
      toast.error(
        `Failed to delete page: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle.trim(), path: newPath.trim() });
  };

  const handleDelete = (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this page?")) {
      deleteMutation.mutate(pageId);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading pages</h3>
        <p className="text-muted-foreground text-center">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <h2 className="text-sm font-medium">Pages</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus size={14} className="mr-1" />
              New Page
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Page</DialogTitle>
              <DialogDescription>
                Add a new page to your site. You can edit its content after
                creation.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="page-title">Title</Label>
                <Input
                  id="page-title"
                  placeholder="Home"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="page-path">Path</Label>
                <Input
                  id="page-path"
                  placeholder="/"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={!newTitle.trim() || createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loading01 size={14} className="mr-1 animate-spin" />
                )}
                Create Page
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-sm font-medium text-muted-foreground">
        <span className="flex-1">Title</span>
        <span className="w-32">Path</span>
        <span className="w-40 text-right">Last Updated</span>
        <span className="w-10" />
      </div>

      {/* Page list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground mb-4"
            />
            <p className="text-sm text-muted-foreground">Loading pages...</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <File06 size={48} className="text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No pages yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first page to get started.
            </p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus size={14} className="mr-1" />
              New Page
            </Button>
          </div>
        ) : (
          pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() =>
                navigate({
                  to: "/pages/$pageId",
                  params: { pageId: page.id },
                })
              }
              className="group flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-muted/50 border-b border-border last:border-b-0 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <File06 size={16} className="text-muted-foreground shrink-0" />
                <span className="truncate font-medium text-sm">
                  {page.title}
                </span>
              </div>
              <span className="text-sm text-muted-foreground w-32 truncate">
                {page.path}
              </span>
              <span className="text-sm text-muted-foreground w-40 text-right">
                {formatDate(page.updatedAt)}
              </span>
              <div className="w-10 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                  onClick={(e) => handleDelete(e, page.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash01 size={14} />
                </Button>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
