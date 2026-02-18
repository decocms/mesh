/**
 * Page History Panel
 *
 * Vertical timeline showing git commit history for a page.
 * Clicking a commit previews that historical version in the iframe.
 * A "Back to current" button returns to live editing mode.
 */

import { useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loading01 } from "@untitledui/icons";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "../lib/query-keys";
import {
  getGitLog,
  getGitShow,
  revertToCommit,
  type GitLogEntry,
} from "../lib/history-api";
import type { EditorMessage } from "../lib/editor-protocol";
import type { Page } from "../lib/page-api";

/**
 * Format a date string as a relative time string (e.g., "2 hours ago", "Yesterday").
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

interface PageHistoryProps {
  pageId: string;
  send: (msg: EditorMessage) => void;
  localPage: Page | null;
  onRevert: () => void;
}

export default function PageHistory({
  pageId,
  send,
  localPage,
  onRevert,
}: PageHistoryProps) {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const connId = connectionId;

  const [previewingHash, setPreviewingHash] = useState<string | null>(null);
  const [loadingHash, setLoadingHash] = useState<string | null>(null);
  const [confirmingRevertHash, setConfirmingRevertHash] = useState<
    string | null
  >(null);
  const [revertingHash, setRevertingHash] = useState<string | null>(null);

  const {
    data: commits,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.history.page(connectionId, pageId),
    queryFn: () => getGitLog(connId, `.deco/pages/${pageId}.json`, 50),
  });

  const handleRevert = async (entry: GitLogEntry) => {
    if (revertingHash !== null) return;
    const shortHash = entry.hash.slice(0, 7);
    setRevertingHash(entry.hash);
    setConfirmingRevertHash(null);
    try {
      const { success, committedWithGit } = await revertToCommit(
        toolCaller,
        connId,
        pageId,
        entry.hash,
      );
      if (success) {
        if (committedWithGit) {
          toast.success(`Page reverted to ${shortHash}`);
        } else {
          toast.success(
            `Page reverted to ${shortHash} (file saved, no git commit)`,
          );
        }
        onRevert();
      } else {
        toast.error("Failed to revert page");
      }
    } catch {
      toast.error("Failed to revert page");
    } finally {
      setRevertingHash(null);
    }
  };

  const handlePreviewCommit = async (entry: GitLogEntry) => {
    if (loadingHash !== null) return;
    setConfirmingRevertHash(null);
    setLoadingHash(entry.hash);
    try {
      const path = `.deco/pages/${pageId}.json`;
      const content = await getGitShow(connId, path, entry.hash);
      if (!content) {
        toast.error("Could not load historical version");
        return;
      }
      const historicalPage = JSON.parse(content) as Page;
      send({ type: "deco:page-config", page: historicalPage });
      setPreviewingHash(entry.hash);
    } catch {
      toast.error("Could not load historical version");
    } finally {
      setLoadingHash(null);
    }
  };

  const handleBackToCurrent = () => {
    if (localPage) {
      send({ type: "deco:page-config", page: localPage });
    }
    setPreviewingHash(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loading01
          size={24}
          className="animate-spin text-muted-foreground mb-2"
        />
        <p className="text-xs text-muted-foreground">Loading history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <AlertCircle size={24} className="text-destructive mb-2" />
        <p className="text-xs text-muted-foreground">Failed to load history</p>
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          No history yet for this page
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Historical version banner */}
      {previewingHash !== null && (
        <div className="mx-4 mt-4 flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="font-mono text-xs text-amber-800">
            Viewing: {previewingHash.slice(0, 7)}
          </span>
          <button
            type="button"
            onClick={handleBackToCurrent}
            className="text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors"
          >
            Back to current
          </button>
        </div>
      )}

      <div className="p-4">
        <h3 className="text-sm font-medium mb-4">Version History</h3>

        {/* Vertical timeline */}
        <div className="relative border-l-2 border-gray-200 ml-2 space-y-0">
          {commits.map((entry) => {
            const isPreviewing = previewingHash === entry.hash;
            const isLoadingThis = loadingHash === entry.hash;
            const relativeDate = formatRelativeTime(
              new Date(entry.date).getTime(),
            );

            return (
              <div
                key={entry.hash}
                className={`relative pl-5 pb-4 ${isPreviewing ? "border-l-primary" : ""}`}
              >
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[5px] top-1.5 h-2 w-2 rounded-full border-2 border-white ${isPreviewing ? "bg-primary" : "bg-gray-400"}`}
                />

                {/* Entry content */}
                <div
                  className={`space-y-1 rounded px-2 py-1 ${isPreviewing ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{entry.hash.slice(0, 7)}</span>
                    <span className="text-gray-300">|</span>
                    <span>{relativeDate}</span>
                  </div>

                  <p className="text-xs leading-relaxed">
                    {entry.message.length > 72
                      ? `${entry.message.slice(0, 72)}...`
                      : entry.message}
                  </p>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePreviewCommit(entry)}
                      disabled={loadingHash !== null}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isLoadingThis && (
                        <Loading01 size={12} className="animate-spin" />
                      )}
                      Preview
                    </button>

                    {confirmingRevertHash === entry.hash ? (
                      <span className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">
                          Are you sure?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRevert(entry)}
                          disabled={revertingHash !== null}
                          className="text-orange-600 hover:text-orange-800 font-medium transition-colors disabled:opacity-40"
                        >
                          {revertingHash === entry.hash ? (
                            <Loading01
                              size={12}
                              className="animate-spin inline"
                            />
                          ) : (
                            "Revert"
                          )}
                        </button>
                        {!(
                          revertingHash !== null && revertingHash === entry.hash
                        ) && (
                          <button
                            type="button"
                            onClick={() => setConfirmingRevertHash(null)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingRevertHash(entry.hash)}
                        disabled={revertingHash !== null}
                        className="flex items-center gap-0.5 text-xs text-orange-600 hover:text-orange-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={10} />
                        Revert here
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
