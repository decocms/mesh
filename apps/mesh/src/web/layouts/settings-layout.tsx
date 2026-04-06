import {
  Outlet,
  Link,
  useRouterState,
  useParams,
} from "@tanstack/react-router";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@deco/ui/components/sidebar.tsx";
import { PageContentClassNameProvider } from "@/web/components/page";
import {
  ArrowNarrowLeft,
  BarChart10,
  BookOpen01,
  Building02,
  Container,
  CpuChip01,
  Lock01,
  PackageCheck,
  User01,
  Users03,
  Zap,
} from "@untitledui/icons";
import { useProjectContext } from "@decocms/mesh-sdk";
import { pluginSettingsSidebarItems } from "@/web/index";

interface SettingsNavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  to: string;
}

interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

function useSettingsSidebarGroups(): SettingsNavGroup[] {
  const currentProject = useProjectContext().project;
  const enabledPlugins = currentProject.enabledPlugins ?? [];

  const enabledSettingsItems = pluginSettingsSidebarItems
    .filter((item) => enabledPlugins.includes(item.pluginId))
    .map(({ key, label, icon, to }) => ({ key, label, icon, to }));

  const groups: SettingsNavGroup[] = [
    {
      label: "",
      items: [
        {
          key: "general",
          label: "General",
          icon: <Building02 size={14} />,
          to: "/$org/settings/general",
        },
        {
          key: "connections",
          label: "Connections",
          icon: <Container size={14} />,
          to: "/$org/settings/connections",
        },
        {
          key: "store",
          label: "Store",
          icon: <PackageCheck size={14} />,
          to: "/$org/settings/store",
        },
        {
          key: "brand-context",
          label: "Context",
          icon: <BookOpen01 size={14} />,
          to: "/$org/settings/brand-context",
        },
        {
          key: "ai-providers",
          label: "AI Providers",
          icon: <CpuChip01 size={14} />,
          to: "/$org/settings/ai-providers",
        },
        {
          key: "monitor",
          label: "Monitor",
          icon: <BarChart10 size={14} />,
          to: "/$org/settings/monitor",
        },
        {
          key: "members",
          label: "Members",
          icon: <Users03 size={14} />,
          to: "/$org/settings/members",
        },
        {
          key: "sso",
          label: "SSO",
          icon: <Lock01 size={14} />,
          to: "/$org/settings/sso",
        },
      ],
    },
    {
      label: "",
      items: [
        {
          key: "features",
          label: "Plugins",
          icon: <Zap size={14} />,
          to: "/$org/settings/features",
        },
        ...enabledSettingsItems,
      ],
    },
  ];

  groups.push({
    label: "",
    items: [
      {
        key: "profile",
        label: "Profile & Preferences",
        icon: <User01 size={14} />,
        to: "/$org/settings/profile",
      },
    ],
  });

  return groups;
}

export function SettingsSidebar() {
  const groups = useSettingsSidebarGroups();
  const { org } = useParams({ from: "/shell/$org" });
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  const isActive = (to: string) => {
    const resolved = to.replace("$org", org);
    return pathname.startsWith(resolved);
  };

  return (
    <Sidebar variant="sidebar">
      <SidebarContent className="flex flex-col flex-1 overflow-x-hidden mt-2 px-2 pb-2 gap-0">
        {/* Back to org */}
        <SidebarGroup className="pt-0 pr-0 pb-3 md:pb-3 pl-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    to="/$org"
                    params={{ org }}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <ArrowNarrowLeft size={14} />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groups.map((group, i) => (
          <SidebarGroup
            key={`${group.label}-${i}`}
            className="pt-0 pr-0 pb-0 pl-0"
          >
            {i > 0 && <div className="mx-2 my-2 border-t border-border/50" />}
            {group.label && (
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground/60">
                {group.label}
              </p>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)}>
                      <Link
                        to={item.to}
                        params={{ org }}
                        className="flex items-center gap-2.5 text-sm"
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Version */}
      <div className="mt-auto px-4 pb-1">
        <span className="text-xs text-muted-foreground/50">
          v{__MESH_VERSION__}
        </span>
      </div>
    </Sidebar>
  );
}

export function SettingsSidebarMobile({ onClose }: { onClose: () => void }) {
  const groups = useSettingsSidebarGroups();
  const { org } = useParams({ from: "/shell/$org" });
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  const isActive = (to: string) => {
    const resolved = to.replace("$org", org);
    return pathname.startsWith(resolved);
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header with back button */}
      <div className="flex items-center h-14 px-4 shrink-0 border-b border-border/50">
        <Link
          to="/$org"
          params={{ org }}
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <ArrowNarrowLeft size={16} className="shrink-0" />
          <span>Settings</span>
        </Link>
      </div>

      {/* Nav items */}
      <div className="flex flex-col flex-1 overflow-y-auto px-2 py-2 gap-0.5">
        {groups.map((group, i) => (
          <div key={`${group.label}-${i}`} className="flex flex-col gap-0.5">
            {i > 0 && <div className="h-px bg-border/50 my-2" />}
            {group.items.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                params={{ org }}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors text-sm",
                  isActive(item.to)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Version */}
      <div className="px-4 pb-3 pt-1 border-t border-border/50">
        <span className="text-xs text-muted-foreground/50">
          v{__MESH_VERSION__}
        </span>
      </div>
    </div>
  );
}

export default function SettingsLayout() {
  return (
    <PageContentClassNameProvider value="p-0">
      <div className="flex-1 min-w-0 overflow-hidden h-full">
        <Outlet />
      </div>
    </PageContentClassNameProvider>
  );
}
