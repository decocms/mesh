/**
 * Page Composer Component
 *
 * Three-panel visual editor layout:
 * - Left: sortable section list sidebar with DnD reordering
 * - Center: iframe preview with viewport toggle
 * - Right: prop editor for selected block
 *
 * Fetches page data, manages selected block state, wires postMessage
 * communication for live preview updates, and debounce-saves to git.
 */

import { useRef, useState, useSyncExternalStore } from "react";
import { useIframeBridge } from "../lib/use-iframe-bridge";
import { nanoid } from "nanoid";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ArrowLeft,
  Save01,
  Loading01,
  AlertCircle,
  ReverseLeft,
  ReverseRight,
  Clock,
  Globe02,
  Plus,
  XCircle,
} from "@untitledui/icons";
import { toast } from "sonner";
import { queryKeys } from "../lib/query-keys";
import { markDirty, markClean, registerFlush } from "../lib/dirty-state";
import { siteEditorRouter } from "../lib/router";
import {
  getPage,
  updatePage,
  listPages,
  createPageVariant,
  isLoaderRef,
  type BlockInstance,
  type LoaderRef,
} from "../lib/page-api";
import { getBlock } from "../lib/block-api";
import { useUndoRedo } from "../lib/use-undo-redo";
import { usePendingChanges } from "../lib/use-pending-changes";
import { discardPageChanges } from "../lib/pending-changes-api";
import { PreviewPanel } from "./preview-panel";
import { ViewportToggle, type ViewportKey } from "./viewport-toggle";
import { PropEditor } from "./prop-editor";
import { SectionListSidebar } from "./section-list-sidebar";
import { BlockPicker } from "./block-picker";
import { LoaderPicker } from "./loader-picker";
import PageHistory from "./page-history";

