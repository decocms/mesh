import {
  Outlet,
  Link,
  useRouterState,
  useParams,
} from "@tanstack/react-router";
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
  Building02,
  Container,
  CpuChip01,
  Lock01,
  User01,
  Users03,
  Zap,
} from "@untitledui/icons";

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
  return [
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
          key: "features",
          label: "Features",
          icon: <Zap size={14} />,
          to: "/$org/settings/features",
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
          key: "profile",
          label: "Profile & Preferences",
          icon: <User01 size={14} />,
          to: "/$org/settings/profile",
        },
      ],
    },
  ];
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
            {i > 0 && <div className="mx-2 mb-2 border-t border-border/50" />}
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

export default function SettingsLayout() {
  return (
    <PageContentClassNameProvider value="p-0">
      <div className="flex-1 min-w-0 overflow-hidden h-full">
        <Outlet />
      </div>
    </PageContentClassNameProvider>
  );
}
