/**
 * Settings Sidebar
 *
 * Navigation sidebar for settings pages.
 */

import { Link } from "@tanstack/react-router";
import { Settings01, Key01 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { useProjectContext } from "@/web/providers/project-context-provider";

interface SettingsSidebarProps {
  activeSection: "organization" | "gateway-keys";
}

const sections = [
  {
    id: "organization" as const,
    label: "Organization",
    icon: Settings01,
    path: "/$org/settings",
  },
  {
    id: "gateway-keys" as const,
    label: "Gateway Keys",
    icon: Key01,
    path: "/$org/settings/gateway-keys",
  },
];

export function SettingsSidebar({ activeSection }: SettingsSidebarProps) {
  const { org } = useProjectContext();

  return (
    <div className="w-56 border-r border-border bg-muted/30 shrink-0">
      <div className="p-4">
        <nav className="flex flex-col gap-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;

            return (
              <Link
                key={section.id}
                to={section.path}
                params={{ org: org.slug }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <Icon size={16} />
                {section.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
