import { Suspense } from "react";
import { SidebarMenuItem } from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useOrganizationSettings } from "@/web/hooks/collections/use-organization-settings";
import { SidebarItemLayout } from "./layout";
import { SidebarItemListItem } from "./item";

function SidebarItemSkeleton() {
  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 px-4 py-2">
        <Skeleton className="h-4 flex-1" />
      </div>
    </SidebarMenuItem>
  );
}

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
