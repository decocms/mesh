/**
 * FolderView - Shows artifacts inside a specific folder.
 * Supports filtering by type and list/grid view.
 */

import { ChevronLeft, FolderClosed } from "@untitledui/icons";
import { useState } from "react";
import {
  getArtifactsByFolder,
  getFolderById,
  type ArtifactType,
} from "@/web/lib/mock-artifacts";
import { ArtifactCard, ArtifactTypeFilter } from "./artifact-card";

export function FolderView({
  folderId,
  onBack,
}: {
  folderId: string;
  onBack: () => void;
}) {
  const folder = getFolderById(folderId);
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "all">("all");

  if (!folder) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Folder not found
      </div>
    );
  }

  const allArtifacts = getArtifactsByFolder(folderId);
  const artifacts =
    typeFilter === "all"
      ? allArtifacts
      : allArtifacts.filter((a) => a.type === typeFilter);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div
            className="flex items-center justify-center size-7 rounded-md"
            style={{ backgroundColor: `${folder.color}15` }}
          >
            <FolderClosed size={16} style={{ color: folder.color }} />
          </div>
          <h1 className="text-base font-medium text-foreground">
            {folder.title}
          </h1>
          <span className="text-xs text-muted-foreground">
            {allArtifacts.length} {allArtifacts.length === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 px-4 py-2 flex items-center justify-between">
        <ArtifactTypeFilter value={typeFilter} onChange={setTypeFilter} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {artifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {typeFilter === "all"
                ? "This folder is empty"
                : `No ${typeFilter}s in this folder`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                variant="list"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
