import { SidebarItem } from "@/storage/types";
import { Icon } from "@deco/ui/components/icon.tsx";
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
        className="w-full pr-2 group/item relative cursor-pointer"
        onClick={() => {
          navigate({ to: item.url });
        }}
        tooltip={item.title}
      >
        <div className="flex items-center justify-center shrink-0 mr-2">
          {isIconUrl ? (
            <img
              src={item.icon}
              alt={item.title}
              className="h-4 w-4 rounded object-cover"
            />
          ) : (
            <Icon
              name={item.icon}
              size={16}
              className="text-muted-foreground"
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col items-start">
          <span className="truncate text-sm w-full capitalize">
            {item.title.toLocaleLowerCase()}
          </span>
        </div>
        <Icon
          name="close"
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
 * Sidebar items section content - renders above Recent Threads
 * Only shows when there are pinned sidebar items
 */
function SidebarItemsSectionContent() {
  const { org } = useProjectContext();
  const settings = useOrganizationSettings(org.id);

  const sidebarItems = settings?.sidebar_items;

  if (!sidebarItems?.length) {
    return null;
  }

  return (
    <SidebarItemLayout>
      {sidebarItems.map((item) => (
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
        <div className="px-2 py-0 text-xs font-medium text-muted-foreground flex items-center justify-between">
          <span className="whitespace-nowrap group-data-[collapsible=icon]:hidden">
            Pinned Views
          </span>
        </div>
      </SidebarMenuItem>
      {children}
    </>
  );
}

/**
 * Sidebar items section - renders above Recent Threads
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
