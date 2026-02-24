import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Locator, useProjectContext } from "@decocms/mesh-sdk";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@deco/ui/components/sidebar.tsx";
import { Settings02 } from "@untitledui/icons";

export function SidebarSettingsFooter() {
  const { locator } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();

  const currentPath = routerState.location.pathname;
  const isActive = currentPath.includes("/settings");

  const handleClick = () => {
    navigate({
      to: "/$org/$project/settings",
      params: Locator.parse(locator),
    });
  };

  return (
    <SidebarFooter className="px-3.5 pb-3 group-data-[collapsible=icon]:px-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={handleClick}
            isActive={isActive}
            tooltip="Settings"
          >
            <span className="[&>svg]:size-4">
              <Settings02 />
            </span>
            <span className="truncate group-data-[collapsible=icon]:hidden">
              Settings
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
