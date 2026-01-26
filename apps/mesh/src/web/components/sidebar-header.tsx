import { useState } from "react";
import {
  SidebarHeader as SidebarHeaderUI,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@deco/ui/components/sidebar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  ChevronLeftDouble,
  ChevronRightDouble,
  SearchSm,
} from "@untitledui/icons";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { MeshAccountSwitcher } from "./account-switcher";

export function MeshSidebarHeader() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isHovering, setIsHovering] = useState(false);

  return (
    <SidebarHeaderUI className="h-12 gap-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between w-full h-12">
            {/* Left side: Account Switcher */}
            <div
              className="flex items-center gap-1.5 min-w-0 flex-1"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              {/* When collapsed and hovering, show expand icon */}
              {isCollapsed && isHovering ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 hover:bg-sidebar-accent"
                  onClick={toggleSidebar}
                  aria-label="Expand sidebar"
                >
                  <ChevronRightDouble className="size-4 text-muted-foreground shrink-0" />
                </Button>
              ) : (
                <MeshAccountSwitcher isCollapsed={isCollapsed} />
              )}
            </div>

            {/* Right side: Collapse and Search icons */}
            {!isCollapsed && (
              <div className="flex items-center gap-0.5 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 hover:bg-sidebar-accent"
                      onClick={toggleSidebar}
                      aria-label="Collapse sidebar"
                    >
                      <ChevronLeftDouble className="size-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Collapse sidebar
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 hover:bg-sidebar-accent"
                      aria-label="Search"
                    >
                      <SearchSm size={11} className="text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Search</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderUI>
  );
}

MeshSidebarHeader.Skeleton = function MeshSidebarHeaderSkeleton() {
  return (
    <SidebarHeaderUI className="h-12 gap-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between w-full h-12">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 px-1.5">
              <Skeleton className="size-5 rounded-[5px] shrink-0" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="flex items-center gap-0.5">
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="size-7 rounded-lg" />
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderUI>
  );
};
