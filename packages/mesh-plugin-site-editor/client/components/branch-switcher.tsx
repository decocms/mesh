/**
 * Branch Switcher Component
 *
 * Dropdown for switching between branches and creating new drafts.
 * Uses module-level branch store to share the active branch across the plugin.
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { SITE_BINDING } from "@decocms/bindings/site";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronDown, Loading01 } from "@untitledui/icons";
import { listBranches, createBranch } from "../lib/branch-api";
import { queryKeys } from "../lib/query-keys";
import { useBranch } from "../lib/branch-context";
import { DRAFT_BRANCH_PREFIX } from "../../shared";

export default function BranchSwitcher() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const { currentBranch, setCurrentBranch } = useBranch();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: branchData } = useQuery({
    queryKey: queryKeys.branches.all(connectionId),
    queryFn: () => listBranches(toolCaller),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createBranch(toolCaller, name),
    onSuccess: (result) => {
      if (result?.success) {
        setCurrentBranch(result.branch);
        setIsCreating(false);
        setDraftName("");
        queryClient.invalidateQueries({
          queryKey: queryKeys.branches.all(connectionId),
        });
      }
    },
  });

  const branches = branchData?.branches ?? [{ name: "main", isDefault: true }];
  const isDraft = currentBranch !== "main";

  const handleBlur = (e: React.FocusEvent) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
      setIsCreating(false);
    }
  };

  const handleCreate = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  return (
    <div className="relative" ref={dropdownRef} onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
      >
        <span
          className={cn(
            "size-2 rounded-full",
            isDraft ? "bg-yellow-500" : "bg-green-500",
          )}
        />
        <span className="max-w-32 truncate">{currentBranch}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-56 rounded-md border border-border bg-popover p-1 shadow-md">
          {branches.map((branch) => (
            <button
              key={branch.name}
              type="button"
              onClick={() => {
                setCurrentBranch(branch.name);
                setIsOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors",
                branch.name === currentBranch && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  branch.isDefault ? "bg-green-500" : "bg-yellow-500",
                )}
              />
              <span className="flex-1 text-left truncate">{branch.name}</span>
              {branch.isDefault && (
                <span className="text-muted-foreground text-[10px]">
                  published
                </span>
              )}
            </button>
          ))}

          <div className="border-t border-border mt-1 pt-1">
            {isCreating ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <span className="text-xs text-muted-foreground">
                  {DRAFT_BRANCH_PREFIX}
                </span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setIsCreating(false);
                      setDraftName("");
                    }
                  }}
                  placeholder="draft-name"
                  className="flex-1 min-w-0 px-1 py-0.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !draftName.trim()}
                  className="px-2 py-0.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? (
                    <Loading01 size={12} className="animate-spin" />
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-sm transition-colors"
              >
                + New Draft
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
