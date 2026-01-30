import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { Button } from "@deco/ui/components/button.tsx";
import {
  SidebarHeader as SidebarHeaderUI,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ChevronLeftDouble,
  ChevronRightDouble,
  MessageChatSquare,
} from "@untitledui/icons";
import { MeshAccountSwitcher } from "./account-switcher";

export function MeshSidebarHeader() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isChatOpen, setChatOpen] = useDecoChatOpen();

  const toggleChat = () => {
    setChatOpen((prev) => !prev);
  };

  return (
    <SidebarHeaderUI className="h-12 gap-0 pt-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between w-full h-12">
            {/* Left side: Account Switcher */}
            <div className="group/account-switcher relative flex items-center justify-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              {/* Account switcher - hidden when collapsed and hovering */}
              <div
                className={cn(
                  "w-full min-w-0",
                  isCollapsed &&
                    "group-hover/account-switcher:opacity-0 group-hover/account-switcher:pointer-events-none transition-opacity",
                )}
              >
                <MeshAccountSwitcher isCollapsed={isCollapsed} />
              </div>
              {/* Expand icon - shown when collapsed and hovering */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute inset-0 m-auto size-7 hover:bg-sidebar-accent transition-opacity",
                  isCollapsed
                    ? "opacity-0 group-hover/account-switcher:opacity-100 pointer-events-none group-hover/account-switcher:pointer-events-auto"
                    : "opacity-0 pointer-events-none",
                )}
                onClick={toggleSidebar}
                aria-label="Expand sidebar"
                disabled={!isCollapsed}
              >
                <ChevronRightDouble className="size-4 text-muted-foreground shrink-0" />
              </Button>
            </div>

            {/* Right side: Collapse and Decopilot toggle icons */}
            <div
              className={cn(
                "flex items-center gap-0.5 shrink-0",
                isCollapsed && "hidden",
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:bg-sidebar-accent"
                    onClick={toggleSidebar}
                    aria-label="Collapse sidebar"
                    disabled={isCollapsed}
                  >
                    <ChevronLeftDouble className="size-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Collapse sidebar</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-7 hover:bg-sidebar-accent",
                      isChatOpen && "bg-sidebar-accent",
                    )}
                    onClick={toggleChat}
                    aria-label="Toggle Decopilot"
                    disabled={isCollapsed}
                  >
                    <MessageChatSquare
                      size={11}
                      className="text-muted-foreground"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle Decopilot</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderUI>
  );
}

MeshSidebarHeader.Skeleton = function MeshSidebarHeaderSkeleton() {
  return (
    <SidebarHeaderUI className="h-12 gap-0 pt-0">
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
