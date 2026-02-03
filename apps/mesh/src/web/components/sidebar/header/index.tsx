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
  Locator,
  ORG_ADMIN_PROJECT_SLUG,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowNarrowLeft,
  ChevronLeftDouble,
  ChevronRightDouble,
  LayoutLeft,
  MessageChatSquare,
} from "@untitledui/icons";
import { MeshAccountSwitcher } from "./account-switcher";
import { ProjectSwitcher } from "../project-switcher";

interface MeshSidebarHeaderProps {
  onCreateProject?: () => void;
}

export function MeshSidebarHeader({ onCreateProject }: MeshSidebarHeaderProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isChatOpen, setChatOpen] = useDecoChatOpen();
  const { locator, org } = useProjectContext();
  const isOrgAdmin = Locator.isOrgAdminProject(locator);
  const navigate = useNavigate();

  const toggleChat = () => {
    setChatOpen((prev) => !prev);
  };

  const handleBackToOrg = () => {
    navigate({
      to: "/$org/$project",
      params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
    });
  };

  // For projects (non-org-admin): Dark themed header with back arrow + project switcher
  if (!isOrgAdmin) {
    return (
      <SidebarHeaderUI className="h-[47px] gap-0 pt-0 bg-[#030302] border-b border-zinc-800 border-r">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-center w-full h-[47px] px-2">
              {isCollapsed ? (
                // Collapsed: just show expand button
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  onClick={toggleSidebar}
                  aria-label="Expand sidebar"
                >
                  <ChevronRightDouble className="size-4" />
                </Button>
              ) : (
                // Expanded: show full header
                <div className="flex items-center justify-between w-full">
                  {/* Back Arrow */}
                  <button
                    type="button"
                    onClick={handleBackToOrg}
                    className="flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
                    aria-label="Back to organization"
                  >
                    <ArrowNarrowLeft className="size-4" />
                  </button>

                  {/* Project Switcher - Dark variant */}
                  <div className="flex-1 min-w-0 mx-2">
                    <ProjectSwitcher
                      variant="dark"
                      hideIcon
                      onCreateProject={onCreateProject}
                    />
                  </div>

                  {/* Sidebar Toggle */}
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    className="flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
                    aria-label="Collapse sidebar"
                  >
                    <LayoutLeft className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeaderUI>
    );
  }

  // Org-admin: Show account switcher with collapse/chat controls (light theme)
  return (
    <SidebarHeaderUI className="h-12 gap-0 pt-0 border-r">
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
                <MeshAccountSwitcher isCollapsed={isCollapsed} />
              </div>
              {/* Expand icon - shown when collapsed and hovering */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute inset-0 m-auto size-7 hover:bg-sidebar-accent transition-opacity",
                  isCollapsed
                    ? "opacity-0 invisible pointer-events-none group-hover/switcher:opacity-100 group-hover/switcher:visible group-hover/switcher:pointer-events-auto"
                    : "opacity-0 invisible pointer-events-none",
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
