/**
 * ArtifactCard - Visual card for a file/artifact in the file browser.
 * Shows icon, title, type badge, and relative time.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { BarChart12, Globe04, PresentationChart01 } from "@untitledui/icons";
import {
  formatRelativeTime,
  type Artifact,
  type ArtifactType,
} from "@/web/lib/mock-artifacts";

const TYPE_CONFIG: Record<
  ArtifactType,
  {
    label: string;
    bgColor: string;
    textColor: string;
    iconBg: string;
    Icon: typeof PresentationChart01;
  }
> = {
  deck: {
    label: "Slide Deck",
    bgColor: "bg-violet-50 dark:bg-violet-950/30",
    textColor: "text-violet-700 dark:text-violet-300",
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
    Icon: PresentationChart01,
  },
  report: {
    label: "Report",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    textColor: "text-emerald-700 dark:text-emerald-300",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
    Icon: BarChart12,
  },
  site: {
    label: "Website",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    textColor: "text-blue-700 dark:text-blue-300",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    Icon: Globe04,
  },
};

export function ArtifactCard({
  artifact,
  variant = "grid",
  onClick,
}: {
  artifact: Artifact;
  variant?: "grid" | "list";
  onClick?: () => void;
}) {
  const config = TYPE_CONFIG[artifact.type];
  const { Icon } = config;

  if (variant === "list") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-left",
          "transition-colors hover:bg-accent/50 cursor-pointer group",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center size-9 rounded-lg shrink-0",
            config.iconBg,
          )}
        >
          <Icon size={18} className={config.textColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {artifact.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {artifact.preview}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
              config.bgColor,
              config.textColor,
            )}
          >
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(artifact.updatedAt)}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 p-3 rounded-xl text-left",
        "border border-border bg-card",
        "transition-all hover:border-foreground/20 hover:shadow-sm cursor-pointer group",
        "w-full",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex items-center justify-center size-10 rounded-lg shrink-0",
            config.iconBg,
          )}
        >
          <Icon size={20} className={config.textColor} />
        </div>
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0",
            config.bgColor,
            config.textColor,
          )}
        >
          {config.label}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {artifact.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {artifact.preview}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-auto">
        {formatRelativeTime(artifact.updatedAt)}
      </p>
    </button>
  );
}

export function ArtifactTypeFilter({
  value,
  onChange,
}: {
  value: ArtifactType | "all";
  onChange: (type: ArtifactType | "all") => void;
}) {
  const filters: Array<{ key: ArtifactType | "all"; label: string }> = [
    { key: "all", label: "All" },
    { key: "deck", label: "Decks" },
    { key: "report", label: "Reports" },
    { key: "site", label: "Sites" },
  ];

  return (
    <div className="flex items-center gap-1">
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          className={cn(
            "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
            value === f.key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
