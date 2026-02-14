/**
 * Page Composer Component
 *
 * Three-panel visual editor layout:
 * - Left: section list sidebar (placeholder for Plan 03-02)
 * - Center: iframe preview with viewport toggle
 * - Right: prop editor for selected block
 *
 * Fetches page data, manages selected block state, and wires postMessage
 * communication for live preview updates.
 */

import { useRef, useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft, Save01, Loading01, AlertCircle } from "@untitledui/icons";
import { toast } from "sonner";
import { queryKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { getPage, updatePage, type Page } from "../lib/page-api";
import { getBlock } from "../lib/block-api";
import { useEditorMessages } from "../lib/use-editor-messages";
import { PreviewPanel } from "./preview-panel";
import { ViewportToggle, type ViewportKey } from "./viewport-toggle";
import { PropEditor } from "./prop-editor";

export default function PageComposer() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const navigate = siteEditorRouter.useNavigate();
  const { pageId } = siteEditorRouter.useParams({ from: "/pages/$pageId" });

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportKey>("desktop");
  const [localPage, setLocalPage] = useState<Page | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { send } = useEditorMessages(iframeRef);

  // Fetch page data
  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.pages.detail(connectionId, pageId),
    queryFn: () => getPage(toolCaller, pageId),
  });

  // Sync local page copy when server data loads
  const lastSyncedRef = useRef<string | null>(null);
  if (page && lastSyncedRef.current !== page.metadata.updatedAt) {
    lastSyncedRef.current = page.metadata.updatedAt;
    setLocalPage(page);
  }

  // Find selected block
  const selectedBlock = localPage?.blocks.find((b) => b.id === selectedBlockId);

  // Fetch block definition (schema) for the selected block
  const { data: blockDef } = useQuery({
    queryKey: queryKeys.blocks.detail(
      connectionId,
      selectedBlock?.blockType ?? "",
    ),
    queryFn: () => getBlock(toolCaller, selectedBlock!.blockType),
    enabled: !!selectedBlock,
  });

  // Debounced save to git
  const debouncedSave = (updatedPage: Page) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updatePage(toolCaller, pageId, {
          blocks: updatedPage.blocks,
        });
      } catch (err) {
        toast.error(
          `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }, 2000);
  };

  // Handle prop changes from PropEditor
  const handlePropChange = (newProps: Record<string, unknown>) => {
    if (!localPage || !selectedBlockId) return;

    const updatedBlocks = localPage.blocks.map((block) =>
      block.id === selectedBlockId ? { ...block, props: newProps } : block,
    );

    const updatedPage: Page = {
      ...localPage,
      blocks: updatedBlocks,
    };

    setLocalPage(updatedPage);

    // Immediately send to iframe for live preview
    send({
      type: "deco:update-block",
      blockId: selectedBlockId,
      props: newProps,
    });

    // Debounce save to git
    debouncedSave(updatedPage);
  };

  // Manual save
  const handleSave = async () => {
    if (!localPage) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await updatePage(toolCaller, pageId, {
        title: localPage.title,
        path: localPage.path,
        blocks: localPage.blocks,
      });
      toast.success("Page saved");
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
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

  if (!localPage) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Page not found</h3>
        <p className="text-muted-foreground text-center mb-4">
          The page &quot;{pageId}&quot; could not be found.
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
      {/* Top bar: breadcrumb, save button, viewport toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Pages
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{localPage.title}</span>
        </div>

        <div className="flex items-center gap-3">
          <ViewportToggle value={viewport} onChange={setViewport} />
          <Button size="sm" onClick={handleSave}>
            <Save01 size={14} className="mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: section list (placeholder for Plan 03-02) */}
        <div className="w-[260px] border-r border-border overflow-y-auto p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Sections
          </h3>
          {localPage.blocks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No sections yet. Add sections in Plan 03-02.
            </p>
          ) : (
            <div className="space-y-1">
              {localPage.blocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => setSelectedBlockId(block.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded text-sm transition-colors",
                    selectedBlockId === block.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {block.blockType.replace("sections--", "")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center panel: preview */}
        <div className="flex-1 overflow-hidden">
          <PreviewPanel
            path={localPage.path}
            page={localPage}
            selectedBlockId={selectedBlockId}
            viewport={viewport}
            onBlockClicked={setSelectedBlockId}
          />
        </div>

        {/* Right panel: prop editor */}
        <div className="w-[320px] border-l border-border overflow-y-auto">
          {selectedBlock && blockDef?.schema ? (
            <div className="p-4">
              <h3 className="text-sm font-medium mb-3">
                {blockDef.label ??
                  selectedBlock.blockType.replace("sections--", "")}
              </h3>
              <PropEditor
                schema={blockDef.schema as import("@rjsf/utils").RJSFSchema}
                formData={selectedBlock.props}
                onChange={handlePropChange}
              />
            </div>
          ) : selectedBlockId ? (
            <div className="flex items-center justify-center h-full p-4">
              <p className="text-sm text-muted-foreground">
                Loading block schema...
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full p-4">
              <p className="text-sm text-muted-foreground">
                Select a section to edit
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
