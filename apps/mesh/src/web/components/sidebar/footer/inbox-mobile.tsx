import { AccountPopover } from "@/web/components/account-popover";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@decocms/ui/components/sidebar.tsx";
import { Settings02 } from "@untitledui/icons";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";

export function SidebarInboxFooterMobile() {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Settings"
            onClick={() => {
              navigate({
                to: "/$org/settings",
                params: { org: org.slug },
              });
              setOpenMobile(false);
            }}
          >
            <Settings02 />
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <AccountPopover />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
