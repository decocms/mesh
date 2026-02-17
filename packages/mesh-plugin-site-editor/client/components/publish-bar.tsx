/**
 * Publish Bar Component
 *
 * Shown when the user is on a draft branch.
 * Provides Publish (merge to main) and Discard (delete branch) actions.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { SITE_BINDING } from "@decocms/bindings/site";
import { cn } from "@deco/ui/lib/utils.ts";
import { Loading01 } from "@untitledui/icons";
import { mergeBranch, deleteBranch } from "../lib/branch-api";
import { queryKeys } from "../lib/query-keys";
import { useBranch } from "../lib/branch-context";

export default function PublishBar() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const { currentBranch, setCurrentBranch } = useBranch();
  const queryClient = useQueryClient();
  const [showSuccess, setShowSuccess] = useState(false);

  const publishMutation = useMutation({
    mutationFn: () => mergeBranch(toolCaller, currentBranch, "main", true),
    onSuccess: (result) => {
      if (result?.success) {
        setShowSuccess(true);
        setCurrentBranch("main");
        queryClient.invalidateQueries({
          queryKey: queryKeys.branches.all(connectionId),
        });
        // Brief success flash
        setTimeout(() => setShowSuccess(false), 2000);
      }
    },
  });

  const discardMutation = useMutation({
    mutationFn: () => deleteBranch(toolCaller, currentBranch),
    onSuccess: () => {
      setCurrentBranch("main");
      queryClient.invalidateQueries({
        queryKey: queryKeys.branches.all(connectionId),
      });
    },
  });

  if (currentBranch === "main") return null;

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 border-b border-green-200 text-green-800 text-xs font-medium">
        Published successfully
      </div>
    );
  }

  const isLoading = publishMutation.isPending || discardMutation.isPending;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200">
      <span className="flex-1 text-xs text-amber-800 font-medium truncate">
        Draft: {currentBranch}
      </span>

      <button
        type="button"
        onClick={() => discardMutation.mutate()}
        disabled={isLoading}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded-md border transition-colors",
          "border-red-300 text-red-700 hover:bg-red-50",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {discardMutation.isPending ? (
          <Loading01 size={12} className="animate-spin" />
        ) : (
          "Discard"
        )}
      </button>

      <button
        type="button"
        onClick={() => publishMutation.mutate()}
        disabled={isLoading}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded-md transition-colors",
          "bg-green-600 text-white hover:bg-green-700",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {publishMutation.isPending ? (
          <Loading01 size={12} className="animate-spin" />
        ) : (
          "Publish"
        )}
      </button>
    </div>
  );
}
