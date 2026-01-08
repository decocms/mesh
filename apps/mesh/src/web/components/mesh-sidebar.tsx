import type { ConnectionEntity } from "@/tools/connection/schema";
import type { GatewayEntity } from "@/tools/gateway/schema";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { SidebarItemsSection } from "@/web/components/sidebar-items-section";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useCollectionBindings } from "@/web/hooks/use-binding";
import { buildConnectionTabs } from "@/web/hooks/use-connection-detail-tabs";
import { useConnectionsPrompts } from "@/web/hooks/use-connection-prompts";
import { useConnectionsResources } from "@/web/hooks/use-connection-resources";
import { useMCPAuthStatus } from "@/web/hooks/use-mcp-auth-status";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@deco/ui/components/sidebar.tsx";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  BookOpen01,
  ChevronDown,
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
 * Sort connections by updated_at desc, fallback to created_at then title
 */
function sortConnectionsByRecent(
  connections: ConnectionEntity[],
): ConnectionEntity[] {
  return [...connections].sort((a, b) => {
    const aDate = a.updated_at || a.created_at || "";
    const bDate = b.updated_at || b.created_at || "";
    if (aDate && bDate) {
      const comparison = new Date(bDate).getTime() - new Date(aDate).getTime();
      if (comparison !== 0) return comparison;
    }
    return (a.title || "").localeCompare(b.title || "");
  });
}

/**
 * Sort gateways by updated_at desc, fallback to created_at then title
 */
function sortGatewaysByRecent(gateways: GatewayEntity[]): GatewayEntity[] {
  return [...gateways].sort((a, b) => {
    const aDate = a.updated_at || a.created_at || "";
    const bDate = b.updated_at || b.created_at || "";
    if (aDate && bDate) {
      const comparison = new Date(bDate).getTime() - new Date(aDate).getTime();
      if (comparison !== 0) return comparison;
    }
    return (a.title || "").localeCompare(b.title || "");
  });
}

/**
 * Single connection item with nested tabs (collapsible)
 */
function ConnectionAccordionItem({
  connection,
  org,
  isActive,
}: {
  connection: ConnectionEntity;
  org: string;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    connectionId?: string;
    tab?: string;
  };
  const currentConnectionId = params.connectionId;
  const currentTab = params.tab || "settings";

  // Fetch prompts/resources for this connection
  const { promptsMap } = useConnectionsPrompts([connection.id]);
  const { resourcesMap } = useConnectionsResources([connection.id]);
  const prompts = promptsMap.get(connection.id) ?? [];
  const resources = resourcesMap.get(connection.id) ?? [];

  // Get auth status
  const authStatus = useMCPAuthStatus({ connectionId: connection.id });
  const isMCPAuthenticated = authStatus.isAuthenticated;

  // Get collection bindings
  const collections = useCollectionBindings(connection);

  // Check repository
  const repository = connection?.metadata?.repository as
    | { url?: string }
    | undefined;
  const hasRepository = !!repository?.url;

  // Build tabs
  const tabs = buildConnectionTabs({
    connection,
    isMCPAuthenticated,
    promptsCount: prompts.length,
    resourcesCount: resources.length,
    collections,
    hasRepository,
  });

  const handleHeaderClick = () => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org, connectionId: connection.id },
    });
  };

  const handleTabClick = (tabId: string) => {
    if (tabId === "settings") {
      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org, connectionId: connection.id },
      });
      return;
    }

    navigate({
      to: "/$org/mcps/$connectionId/$tab",
      params: { org, connectionId: connection.id, tab: tabId },
    });
  };

  const isThisConnection = currentConnectionId === connection.id;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
        onClick={handleHeaderClick}
        isActive={isActive}
        tooltip={connection.title}
      >
        <span className="truncate">{connection.title}</span>
      </SidebarMenuButton>
      <SidebarMenuSub>
        {tabs.map((tab) => {
          const isActiveTab = isThisConnection && tab.id === currentTab;
          return (
            <SidebarMenuSubItem key={`tab-${tab.id}`}>
              <SidebarMenuSubButton
                className="cursor-pointer"
                onClick={() => handleTabClick(tab.id)}
                isActive={isActiveTab}
              >
                <span className="text-muted-foreground [&>svg]:size-4">
                  <DetailTabIcon tabId={tab.id} />
                </span>
                <span className="truncate">
                  {tab.count ? `${tab.label} (${tab.count})` : tab.label}
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          );
        })}
      </SidebarMenuSub>
    </SidebarMenuItem>
  );
}

