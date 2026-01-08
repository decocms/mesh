import { ErrorBoundary } from "@/web/components/error-boundary";
import { SidebarItemsSection } from "@/web/components/sidebar-items-section";
import { useConnection } from "@/web/hooks/collections/use-connection";
import { useGateway } from "@/web/hooks/collections/use-gateway";
import { useConnectionDetailTabs } from "@/web/hooks/use-connection-detail-tabs";
import { useConnectionsPrompts } from "@/web/hooks/use-connection-prompts";
import { useConnectionsResources } from "@/web/hooks/use-connection-resources";
import { useDetailRouteContext } from "@/web/hooks/use-detail-route-context";
import { useGatewayDetailTabs } from "@/web/hooks/use-gateway-detail-tabs";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { NavigationSidebar } from "@deco/ui/components/navigation-sidebar.tsx";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@deco/ui/components/sidebar.tsx";
import {
  BookOpen01,
  Container,
  FileCheck02,
  Lightbulb02,
  Settings01,
  Tool01,
} from "@untitledui/icons";
import { Suspense } from "react";

function DetailTabIcon({ tabId }: { tabId: string }) {
  switch (tabId) {
    case "settings":
      return <Settings01 />;
    case "tools":
      return <Tool01 />;
    case "resources":
      return <FileCheck02 />;
    case "prompts":
      return <Lightbulb02 />;
    case "readme":
      return <BookOpen01 />;
    default:
      // Dynamic collection tabs
      return <Container />;
  }
}

/**
 * Skeleton for gateway detail sidebar section - renders 3 menu items
 */
function GatewayDetailSidebarSectionSkeleton() {
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
    </>
  );
}

/**
 * Detail sidebar section for gateway routes.
 */
function GatewayDetailSidebarSection({ gatewayId }: { gatewayId: string }) {
  const gateway = useGateway(gatewayId);
  const { tabs, activeTabId, setTab } = useGatewayDetailTabs();

  if (!gateway) return null;

  return (
    <>
      {tabs.map((tab) => (
        <SidebarMenuItem key={`detail-${tab.id}`}>
          <SidebarMenuButton
            className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
            onClick={() => setTab(tab.id)}
            isActive={tab.id === activeTabId}
            tooltip={tab.label}
          >
            <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
              <DetailTabIcon tabId={tab.id} />
            </span>
            <span className="truncate">{tab.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  );
}

/**
 * Skeleton for connection detail sidebar section - renders 3 menu items
 */
function ConnectionDetailSidebarSectionSkeleton() {
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
    </>
  );
}

/**
 * Detail sidebar section for connection routes.
 */
function ConnectionDetailSidebarSection({
  connectionId,
}: {
  connectionId: string;
}) {
  const connection = useConnection(connectionId);
  const { promptsMap } = useConnectionsPrompts([connectionId]);
  const { resourcesMap } = useConnectionsResources([connectionId]);
  const prompts = promptsMap.get(connectionId) ?? [];
  const resources = resourcesMap.get(connectionId) ?? [];
  const { tabs, activeTabId, setTab } = useConnectionDetailTabs({
    connection,
    prompts,
    resources,
  });

  if (!connection) return null;

  return (
    <>
      {tabs.map((tab) => (
        <SidebarMenuItem key={`detail-${tab.id}`}>
          <SidebarMenuButton
            className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
            onClick={() => setTab(tab.id)}
            isActive={tab.id === activeTabId}
            tooltip={tab.label}
          >
            <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
              <DetailTabIcon tabId={tab.id} />
            </span>
            <span className="truncate">
              {tab.count ? `${tab.label} (${tab.count})` : tab.label}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  );
}

export function MeshSidebar() {
  const globalItems = useProjectSidebarItems();
  const detailContext = useDetailRouteContext();

  return (
    <NavigationSidebar
      // Main navigation always first (should not suspend)
      navigationItems={globalItems}
      // additionalContent may suspend; isolate it so the sidebar still renders
      additionalContent={[
        detailContext?.kind === "gateway" && (
          <ErrorBoundary key="gateway-detail-sidebar-section">
            <Suspense fallback={<GatewayDetailSidebarSectionSkeleton />}>
              <GatewayDetailSidebarSection gatewayId={detailContext.itemId} />
            </Suspense>
          </ErrorBoundary>
        ),
        detailContext?.kind === "connection" && (
          <ErrorBoundary key="connection-detail-sidebar-section">
            <Suspense fallback={<ConnectionDetailSidebarSectionSkeleton />}>
              <ConnectionDetailSidebarSection
                connectionId={detailContext.itemId}
              />
            </Suspense>
          </ErrorBoundary>
        ),
        <ErrorBoundary key="sidebar-items-section">
          <Suspense fallback={null}>
            <SidebarItemsSection />
          </Suspense>
        </ErrorBoundary>,
      ].filter(Boolean)}
    />
  );
}
