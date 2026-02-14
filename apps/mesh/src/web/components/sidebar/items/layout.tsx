import { PropsWithChildren } from "react";
import {
  SidebarMenuItem,
  SidebarSeparator,
} from "@deco/ui/components/sidebar.tsx";

export function SidebarItemLayout({ children }: PropsWithChildren) {
  return (
    <>
      <SidebarSeparator className="my-2 -ml-1" />
      <SidebarMenuItem>
        <div className="px-2 py-0 text-xs font-medium h-6 text-muted-foreground flex items-center">
          <span className="group-data-[collapsible=icon]:hidden whitespace-nowrap">
            Pinned Views
          </span>
          <div className="hidden group-data-[collapsible=icon]:block mx-auto w-4 h-px bg-border" />
        </div>
      </SidebarMenuItem>
      {children}
    </>
  );
}