/**
 * Connections accordion list (max 10 items + "View all")
 */
function ConnectionsAccordionListContent({ org }: { org: string }) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { connectionId?: string };
  const currentConnectionId = params.connectionId;

  const allConnections = useConnections({});
  const sortedConnections = sortConnectionsByRecent(allConnections);

  const displayedConnections = sortedConnections.slice(0, 10);
  const remainingCount = sortedConnections.length - displayedConnections.length;

  return (
    <>
      {displayedConnections.map((connection) => (
        <ErrorBoundary key={connection.id}>
          <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
            <ConnectionAccordionItem
              connection={connection}
              org={org}
              isActive={currentConnectionId === connection.id}
            />
          </Suspense>
        </ErrorBoundary>
      ))}
      {remainingCount > 0 && (
        <SidebarMenuItem>
          <SidebarMenuButton
            className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
            onClick={() => navigate({ to: "/$org/mcps", params: { org } })}
            tooltip={`View all connections (+${remainingCount})`}
          >
            <span className="text-muted-foreground text-xs">
              View all (+{remainingCount})
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </>
  );
}

/**
 * Single gateway item with nested tabs (collapsible)
 */
function GatewayAccordionItem({
  gateway,
  org,
  isActive,
}: {
  gateway: GatewayEntity;
  org: string;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    gatewayId?: string;
    tab?: string;
  };
  const currentGatewayId = params.gatewayId;
  const currentTab = params.tab || "settings";

  const tabs = [
    { id: "settings", label: "Settings" },
    { id: "tools", label: "Tools" },
    { id: "resources", label: "Resources" },
    { id: "prompts", label: "Prompts" },
  ];

  const handleHeaderClick = () => {
    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org, gatewayId: gateway.id },
    });
  };

  const handleTabClick = (tabId: string) => {
    if (tabId === "settings") {
      navigate({
        to: "/$org/gateways/$gatewayId",
        params: { org, gatewayId: gateway.id },
      });
      return;
    }

    navigate({
      to: "/$org/gateways/$gatewayId/$tab",
      params: { org, gatewayId: gateway.id, tab: tabId },
    });
  };

  const isThisGateway = currentGatewayId === gateway.id;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
        onClick={handleHeaderClick}
        isActive={isActive}
        tooltip={gateway.title}
      >
        <span className="truncate">{gateway.title}</span>
      </SidebarMenuButton>
      <SidebarMenuSub>
        {tabs.map((tab) => {
          const isActiveTab = isThisGateway && tab.id === currentTab;
          return (
            <SidebarMenuSubItem key={`tab-${tab.id}`}>
              <SidebarMenuSubButton
                className="cursor-pointer"
                onClick={() => handleTabClick(tab.id)}
                isActive={isActiveTab}
              >
                <span className="text-muted-foreground [&>svg]:size-4">
                  <DetailTabIcon tabId={tab.id} />
                </span>
                <span className="truncate">{tab.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          );
        })}
      </SidebarMenuSub>
    </SidebarMenuItem>
  );
}

/**
 * Gateways accordion list (max 10 items + "View all")
 */
