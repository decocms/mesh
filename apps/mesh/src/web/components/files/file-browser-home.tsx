/**
 * FileBrowserHome - The main file-centric home page.
 * Shows folders, recent artifacts, and quick actions.
 * Quick actions send messages to the chat agent.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import {
  BarChart12,
  Globe04,
  Plus,
  PresentationChart01,
  SearchLg,
} from "@untitledui/icons";
import { authClient } from "@/web/lib/auth-client";
import {
  MOCK_FOLDERS,
  MOCK_ARTIFACTS,
  getRecentArtifacts,
  type ArtifactType,
} from "@/web/lib/mock-artifacts";
import { FolderCard } from "./folder-card";
import { ArtifactCard, ArtifactTypeFilter } from "./artifact-card";
import { useState } from "react";
import { FolderView } from "./folder-view";
import { useChatTask } from "@/web/components/chat/context";

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

type View = { type: "home" } | { type: "folder"; id: string } | { type: "all" };

function AllFilesView({ onBack }: { onBack: () => void }) {
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "all">("all");
  const [search, setSearch] = useState("");

  const artifacts = MOCK_ARTIFACTS.filter((a) => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  }).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Home
            </button>
            <span className="text-xs text-muted-foreground/50">/</span>
            <h1 className="text-sm font-medium text-foreground">All Files</h1>
            <span className="text-xs text-muted-foreground">
              {artifacts.length} {artifacts.length === 1 ? "item" : "items"}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 px-4 py-2 flex items-center justify-between gap-3">
        <ArtifactTypeFilter value={typeFilter} onChange={setTypeFilter} />
        <div className="relative">
          <SearchLg
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-8 pr-3 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {artifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">No files found</p>
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

function HomeContent({
  onOpenFolder,
  onOpenAll,
}: {
  onOpenFolder: (folderId: string) => void;
  onOpenAll: () => void;
}) {
  const { data: session } = authClient.useSession();
  const { createTaskWithMessage } = useChatTask();
  const userName = session?.user?.name?.split(" ")[0] || "there";
  const recentArtifacts = getRecentArtifacts(6);

  const sendQuickAction = (text: string) => {
    createTaskWithMessage({
      message: {
        parts: [{ type: "text", text }],
      },
    });
  };

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
              onClick={() =>
                sendQuickAction(
                  "Create a new slide deck. Ask me what it should be about.",
                )
              }
            />
            <QuickAction
              icon={BarChart12}
              label="Run Diagnostic"
              color="#10B981"
              onClick={() =>
                sendQuickAction(
                  "Run a website diagnostic. Ask me which site to analyze.",
                )
              }
            />
            <QuickAction
              icon={Globe04}
              label="Edit Site"
              color="#3B82F6"
              onClick={() =>
                sendQuickAction(
                  "I'd like to edit a website. Ask me which site and what changes.",
                )
              }
            />
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
          <SectionHeader
            title="Recent"
            action={{ label: "See all", onClick: onOpenAll }}
          />
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
  const [view, setView] = useState<View>({ type: "home" });

  if (view.type === "folder") {
    return (
      <FolderView folderId={view.id} onBack={() => setView({ type: "home" })} />
    );
  }

  if (view.type === "all") {
    return <AllFilesView onBack={() => setView({ type: "home" })} />;
  }

  return (
    <HomeContent
      onOpenFolder={(id) => setView({ type: "folder", id })}
      onOpenAll={() => setView({ type: "all" })}
    />
  );
}
