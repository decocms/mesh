import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useProjectContext } from "@decocms/mesh-sdk";
import { cn } from "@deco/ui/lib/utils.ts";
import type { ProjectUI } from "@/web/hooks/use-project";

interface ProjectCardProps {
  project: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    enabledPlugins: string[] | null;
    ui: ProjectUI | null;
    updatedAt: string;
  };
  onSettingsClick?: (e: React.MouseEvent) => void;
}

export function ProjectCard({ project, onSettingsClick }: ProjectCardProps) {
  const { org } = useProjectContext();

  const bannerStyle = {
    backgroundColor: project.ui?.bannerColor ?? "#3B82F6",
    backgroundImage: project.ui?.banner
      ? `url(${project.ui.banner})`
      : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  return (
    <Link
      to="/$org/$project"
      params={{ org: org.slug, project: project.slug }}
      className="block group"
    >
      <div className="border rounded-xl overflow-hidden bg-card hover:shadow-lg transition-shadow">
        {/* Banner */}
        <div className="h-24 relative" style={bannerStyle}>
          {/* Settings Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSettingsClick?.(e);
            }}
            className={cn(
              "absolute top-2 right-2 size-8 rounded-lg flex items-center justify-center",
              "bg-black/20 hover:bg-black/40 transition-colors",
              "opacity-0 group-hover:opacity-100",
            )}
          >
            <Settings className="size-4 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Project Icon */}
          <div className="-mt-10 mb-3">
            {project.ui?.icon ? (
              <img
                src={project.ui.icon}
                alt=""
                className="size-12 rounded-xl border-2 border-background object-cover"
              />
            ) : (
              <div
                className="size-12 rounded-xl border-2 border-background flex items-center justify-center text-lg font-semibold text-white"
                style={{ backgroundColor: project.ui?.themeColor ?? "#3B82F6" }}
              >
                {project.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name */}
          <h3 className="font-semibold text-foreground truncate">
            {project.name}
          </h3>

          {/* Updated Time */}
          <p className="text-sm text-muted-foreground mt-0.5">
            Edited{" "}
            {formatDistanceToNow(new Date(project.updatedAt), {
              addSuffix: true,
            })}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4">
            {/* Plugin Icons */}
            <div className="flex -space-x-1.5">
              {project.enabledPlugins?.slice(0, 4).map((pluginId) => (
                <PluginIcon key={pluginId} pluginId={pluginId} />
              ))}
              {(project.enabledPlugins?.length ?? 0) > 4 && (
                <div className="size-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs text-muted-foreground">
                  +{project.enabledPlugins!.length - 4}
                </div>
              )}
            </div>

            {/* Org Badge */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              <div className="size-3 rounded-full bg-primary/20" />
              <span className="truncate max-w-20">{org.name}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function PluginIcon({ pluginId }: { pluginId: string }) {
  return (
    <div className="size-6 rounded-full bg-zinc-800 border-2 border-background flex items-center justify-center">
      <span className="text-[10px] text-white font-medium">
        {pluginId.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