function GatewaysAccordionListContent({ org }: { org: string }) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { gatewayId?: string };
  const currentGatewayId = params.gatewayId;

  const allGateways = useGateways({});
  const sortedGateways = sortGatewaysByRecent(allGateways);

  const displayedGateways = sortedGateways.slice(0, 10);
  const remainingCount = sortedGateways.length - displayedGateways.length;

  return (
    <>
      {displayedGateways.map((gateway) => (
        <GatewayAccordionItem
          key={gateway.id}
          gateway={gateway}
          org={org}
          isActive={currentGatewayId === gateway.id}
        />
      ))}
      {remainingCount > 0 && (
        <SidebarMenuItem>
          <SidebarMenuButton
            className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
            onClick={() => navigate({ to: "/$org/gateways", params: { org } })}
            tooltip={`View all hubs (+${remainingCount})`}
          >
            <span className="text-muted-foreground text-xs">
              View all (+{remainingCount})
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </>
  );
}

export function MeshSidebar() {
  const globalItems = useProjectSidebarItems();
  const params = useParams({ strict: false }) as { org?: string };
  const org = params.org || "";
  const navigate = useNavigate();

  // Filter out Connections and Hubs - we'll render them as collapsible groups
  const filteredItems = globalItems.filter(
    (item) => item.key !== "mcps" && item.key !== "gateways",
  );

  // Get icons from the original items
  const connectionsItem = globalItems.find((item) => item.key === "mcps");
  const hubsItem = globalItems.find((item) => item.key === "gateways");

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarContent className="flex-1 overflow-x-hidden">
        {/* Navigation items */}
        <SidebarGroup className="font-medium">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {filteredItems.map((item) => (
                <div key={item.key}>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
                      onClick={item.onClick}
                      isActive={item.isActive}
                      tooltip={item.label}
                    >
                      <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {item.after}
                </div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 -ml-1" />

        {/* Connections Group */}
        <Collapsible defaultOpen className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel
              asChild
              className="group/label text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <CollapsibleTrigger
                className="w-full flex items-center gap-2"
                onClick={() => navigate({ to: "/$org/mcps", params: { org } })}
              >
                {connectionsItem && (
                  <span className="text-muted-foreground [&>svg]:size-4">
                    {connectionsItem.icon}
                  </span>
                )}
                <span className="flex-1 text-left">Connections</span>
                <ChevronDown className="transition-transform group-data-[state=open]/collapsible:rotate-0 group-data-[state=closed]/collapsible:-rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <ErrorBoundary key="connections-accordion-list">
                    <Suspense
                      fallback={
                        <>
                          <SidebarMenuSkeleton showIcon />
                          <SidebarMenuSkeleton showIcon />
                          <SidebarMenuSkeleton showIcon />
                        </>
                      }
                    >
                      <ConnectionsAccordionListContent org={org} />
                    </Suspense>
                  </ErrorBoundary>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <SidebarSeparator className="my-2 -ml-1" />

        {/* Hubs Group */}
        <Collapsible defaultOpen className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel
              asChild
              className="group/label text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <CollapsibleTrigger
                className="w-full flex items-center gap-2"
                onClick={() =>
                  navigate({ to: "/$org/gateways", params: { org } })
                }
              >
                {hubsItem && (
                  <span className="text-muted-foreground [&>svg]:size-4">
                    {hubsItem.icon}
                  </span>
                )}
                <span className="flex-1 text-left">Hubs</span>
                <ChevronDown className="transition-transform group-data-[state=open]/collapsible:rotate-0 group-data-[state=closed]/collapsible:-rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <ErrorBoundary key="gateways-accordion-list">
                    <Suspense
                      fallback={
                        <>
                          <SidebarMenuSkeleton showIcon />
                          <SidebarMenuSkeleton showIcon />
                          <SidebarMenuSkeleton showIcon />
                        </>
                      }
                    >
                      <GatewaysAccordionListContent org={org} />
                    </Suspense>
                  </ErrorBoundary>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <SidebarSeparator className="my-2 -ml-1" />

        {/* Additional content */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <ErrorBoundary key="sidebar-items-section">
                <Suspense fallback={null}>
                  <SidebarItemsSection />
                </Suspense>
              </ErrorBoundary>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
