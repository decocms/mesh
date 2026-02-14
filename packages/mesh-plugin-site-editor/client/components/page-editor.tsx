/**
 * Page Editor Component
 *
 * Form for editing page metadata (title, path).
 * Blocks editing is deferred to Phase 3.
 * Uses SITE_BINDING tools (READ_FILE, PUT_FILE) via page-api helpers.
 */

import { useRef, useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { ArrowLeft, Save01, Loading01, AlertCircle } from "@untitledui/icons";
import { toast } from "sonner";
import { queryKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { getPage, updatePage } from "../lib/page-api";

function formatTimestamp(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function PageEditor() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const queryClient = useQueryClient();
  const navigate = siteEditorRouter.useNavigate();
  const { pageId } = siteEditorRouter.useParams({ from: "/pages/$pageId" });

  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const lastSyncedPageId = useRef<string | null>(null);

  // Fetch page
  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.pages.detail(connectionId, pageId),
    queryFn: () => getPage(toolCaller, pageId),
  });

  // Sync form state when page data loads (replaces useEffect)
  if (page && lastSyncedPageId.current !== page.metadata.updatedAt) {
    lastSyncedPageId.current = page.metadata.updatedAt;
    setTitle(page.title);
    setPath(page.path);
    setIsDirty(false);
  }

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () => updatePage(toolCaller, pageId, { title, path }),
    onSuccess: (updatedPage) => {
      toast.success("Page saved");
      setIsDirty(false);
      queryClient.setQueryData(
        queryKeys.pages.detail(connectionId, pageId),
        updatedPage,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.pages.all(connectionId),
      });
    },
    onError: (err) => {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setIsDirty(true);
  };

  const handlePathChange = (value: string) => {
    setPath(value);
    setIsDirty(true);
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Loading01
          size={32}
          className="animate-spin text-muted-foreground mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading page...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading page</h3>
        <p className="text-muted-foreground text-center">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Page not found</h3>
        <p className="text-muted-foreground text-center mb-4">
          The page "{pageId}" could not be found.
        </p>
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft size={14} className="mr-1" />
          Back to Pages
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with breadcrumb */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Pages
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{page.title}</span>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loading01 size={14} className="mr-1 animate-spin" />
          ) : (
            <Save01 size={14} className="mr-1" />
          )}
          Save
        </Button>
      </div>

      {/* Form content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Title field */}
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isDirty) handleSave();
              }}
            />
          </div>

          {/* Path field */}
          <div className="grid gap-2">
            <Label htmlFor="edit-path">Path</Label>
            <Input
              id="edit-path"
              value={path}
              onChange={(e) => handlePathChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isDirty) handleSave();
              }}
            />
          </div>

          {/* Metadata (read-only) */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Metadata
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">ID</span>
                <p className="font-mono text-xs mt-0.5">{page.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Blocks</span>
                <p className="mt-0.5">{page.blocks.length} blocks</p>
              </div>
              <div>
                <span className="text-muted-foreground">Created</span>
                <p className="mt-0.5">
                  {formatTimestamp(page.metadata.createdAt)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Last Updated</span>
                <p className="mt-0.5">
                  {formatTimestamp(page.metadata.updatedAt)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
