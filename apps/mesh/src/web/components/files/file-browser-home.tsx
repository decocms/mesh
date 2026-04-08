/**
 * FileBrowserHome - The main file-centric home page.
 * Shows folders, recent artifacts, and quick actions.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import {
  BarChart12,
  Globe04,
  Plus,
  PresentationChart01,
} from "@untitledui/icons";
import { authClient } from "@/web/lib/auth-client";
import { MOCK_FOLDERS, getRecentArtifacts } from "@/web/lib/mock-artifacts";
import { FolderCard } from "./folder-card";
import { ArtifactCard } from "./artifact-card";
import { useState } from "react";
import { FolderView } from "./folder-view";

function QuickAction({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: typeof PresentationChart01;
  label: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg",
        "border border-border bg-card",
        "text-sm text-foreground font-medium",
        "transition-all hover:border-foreground/20 hover:shadow-sm cursor-pointer",
      )}
    >
      <Icon size={16} style={{ color }} />
      {label}
    </button>
  );
}

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function HomeContent({
  onOpenFolder,
}: {
  onOpenFolder: (folderId: string) => void;
}) {
  const { data: session } = authClient.useSession();
  const userName = session?.user?.name?.split(" ")[0] || "there";
  const recentArtifacts = getRecentArtifacts(6);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-foreground">
            Good {getTimeOfDay()}, {userName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's what you've been working on
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            <QuickAction
              icon={PresentationChart01}
              label="New Slide Deck"
              color="#8B5CF6"
            />
            <QuickAction
              icon={BarChart12}
              label="Run Diagnostic"
              color="#10B981"
            />
            <QuickAction icon={Globe04} label="Edit Site" color="#3B82F6" />
          </div>
        </div>

        {/* Folders */}
        <div className="mb-8">
          <SectionHeader
            title="My Folders"
            action={{ label: "+ New Folder", onClick: () => {} }}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {MOCK_FOLDERS.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onClick={() => onOpenFolder(folder.id)}
              />
            ))}
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl",
                "border-2 border-dashed border-border",
                "transition-colors hover:border-foreground/20 cursor-pointer group",
                "w-full min-w-[120px] min-h-[120px]",
              )}
            >
              <Plus
                size={20}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
              <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                New Folder
              </p>
            </button>
          </div>
        </div>

        {/* Recent */}
        <div>
          <SectionHeader title="Recent" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {recentArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                variant="grid"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function FileBrowserHome() {
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  if (openFolderId) {
    return (
      <FolderView
        folderId={openFolderId}
        onBack={() => setOpenFolderId(null)}
      />
    );
  }

  return <HomeContent onOpenFolder={setOpenFolderId} />;
}
