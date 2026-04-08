/**
 * ProjectHome — The file browser view when entering a project.
 * Shows the project's files (artifacts) in a clean, visual layout.
 * This is what users see first — their stuff, not settings.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import {
  BarChart12,
  Globe04,
  Plus,
  PresentationChart01,
} from "@untitledui/icons";
import { useVirtualMCP } from "@decocms/mesh-sdk";
import {
  getRecentArtifacts,
  formatRelativeTime,
  type Artifact,
  type ArtifactType,
} from "@/web/lib/mock-artifacts";
import { useChatTask } from "@/web/components/chat/context";

const FILE_ICON: Record<
  ArtifactType,
  {
    Icon: typeof PresentationChart01;
    color: string;
    bg: string;
    label: string;
  }
> = {
  deck: {
    Icon: PresentationChart01,
    color: "#8B5CF6",
    bg: "bg-violet-100 dark:bg-violet-900/40",
    label: "Slide Deck",
  },
  report: {
    Icon: BarChart12,
    color: "#10B981",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    label: "Report",
  },
  site: {
    Icon: Globe04,
    color: "#3B82F6",
    bg: "bg-blue-100 dark:bg-blue-900/40",
    label: "Website",
  },
};

function FileCard({ artifact }: { artifact: Artifact }) {
  const config = FILE_ICON[artifact.type];
  const { Icon } = config;

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl text-left w-full",
        "border border-border bg-card",
        "transition-all hover:border-foreground/15 hover:shadow-sm cursor-pointer group",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center size-10 rounded-lg shrink-0",
          config.bg,
        )}
      >
        <Icon size={20} style={{ color: config.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {artifact.title}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {config.label}
        </p>
      </div>
      <span className="text-xs text-muted-foreground/60 shrink-0">
        {formatRelativeTime(artifact.updatedAt)}
      </span>
    </button>
  );
}

function EmptyFiles({ onCreateFirst }: { onCreateFirst: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Plus size={24} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">No files yet</p>
      <p className="text-xs text-muted-foreground max-w-[240px] mb-4">
        Start a conversation to create slides, reports, or edit a site
      </p>
      <button
        type="button"
        onClick={onCreateFirst}
        className="text-xs font-medium text-foreground bg-accent hover:bg-accent/80 px-3 py-1.5 rounded-md transition-colors"
      >
        Start working
      </button>
    </div>
  );
}

export function ProjectHome({ virtualMcpId }: { virtualMcpId: string }) {
  const entity = useVirtualMCP(virtualMcpId);
  const { createTaskWithMessage } = useChatTask();

  // For prototype: show mock artifacts (in real app, query project's MCP apps)
  const files = getRecentArtifacts(10);

  const handleStartWorking = () => {
    createTaskWithMessage({
      message: {
        parts: [
          {
            type: "text",
            text: "What can I help you create? I can make slide decks, run diagnostics, or help edit a site.",
          },
        ],
      },
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* Project header */}
        <div className="mb-6">
          <h1 className="text-lg font-medium text-foreground">
            {entity?.title ?? "Project"}
          </h1>
          {entity?.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {entity.description}
            </p>
          )}
        </div>

        {/* Files */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Files
            </h2>
          </div>

          {files.length === 0 ? (
            <EmptyFiles onCreateFirst={handleStartWorking} />
          ) : (
            <div className="flex flex-col gap-2">
              {files.map((artifact) => (
                <FileCard key={artifact.id} artifact={artifact} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
