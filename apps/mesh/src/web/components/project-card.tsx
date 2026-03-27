import { Link } from "@tanstack/react-router";
import { Settings, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useProjectContext } from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { AgentAvatar, getAgentWrapperColor } from "@/web/components/agent-icon";
import { useMembers } from "@/web/hooks/use-members";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

interface ProjectCardProps {
  project: VirtualMCPEntity;
  onDeleteClick?: (e: React.MouseEvent) => void;
}

export function ProjectCard({ project, onDeleteClick }: ProjectCardProps) {
  const { org } = useProjectContext();
  const { data: membersData } = useMembers();

  const members = membersData?.data?.members ?? [];
  const updatedByUser = project.updated_by
    ? members.find(
        (m: (typeof members)[number]) => m.user?.id === project.updated_by,
      )?.user
    : null;

  const ui = project.metadata?.ui;
  const themeColor = ui?.themeColor as string | null | undefined;
  const isHexColor = themeColor?.startsWith("#");
  const wrapperColor = !isHexColor
    ? getAgentWrapperColor(project.icon, project.title, themeColor)
    : null;

  const bannerBg =
    wrapperColor?.bgLight ?? (isHexColor ? undefined : "bg-muted");
  const bannerStyle =
    isHexColor && themeColor ? { backgroundColor: themeColor } : undefined;

  return (
    <Link
      to="/$org/$virtualMcpId"
      params={{ org: org.slug, virtualMcpId: project.id }}
      className="block group h-full"
    >
      <div className="border border-border rounded-xl overflow-hidden bg-card h-full flex flex-col">
        {/* Banner */}
        <div
          className={cn("h-20 relative", bannerBg)}
          style={
            ui?.banner
              ? {
                  backgroundImage: `url(${ui.banner})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : bannerStyle
          }
        >
          {/* Project Icon */}
          <div className="absolute inset-0 flex items-center px-3">
            <AgentAvatar
              icon={project.icon}
              name={project.title}
              size="md"
              className="shrink-0"
            />
          </div>
          {/* Action Buttons */}
          <div className="absolute top-3 right-3 flex items-center gap-1">
            {onDeleteClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteClick(e);
                }}
                className={cn(
                  "size-6 rounded-md flex items-center justify-center",
                  "bg-black/20 hover:bg-red-500/80 transition-colors",
                )}
              >
                <Trash2 className="size-3.5 text-white" />
              </button>
            )}
            <Link
              to="/$org/$virtualMcpId"
              params={{ org: org.slug, virtualMcpId: project.id }}
              search={{ main: "settings" }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "size-6 rounded-md flex items-center justify-center",
                "bg-black/20 hover:bg-black/40 transition-colors",
              )}
            >
              <Settings className="size-3.5 text-white" />
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 justify-between p-4">
          {/* Top Section */}
          <div className="flex flex-col">
            <h3 className="font-medium text-base text-foreground truncate">
              {project.title}
            </h3>
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {project.description}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4">
            {/* Last edited by user */}
            <div className="flex items-center gap-2 text-xs text-foreground">
              {updatedByUser ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Avatar
                        url={updatedByUser.image ?? undefined}
                        fallback={updatedByUser.name ?? "?"}
                        shape="circle"
                        size="xs"
                      />
                      <span className="truncate max-w-20">
                        {updatedByUser.name}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Last edited by</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Avatar fallback="?" shape="circle" size="xs" muted />
                      <span className="truncate max-w-20 text-muted-foreground">
                        Unknown
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Last edited by</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Edited timestamp */}
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(project.updated_at), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
