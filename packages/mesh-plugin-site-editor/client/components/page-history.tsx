/**
 * Page History Panel
 *
 * Vertical timeline showing version history for a page.
 * Each entry displays timestamp, author, message, and actions (view diff, revert).
 * Revert creates a new version (non-destructive).
 */

import { useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loading01, RefreshCcw01, AlertCircle } from "@untitledui/icons";
import { toast } from "sonner";
import { queryKeys } from "../lib/query-keys";
import {
  getFileHistory,
  revertPage,
  type HistoryEntry,
} from "../lib/history-api";
import PageDiff from "./page-diff";

/**
 * Format a timestamp as a relative time string (e.g., "2 hours ago", "Yesterday").
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
}

export default function PageHistory({ pageId }: PageHistoryProps) {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const queryClient = useQueryClient();

  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [revertingHash, setRevertingHash] = useState<string | null>(null);
  const [confirmingHash, setConfirmingHash] = useState<string | null>(null);

  const {
    data: entries,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.history.page(connectionId, pageId),
    queryFn: () =>
      getFileHistory(toolCaller, `.deco/pages/${pageId}.json`, { limit: 50 }),
  });

  const handleRevert = async (entry: HistoryEntry) => {
    setRevertingHash(entry.commitHash);
    try {
      const success = await revertPage(toolCaller, pageId, entry.commitHash);
      if (success) {
        toast.success("Page reverted successfully");
        // Invalidate both page detail and history queries
        queryClient.invalidateQueries({
          queryKey: queryKeys.pages.detail(connectionId, pageId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.history.page(connectionId, pageId),
        });
      } else {
        toast.error("Failed to revert page");
      }
    } catch {
      toast.error("Failed to revert page");
    } finally {
      setRevertingHash(null);
      setConfirmingHash(null);
    }
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

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          No version history available
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium mb-4">Version History</h3>

      {/* Vertical timeline */}
      <div className="relative border-l-2 border-gray-200 ml-2 space-y-0">
        {entries.map((entry) => {
          const isSelected = selectedEntry === entry.commitHash;
          const isConfirming = confirmingHash === entry.commitHash;
          const isReverting = revertingHash === entry.commitHash;

          return (
            <div key={entry.commitHash} className="relative pl-5 pb-4">
              {/* Timeline dot */}
              <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-gray-400 border-2 border-white" />

              {/* Entry content */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatRelativeTime(entry.timestamp)}</span>
                  <span className="text-gray-300">|</span>
                  <span className="truncate max-w-[120px]">{entry.author}</span>
                </div>

                <p className="text-xs leading-relaxed">
                  {entry.message.length > 60
                    ? `${entry.message.slice(0, 60)}...`
                    : entry.message}
                </p>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedEntry(isSelected ? null : entry.commitHash)
                    }
                    className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {isSelected ? "Hide diff" : "View diff"}
                  </button>

                  {isConfirming ? (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground">
                        Are you sure?
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRevert(entry)}
                        disabled={isReverting}
                        className="text-orange-600 hover:text-orange-800 font-medium transition-colors"
                      >
                        {isReverting ? "Reverting..." : "Revert"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingHash(null)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingHash(entry.commitHash)}
                      className="flex items-center gap-0.5 text-xs text-orange-600 hover:text-orange-800 transition-colors"
                    >
                      <RefreshCcw01 size={10} />
                      Revert
                    </button>
                  )}
                </div>

                {/* Inline diff view */}
                {isSelected && (
                  <div className="mt-2">
                    <PageDiff pageId={pageId} commitHash={entry.commitHash} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