export default function PageComposer() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const queryClient = useQueryClient();
  const navigate = siteEditorRouter.useNavigate();
  const { pageId } = siteEditorRouter.useParams({
    from: "/site-editor-layout/pages/$pageId",
  });

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportKey>("desktop");
  const [mode, setMode] = useState<"edit" | "interact">("edit");
  const [externalNav, setExternalNav] = useState<string | null>(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [loaderPickerState, setLoaderPickerState] = useState<{
    open: boolean;
    propName: string | null;
  }>({ open: false, propName: null });
  const [showHistory, setShowHistory] = useState(false);
  const [activeLocale, setActiveLocale] = useState<string | null>(null);
  const [newLocaleInput, setNewLocaleInput] = useState("");
  const [showNewLocale, setShowNewLocale] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref holding the current handleSave so registerFlush can call it.
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);

  // Fetch page list to get available variants for this page
  const { data: pageSummaries = [] } = useQuery({
    queryKey: queryKeys.pages.all(connectionId),
    queryFn: () => listPages(toolCaller),
  });
  const currentPageSummary = pageSummaries.find((p) => p.id === pageId);
  const availableVariants = currentPageSummary?.variants ?? [];

  // Fetch page data (optionally for a specific locale variant)
  // placeholderData keeps previous variant visible while new one loads,
  // preventing iframe unmount/remount on locale switch.
  const {
    data: page,
    isLoading,
    error,
    isPlaceholderData: _isPlaceholderData,
  } = useQuery({
    queryKey: queryKeys.pages.detail(connectionId, pageId, activeLocale),
    queryFn: () => getPage(toolCaller, pageId, activeLocale),
    placeholderData: (prev) => prev,
  });

  // Create variant mutation
  const createVariantMutation = useMutation({
    mutationFn: (locale: string) =>
      createPageVariant(toolCaller, pageId, locale),
    onSuccess: (_, locale) => {
      toast.success(`Created ${locale} variant`);
      queryClient.invalidateQueries({
        queryKey: queryKeys.pages.all(connectionId),
      });
      setActiveLocale(locale);
      setShowNewLocale(false);
      setNewLocaleInput("");
    },
    onError: (err) => {
      toast.error(
        `Failed to create variant: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  // Undo/redo state for blocks
  const {
    value: blocks,
    push: pushBlocks,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetBlocks,
    clearFuture,
  } = useUndoRedo<BlockInstance[]>(page?.blocks ?? []);

  // Sync blocks when server data loads or locale changes
  const lastSyncedRef = useRef<string | null>(null);
  const syncKey = page
    ? `${pageId}:${activeLocale ?? "default"}:${page.metadata.updatedAt}`
    : null;
  if (page && syncKey && lastSyncedRef.current !== syncKey) {
    lastSyncedRef.current = syncKey;
    resetBlocks(page.blocks);
  }

  // Build the local page object from query data + undo/redo blocks
  const localPage = page ? { ...page, blocks } : null;

  // Pending changes: per-section diff status from GIT_STATUS + GIT_SHOW
  const { sectionStatuses, isDirty: gitIsDirty } = usePendingChanges(
    toolCaller,
    connectionId,
    pageId,
    blocks,
  );

  // Single bridge for all iframe communication
  const {
    send,
    setIframeRef,
    ready,
    disconnected,
    reconnect,
    hoverRect,
    clearHover,
  } = useIframeBridge({
    page: localPage,
    selectedBlockId,
    mode,
    onBlockClicked: (id: string) =>
      setSelectedBlockId((prev) => (prev === id ? null : id)),
    onClickAway: () => setSelectedBlockId(null),
    onNavigated: (url, isInternal) => {
      if (!isInternal) {
        setExternalNav(url);
      }
    },
  });

  // Mode change handler — updates local state and sends to iframe
  const handleModeChange = (newMode: "edit" | "interact") => {
    setMode(newMode);
    setSelectedBlockId(null);
    send({ type: "deco:set-mode", mode: newMode });
  };

  // Return from external navigation — clear state and reload iframe
  const handleReturnFromExternal = () => {
    setExternalNav(null);
    reconnect();
  };

  // Find selected block
  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  // Fetch block definition (schema) for the selected block
  const { data: blockDef } = useQuery({
    queryKey: queryKeys.blocks.detail(
      connectionId,
      selectedBlock?.blockType ?? "",
    ),
    queryFn: () => getBlock(toolCaller, selectedBlock!.blockType),
    enabled: !!selectedBlock,
  });

  // Keyboard shortcuts for undo/redo and Escape deselect via useSyncExternalStore
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const setSelectedBlockIdRef = useRef(setSelectedBlockId);
  undoRef.current = undo;
  redoRef.current = redo;
  setSelectedBlockIdRef.current = setSelectedBlockId;

  useSyncExternalStore(
    (notify) => {
      const handler = (e: KeyboardEvent) => {
        // Escape: deselect current block
        if (e.key === "Escape") {
          setSelectedBlockIdRef.current(null);
          return;
        }

        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;

        // Redo: Cmd+Shift+Z or Cmd+Y
        if ((e.key === "z" || e.key === "Z") && e.shiftKey && mod) {
          e.preventDefault();
          redoRef.current();
          notify();
          return;
        }
        if ((e.key === "y" || e.key === "Y") && mod && !e.shiftKey) {
          e.preventDefault();
          redoRef.current();
          notify();
          return;
        }
        // Undo: Cmd+Z (no shift)
        if ((e.key === "z" || e.key === "Z") && mod && !e.shiftKey) {
          e.preventDefault();
          undoRef.current();
          notify();
          return;
        }
      };

      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    },
    () => null,
    () => null,
  );

  // Debounced save to git
  const debouncedSave = (updatedBlocks: BlockInstance[]) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    markDirty();
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updatePage(
          toolCaller,
          pageId,
          { blocks: updatedBlocks },
          activeLocale,
        );
        markClean();
        clearFuture();
        queryClient.invalidateQueries({
          queryKey: queryKeys.pages.detail(connectionId, pageId, activeLocale),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.pendingChanges.page(connectionId, pageId),
        });
      } catch (err) {
        markClean();
        toast.error(
          `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }, 2000);
  };

  // Handle prop changes from PropEditor
  const handlePropChange = (newProps: Record<string, unknown>) => {
    if (!selectedBlockId) return;

    const updatedBlocks = blocks.map((block) =>
      block.id === selectedBlockId ? { ...block, props: newProps } : block,
    );

    pushBlocks(updatedBlocks);

    // Immediately send to iframe for live preview
    send({
      type: "deco:update-block",
      blockId: selectedBlockId,
      props: newProps,
    });

    // Debounce save to git
    debouncedSave(updatedBlocks);
  };

  // Handle block deletion
  const handleDeleteBlock = (blockId: string) => {
    const updatedBlocks = blocks.filter((b) => b.id !== blockId);
    pushBlocks(updatedBlocks);
    debouncedSave(updatedBlocks);
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  // Handle block reordering via DnD
  const handleReorder = (activeId: string, overId: string) => {
    const oldIndex = blocks.findIndex((b) => b.id === activeId);
    const newIndex = blocks.findIndex((b) => b.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedBlocks = arrayMove(blocks, oldIndex, newIndex);
    pushBlocks(reorderedBlocks);
    debouncedSave(reorderedBlocks);
  };

  // Handle adding a new block from the picker
  const handleAddBlock = (
    blockType: string,
    defaults: Record<string, unknown>,
  ) => {
    const newBlock: BlockInstance = {
      id: nanoid(8),
      blockType,
      props: defaults,
    };

    const updatedBlocks = [...blocks, newBlock];
    pushBlocks(updatedBlocks);
    debouncedSave(updatedBlocks);

    setSelectedBlockId(newBlock.id);
    setShowBlockPicker(false);
  };

  // Handle binding a loader to a prop on the selected block
  const handleBindLoader = (loaderRef: LoaderRef) => {
    if (!selectedBlockId || !loaderPickerState.propName) return;

    const propName = loaderPickerState.propName;
    const updatedBlocks = blocks.map((block) =>
      block.id === selectedBlockId
        ? { ...block, props: { ...block.props, [propName]: loaderRef } }
        : block,
    );

    pushBlocks(updatedBlocks);
    send({
      type: "deco:update-block",
      blockId: selectedBlockId,
      props: updatedBlocks.find((b) => b.id === selectedBlockId)!.props,
    });
    debouncedSave(updatedBlocks);
    setLoaderPickerState({ open: false, propName: null });
  };

  // Handle removing a loader binding from a prop
  const handleRemoveLoaderBinding = (propName: string) => {
    if (!selectedBlockId) return;

    const updatedBlocks = blocks.map((block) => {
      if (block.id !== selectedBlockId) return block;
      const newProps = { ...block.props };
      delete newProps[propName];
      return { ...block, props: newProps };
    });

    pushBlocks(updatedBlocks);
    send({
      type: "deco:update-block",
      blockId: selectedBlockId,
      props: updatedBlocks.find((b) => b.id === selectedBlockId)!.props,
    });
    debouncedSave(updatedBlocks);
  };

  // Discard all uncommitted changes to the current page via GIT_CHECKOUT
  const handleDiscard = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pageFilePath = `.deco/pages/${pageId}.json`;
    const success = await discardPageChanges(toolCaller, pageFilePath);
    if (success) {
      markClean();
      toast.success("Changes discarded");
      queryClient.invalidateQueries({
        queryKey: queryKeys.pages.detail(connectionId, pageId, activeLocale),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.pendingChanges.page(connectionId, pageId),
      });
    } else {
      toast.error("Failed to discard changes");
    }
  };

  // Restore a deleted section from the committed (HEAD) version
  const handleUndelete = (block: BlockInstance) => {
    const updatedBlocks = [...blocks, block];
    pushBlocks(updatedBlocks);
    debouncedSave(updatedBlocks);
  };

  // Manual save (flush debounce)
  const handleSave = async () => {
    if (!localPage) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await updatePage(
        toolCaller,
        pageId,
        {
          title: localPage.title,
          path: localPage.path,
          blocks: localPage.blocks,
        },
        activeLocale,
      );
      markClean();
      clearFuture();
      toast.success("Page saved");
      queryClient.invalidateQueries({
        queryKey: queryKeys.pages.detail(connectionId, pageId, activeLocale),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.pendingChanges.page(connectionId, pageId),
      });
    } catch (err) {
      markClean();
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  // Keep handleSaveRef current and register flush callback for site switcher.
  handleSaveRef.current = handleSave;
  const flushRegisteredRef = useRef(false);
  if (!flushRegisteredRef.current) {
    flushRegisteredRef.current = true;
    registerFlush(async () => {
      if (handleSaveRef.current) await handleSaveRef.current();
    });
  }

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
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/site-editor-layout/" })}
        >
          <ArrowLeft size={14} className="mr-1" />
          Back to Pages
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: breadcrumb, locale switcher, save button, viewport toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate({ to: "/site-editor-layout/" })}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Pages
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{localPage.title}</span>

          {/* Locale switcher */}
          <div className="flex items-center gap-1 ml-3 bg-muted/50 rounded-full p-0.5">
            <Globe02 size={14} className="text-muted-foreground ml-1.5" />
            <button
              type="button"
              onClick={() => setActiveLocale(null)}
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                activeLocale === null
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Default
            </button>
            {availableVariants.map((v) => (
              <button
                key={v.locale}
                type="button"
                onClick={() => setActiveLocale(v.locale)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                  activeLocale === v.locale
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.locale}
              </button>
            ))}
            {showNewLocale ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newLocaleInput.trim()) {
                    createVariantMutation.mutate(newLocaleInput.trim());
                  }
                }}
              >
                <input
                  type="text"
                  value={newLocaleInput}
                  onChange={(e) => setNewLocaleInput(e.target.value)}
                  placeholder="en-US"
                  className="w-16 px-1.5 py-0.5 rounded text-xs border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                  onBlur={() => {
                    if (!newLocaleInput.trim()) setShowNewLocale(false);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewLocale(true)}
                className="px-1 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Add locale variant"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={!canUndo}
              onClick={undo}
              title="Undo (Cmd+Z)"
            >
              <ReverseLeft size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!canRedo}
              onClick={redo}
              title="Redo (Cmd+Shift+Z)"
            >
              <ReverseRight size={16} />
            </Button>
          </div>
          <ViewportToggle value={viewport} onChange={setViewport} />
          <Button
            variant={showHistory ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setShowHistory((prev) => !prev)}
            title="Version History"
          >
            <Clock size={16} />
          </Button>
          {gitIsDirty && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDiscard}
              title="Discard all uncommitted changes to this page"
            >
              <XCircle size={14} className="mr-1" />
              Discard changes
            </Button>
          )}
          <Button size="sm" onClick={handleSave}>
            <Save01 size={14} className="mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: sortable section list */}
        <div className="w-[260px] border-r border-border overflow-y-auto">
          <SectionListSidebar
            blocks={localPage.blocks}
            selectedBlockId={selectedBlockId}
            onSelect={(id) =>
              setSelectedBlockId((prev) => (prev === id ? null : id))
            }
            onDelete={handleDeleteBlock}
            onReorder={handleReorder}
            onAddClick={() => setShowBlockPicker(true)}
            sectionStatuses={sectionStatuses}
            onUndelete={handleUndelete}
          />
        </div>

        {/* Center panel: preview */}
        <div className="flex-1 overflow-hidden">
          <PreviewPanel
            path={localPage.path}
            viewport={viewport}
            setIframeRef={setIframeRef}
            ready={ready}
            mode={mode}
            onModeChange={handleModeChange}
            externalNav={externalNav}
            onReturnFromExternal={handleReturnFromExternal}
            disconnected={disconnected}
            reconnect={reconnect}
            hoverRect={hoverRect}
            onIframeMouseLeave={clearHover}
          />
        </div>

        {/* Right panel: prop editor or history */}
        <div
          className={cn(
            "w-[320px] border-l border-border overflow-y-auto",
            externalNav && "opacity-50 pointer-events-none",
          )}
        >
          {showHistory ? (
            <PageHistory pageId={pageId} send={send} localPage={localPage} />
          ) : selectedBlock && blockDef?.schema ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">
                  {blockDef.label ??
                    selectedBlock.blockType.replace("sections--", "")}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedBlockId(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  title="Close editor"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <PropEditor
                schema={blockDef.schema as import("@rjsf/utils").RJSFSchema}
                formData={selectedBlock.props}
                onChange={handlePropChange}
              />

              {/* Loader bindings section */}
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Loader Bindings
                </h4>

                {/* Show existing loader bindings */}
                {Object.entries(selectedBlock.props)
                  .filter(([, value]) => isLoaderRef(value))
                  .map(([propName, value]) => {
                    const ref = value as LoaderRef;
                    return (
                      <div
                        key={propName}
                        className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{propName}</span>
                          <span className="text-muted-foreground ml-1">
                            &larr; {ref.__loaderRef}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveLoaderBinding(propName)}
                          className="text-destructive hover:text-destructive/80 shrink-0 ml-2"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}

                {/* Bind loader button for each schema prop */}
                {Object.keys(
                  (blockDef.schema as Record<string, unknown>)?.properties ??
                    {},
                )
                  .filter(
                    (propName) => !isLoaderRef(selectedBlock.props[propName]),
                  )
                  .map((propName) => (
                    <button
                      key={propName}
                      type="button"
                      onClick={() =>
                        setLoaderPickerState({ open: true, propName })
                      }
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>Bind loader to</span>
                      <span className="font-medium">{propName}</span>
                    </button>
                  ))}
              </div>
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

      {/* Block picker modal */}
      <BlockPicker
        open={showBlockPicker}
        onClose={() => setShowBlockPicker(false)}
        onSelect={handleAddBlock}
      />

      {/* Loader picker modal */}
      <LoaderPicker
        open={loaderPickerState.open}
        onOpenChange={(open) =>
          setLoaderPickerState((prev) => ({ ...prev, open }))
        }
        onSelect={handleBindLoader}
        propName={loaderPickerState.propName ?? ""}
      />
    </div>
  );
}
