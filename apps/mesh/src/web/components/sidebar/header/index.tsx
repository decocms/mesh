import {
  SidebarHeader as SidebarHeaderUI,
  SidebarMenu,
  SidebarMenuItem,
} from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { MeshAccountSwitcher } from "./account-switcher";

export function MeshSidebarHeader() {
  return (
    <SidebarHeaderUI className="px-2 animate-in fade-in-0 duration-200">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex flex-col w-full items-center">
            <MeshAccountSwitcher />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderUI>
  );
}

MeshSidebarHeader.Skeleton = function MeshSidebarHeaderSkeleton() {
  return (
    <SidebarHeaderUI className="px-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 min-w-0 flex-1 p-1.5">
              <Skeleton className="size-8 rounded-md shrink-0 bg-sidebar-accent" />
              <Skeleton className="h-3.5 w-16 bg-sidebar-accent" />
            </div>
            <div className="flex items-center gap-0.5">
              <Skeleton className="size-7 rounded-lg bg-sidebar-accent" />
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderUI>
  );
};
