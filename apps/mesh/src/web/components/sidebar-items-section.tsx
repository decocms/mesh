import { SidebarItem } from "@/storage/types";
import { X, File06 } from "@untitledui/icons";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { useNavigate } from "@tanstack/react-router";
import { PropsWithChildren, Suspense } from "react";
import {
  useOrganizationSettings,
  useOrganizationSettingsActions,
} from "../hooks/collections/use-organization-settings";
import { useProjectContext } from "../providers/project-context-provider";
import { useOptionalToolboxContext } from "../providers/toolbox-context-provider";

/**
 * Individual sidebar item
 */
function SidebarItemListItem({ item }: { item: SidebarItem }) {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const settings = useOrganizationSettings(org.id);
  const actions = useOrganizationSettingsActions(org.id);

  const handleDelete = async () => {
    const currentItems = settings?.sidebar_items || [];
    const updatedItems = currentItems.filter(
      (sidebarItem) => sidebarItem.url !== item.url,
    );

    await actions.update.mutateAsync({
      sidebar_items: updatedItems,
    });
  };

  const isIconUrl = /^https?:\/\/.+/.test(item.icon);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="w-full pr-2 group/item relative cursor-pointer text-foreground/90 hover:text-foreground"
        onClick={() => {
          navigate({ to: item.url });
        }}
        tooltip={item.title}
      >
        <div className="flex items-center justify-center shrink-0">
          {isIconUrl ? (
            <img
              src={item.icon}
              alt={item.title}
              className="h-4 w-4 rounded object-cover"
            />
          ) : (
            <File06
              size={16}
              className="text-muted-foreground group-hover/item:text-foreground transition-colors"
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col items-start">
          <span className="truncate text-sm w-full capitalize">
            {item.title.toLocaleLowerCase()}
          </span>
        </div>
        <X
          size={16}
          className="text-muted-foreground opacity-0 group-hover/item:opacity-50 hover:opacity-100 cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDelete();
          }}
        />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Check if a sidebar item URL belongs to a specific connection
 * URL pattern: /:org/mcps/:connectionId/...
 */
function extractConnectionIdFromUrl(url: string): string | null {
  const match = url.match(/\/[^/]+\/mcps\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * Sidebar items section content - renders above Recent Threads
 * Only shows when there are pinned sidebar items
 *
 * When in a toolbox context, filters to only show items from connections
 * that are included in the toolbox.
 */
function SidebarItemsSectionContent() {
  const { org } = useProjectContext();
  const settings = useOrganizationSettings(org.id);
  const toolboxContext = useOptionalToolboxContext();

  const sidebarItems = settings?.sidebar_items;

  if (!sidebarItems?.length) {
    return null;
  }

  // If in toolbox context, filter to only show items from toolbox connections
  let filteredItems = sidebarItems;
  if (toolboxContext) {
    const toolboxConnectionIds = new Set(
      toolboxContext.toolbox.connections.map((c) => c.connection_id),
    );
    filteredItems = sidebarItems.filter((item) => {
      const connectionId = extractConnectionIdFromUrl(item.url);
      // Show item if it's from a connection in the toolbox, or if we can't determine the connection
      return connectionId === null || toolboxConnectionIds.has(connectionId);
    });
  }

  if (!filteredItems?.length) {
    return null;
  }

  return (
    <SidebarItemLayout>
      {filteredItems.map((item) => (
        <SidebarItemListItem key={item.url} item={item} />
      ))}
    </SidebarItemLayout>
  );
}

/**
 * Skeleton for loading sidebar item entries
 */
function SidebarItemSkeleton() {
  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 px-4 py-2">
        <Skeleton className="h-4 flex-1" />
      </div>
    </SidebarMenuItem>
  );
}

function SidebarItemLayout({ children }: PropsWithChildren) {
  return (
    <>
      <SidebarSeparator className="my-2 -ml-1" />
      <SidebarMenuItem>
        <div className="group-data-[collapsible=icon]:hidden px-2 py-0 text-xs font-medium h-6 text-muted-foreground flex items-center justify-between">
          <span className="whitespace-nowrap">Pinned Views</span>
        </div>
      </SidebarMenuItem>
      {children}
    </>
  );
}

/**
 * Sidebar items section - renders above Recent Threads
 * Scoped to toolbox context when available
 */
export function SidebarItemsSection() {
  return (
    <Suspense
      fallback={
        <SidebarItemLayout>
          <SidebarItemSkeleton />
          <SidebarItemSkeleton />
        </SidebarItemLayout>
      }
    >
      <SidebarItemsSectionContent />
    </Suspense>
  );
}
