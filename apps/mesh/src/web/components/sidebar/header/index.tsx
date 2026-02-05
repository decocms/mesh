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
import { Locator, useProjectContext } from "@decocms/mesh-sdk";
import {
  ChevronLeftDouble,
  ChevronRightDouble,
  MessageChatSquare,
} from "@untitledui/icons";
import { MeshAccountSwitcher } from "./account-switcher";

interface MeshSidebarHeaderProps {
  onCreateProject?: () => void;
}

export function MeshSidebarHeader({ onCreateProject }: MeshSidebarHeaderProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isChatOpen, setChatOpen] = useDecoChatOpen();
  const { locator } = useProjectContext();
  const isOrgAdmin = Locator.isOrgAdminProject(locator);

  // Dark variant for project sidebar, light for org-admin
  const isDark = !isOrgAdmin;

  const toggleChat = () => {
    setChatOpen((prev) => !prev);
  };

  return (
    <SidebarHeaderUI
      className={cn(
        "h-12 gap-0 pt-0 border-r",
        isDark && "bg-[#030302] border-b border-zinc-800",
      )}
    >
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between w-full h-12">
            {/* Left side: Account Switcher */}
            <div className="group/switcher relative flex items-center justify-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              {/* Switcher - hidden when collapsed and hovering */}
              <div
                className={cn(
                  "w-full min-w-0 transition-opacity",
                  isCollapsed &&
                    "group-hover/switcher:opacity-0 group-hover/switcher:pointer-events-none group-hover/switcher:invisible",
                )}
              >
                <MeshAccountSwitcher
                  isCollapsed={isCollapsed}
                  variant={isDark ? "dark" : "light"}
                  onCreateProject={onCreateProject}
                />
              </div>
              {/* Expand icon - shown when collapsed and hovering */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute inset-0 m-auto size-7 transition-opacity",
                  isDark
                    ? "hover:bg-zinc-800 text-zinc-400"
                    : "hover:bg-sidebar-accent",
                  isCollapsed
                    ? "opacity-0 invisible pointer-events-none group-hover/switcher:opacity-100 group-hover/switcher:visible group-hover/switcher:pointer-events-auto"
                    : "opacity-0 invisible pointer-events-none",
                )}
                onClick={toggleSidebar}
                aria-label="Expand sidebar"
                disabled={!isCollapsed}
              >
                <ChevronRightDouble
                  className={cn(
                    "size-4 shrink-0",
                    isDark ? "text-zinc-400" : "text-muted-foreground",
                  )}
                />
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
                    className={cn(
                      "size-7",
                      isDark
                        ? "hover:bg-zinc-800 text-zinc-400 hover:text-white"
                        : "hover:bg-sidebar-accent",
                    )}
                    onClick={toggleSidebar}
                    aria-label="Collapse sidebar"
                    disabled={isCollapsed}
                  >
                    <ChevronLeftDouble
                      className={cn(
                        "size-4",
                        isDark ? "text-zinc-400" : "text-muted-foreground",
                      )}
                    />
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
                      "size-7",
                      isDark
                        ? cn(
                            "hover:bg-zinc-800 text-zinc-400 hover:text-white",
                            isChatOpen && "bg-zinc-800 text-white",
                          )
                        : cn(
                            "hover:bg-sidebar-accent",
                            isChatOpen && "bg-sidebar-accent",
                          ),
                    )}
                    onClick={toggleChat}
                    aria-label="Toggle Decopilot"
                    disabled={isCollapsed}
                  >
                    <MessageChatSquare
                      size={11}
                      className={
                        isDark ? "text-inherit" : "text-muted-foreground"
                      }
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

MeshSidebarHeader.Skeleton = function MeshSidebarHeaderSkeleton({
  isDark = false,
}: {
  isDark?: boolean;
}) {
  return (
    <SidebarHeaderUI
      className={cn(
        "h-12 gap-0 pt-0",
        isDark && "bg-[#030302] border-b border-zinc-800",
      )}
    >
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between w-full h-12">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 px-1.5">
              <Skeleton
                className={cn(
                  "size-5 rounded-[5px] shrink-0",
                  isDark && "bg-zinc-800",
                )}
              />
              <Skeleton className={cn("h-3.5 w-16", isDark && "bg-zinc-800")} />
            </div>
            <div className="flex items-center gap-0.5">
              <Skeleton
                className={cn("size-7 rounded-lg", isDark && "bg-zinc-800")}
              />
              <Skeleton
                className={cn("size-7 rounded-lg", isDark && "bg-zinc-800")}
              />
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderUI>
  );
};
