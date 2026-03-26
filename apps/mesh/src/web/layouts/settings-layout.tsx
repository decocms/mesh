import {
  Outlet,
  Link,
  useRouterState,
  useParams,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { PageContentClassNameProvider } from "@/web/components/page";
import {
  ArrowNarrowLeft,
  BarChart10,
  Building02,
  Container,
  CpuChip01,
  Lock01,
  RefreshCcw01,
  Users03,
  Zap,
} from "@untitledui/icons";

function ContentSkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80" />
      <div className="mt-4 flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

interface SidebarItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  to: string;
}

interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

function useSettingsSidebarGroups(): SidebarGroup[] {
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
          key: "automations",
          label: "Automations",
          icon: <RefreshCcw01 size={14} />,
          to: "/$org/settings/automations",
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
    <div className="hidden md:flex w-56 shrink-0 flex-col gap-4 bg-sidebar/50 overflow-y-auto py-3">
      {/* Back to org */}
      <div className="px-2">
        <Link
          to="/$org"
          params={{ org }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          <ArrowNarrowLeft size={14} />
          <span>Settings</span>
        </Link>
      </div>

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5 px-2">
          {group.label && (
            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground/60">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              params={{ org }}
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-left w-full transition-colors",
                isActive(item.to)
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      ))}

      {/* Version */}
      <div className="mt-auto px-4 pb-1">
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
        <Suspense
          fallback={
            <div className="p-0">
              <ContentSkeleton />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
    </PageContentClassNameProvider>
  );
}
