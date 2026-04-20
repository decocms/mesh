/**
 * Topbar Project Info
 *
 * Shows the project name, path, and dev server status in the topbar.
 * Only renders when running in project mode (publicConfig.projectDir is set).
 */

import { usePublicConfig } from "@/web/hooks/use-public-config";
import { useDevServerState } from "@/web/hooks/use-project-info";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-green-500"
      : status === "starting"
        ? "bg-yellow-500 animate-pulse"
        : status === "error"
          ? "bg-red-500"
          : "bg-muted-foreground/50";

  const label =
    status === "running"
      ? "Dev server running"
      : status === "starting"
        ? "Dev server starting..."
        : status === "error"
          ? "Dev server error"
          : "Dev server stopped";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("size-2 rounded-full shrink-0", color)} />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)?.[0];
  if (home) {
    return path.replace(home, "~");
  }
  return path;
}

export function TopbarProjectInfo() {
  const config = usePublicConfig();

  if (!config.projectDir) return null;

  return <TopbarProjectInfoContent />;
}

function TopbarProjectInfoContent() {
  const config = usePublicConfig();
  const { data: devServer } = useDevServerState();

  return (
    <div className="flex items-center gap-2 text-sm">
      <StatusDot status={devServer?.status ?? "stopped"} />
      <span className="font-medium text-foreground">{config.projectName}</span>
      <span className="text-muted-foreground text-xs hidden sm:inline">
        {shortenPath(config.projectDir ?? "")}
      </span>
    </div>
  );
}
