/**
 * Site List Component
 *
 * Shows site detection, dev server status, available pages, and preview.
 */

import { useState } from "react";
import { useSiteDetection } from "../hooks/use-site-detection";
import { useDevServer } from "../hooks/use-dev-server";
import { usePages } from "../hooks/use-pages";
import { PreviewFrame } from "./preview-frame";
import {
  CheckCircle,
  XClose,
  AlertCircle,
  File06,
  Play,
  RefreshCw01,
  Copy01,
  Loading02,
  Eye,
  Plus,
  Edit02,
} from "@untitledui/icons";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@deco/ui/lib/utils.ts";

export default function SiteList() {
  const { data: detection, isLoading } = useSiteDetection();
  const {
    isRunning,
    isChecking,
    isStarting,
    startCommand,
    serverUrl,
    refetch: refetchServer,
    startServer,
    canStart,
  } = useDevServer();
  const { pages, isLoading: pagesLoading } = usePages();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const { connectionId } = useParams({ strict: false }) as {
    connectionId?: string;
  };

  // Navigation to Tasks with context
  const navigateToTasks = (params: {
    skill?: string;
    template?: string;
    edit?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.skill) searchParams.set("skill", params.skill);
    if (params.template) searchParams.set("template", params.template);
    if (params.edit) searchParams.set("edit", params.edit);
    if (connectionId) searchParams.set("site", connectionId);

    const search = searchParams.toString();
    navigate({
      to: "/tasks/$connectionId",
      params: { connectionId: connectionId || "" },
      search: search ? `?${search}` : undefined,
    });
  };

  const handleCreatePage = () => {
    navigateToTasks({ skill: "decocms-landing-pages" });
  };

  const handleUseAsTemplate = (pagePath: string) => {
    navigateToTasks({ skill: "decocms-landing-pages", template: pagePath });
  };

  const handleEditPage = (pagePath: string) => {
    navigateToTasks({ edit: pagePath });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">
          Detecting site configuration...
        </div>
      </div>
    );
  }

  if (!detection) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">
          Unable to detect site configuration
        </div>
      </div>
    );
  }

  const handlePreview = (pagePath?: string) => {
    const url = pagePath ? `${serverUrl}${pagePath}` : serverUrl;
    setPreviewUrl(url);
  };

  const handleClosePreview = () => {
    setPreviewUrl(null);
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(startCommand);
      toast.success("Command copied to clipboard");
    } catch {
      toast.error("Failed to copy command");
    }
  };

  const handleStartServer = async () => {
    if (!startServer) return;
    try {
      const result = await startServer();
      if (result?.success) {
        toast.success("Dev server starting...");
      } else {
        toast.error(result?.error || "Failed to start server");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start server",
      );
    }
  };

  // Not a Deco site - show help
  if (!detection.isDeco) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="bg-card rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start gap-3">
            {detection.hasDenoJson ? (
              <AlertCircle size={20} className="text-yellow-600 mt-0.5" />
            ) : (
              <XClose size={20} className="text-red-600 mt-0.5" />
            )}
            <div className="flex-1">
              <h3 className="font-medium">
                {detection.hasDenoJson
                  ? "Deno Project Detected"
                  : "Not a Deco Site"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {detection.hasDenoJson
                  ? "This folder has deno.json but no deco/ imports."
                  : detection.error ||
                    "No deno.json file found in this directory."}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            This plugin is designed for Deco sites. To use it:
          </p>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-2">
            <li>
              Create a new Deco site or clone an existing one with{" "}
              <code className="bg-muted px-1 rounded">deno.json</code>
            </li>
            <li>
              Ensure your <code className="bg-muted px-1 rounded">imports</code>{" "}
              field includes{" "}
              <code className="bg-muted px-1 rounded">deco/</code> packages
            </li>
            <li>Connect this plugin to your site folder</li>
          </ol>
        </div>
      </div>
    );
  }

  // Valid Deco site - with preview and task panel
  return (
    <div className="h-full flex">
      {previewUrl ? (
        <div className="flex-1 p-4">
          <PreviewFrame url={previewUrl} onClose={handleClosePreview} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Site Status */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-600" />
                <div>
                  <h3 className="font-medium">Deco Site Detected</h3>
                  <p className="text-sm text-muted-foreground">
                    {detection.decoImports.length} deco imports found
                  </p>
                </div>
              </div>
              {isRunning && (
                <button
                  type="button"
                  onClick={() => handlePreview()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Eye size={16} />
                  Preview Site
                </button>
              )}
            </div>
          </div>

          {/* Dev Server Status */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dev Server</h2>
              <button
                type="button"
                onClick={() => refetchServer()}
                disabled={isChecking}
                className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                title="Refresh status"
              >
                <RefreshCw01
                  size={16}
                  className={cn(isChecking && "animate-spin")}
                />
              </button>
            </div>

            {isRunning ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    Running on localhost:8000
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Server not running
                    </span>
                  </div>
                  {startServer && (
                    <button
                      type="button"
                      onClick={handleStartServer}
                      disabled={!canStart}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isStarting ? (
                        <>
                          <Loading02 size={14} className="animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Play size={14} />
                          Start Server
                        </>
                      )}
                    </button>
                  )}
                </div>
                {!startServer && (
                  <>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">
                        {startCommand}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyCommand}
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Copy command"
                      >
                        <Copy01 size={16} />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Run this command in your terminal to start the dev server
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Pages List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pages</h2>
              <button
                type="button"
                onClick={handleCreatePage}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                Create Page
              </button>
            </div>
            {!isRunning ? (
              <div className="bg-muted/30 rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Play size={16} />
                  <span className="text-sm">
                    Start the dev server to see pages
                  </span>
                </div>
              </div>
            ) : pagesLoading ? (
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="text-sm text-muted-foreground">
                  Loading pages...
                </div>
              </div>
            ) : pages.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="text-sm text-muted-foreground">
                  No pages found in this site.
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border divide-y divide-border">
                {pages.map((page) => (
                  <div
                    key={page.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors group"
                  >
                    <File06 size={16} className="text-muted-foreground" />
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handlePreview(page.path)}
                    >
                      <div className="font-medium truncate">{page.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {page.path}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handlePreview(page.path)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUseAsTemplate(page.path)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        title="Use as Template"
                      >
                        <Copy01 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditPage(page.path)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        title="Edit Page"
                      >
                        <Edit02 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
