import { useState, useContext } from "react";
import { authClient } from "@/web/lib/auth-client";
import { AuthUIContext } from "@daveyplate/better-auth-ui";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@deco/ui/components/sidebar.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Inbox01 } from "@untitledui/icons";
import type { Invitation } from "../../types";
import { InvitationItem } from "./invitation-item";

export function SidebarInboxFooter() {
  const [open, setOpen] = useState(false);
  const authUi = useContext(AuthUIContext);
  const { data: _invitations } = authUi.hooks.useListUserInvitations();
  const { data: organizations } = authClient.useListOrganizations();
  const [localStatusOverrides, setLocalStatusOverrides] = useState<
    Record<string, string>
  >({});

  const rawInvitations = (_invitations ?? []) as Invitation[];

  const validInvitations = rawInvitations.filter(
    (inv) => new Date(inv.expiresAt) > new Date(),
  );

  const enrichedInvitations = validInvitations.map((inv) => {
    const org = (organizations ?? []).find((o) => o.id === inv.organizationId);
    return {
      ...inv,
      organizationSlug: org?.slug || inv.organizationSlug,
      organizationName: org?.name || inv.organizationName,
    };
  });

  const invitations = enrichedInvitations.map((inv) => ({
    ...inv,
    status: localStatusOverrides[inv.id] || inv.status,
  }));

  const sortedInvitations = [...invitations].sort((a, b) => {
    const statusOrder = { pending: 0, accepted: 1, rejected: 2 };
    return (
      (statusOrder[a.status as keyof typeof statusOrder] ?? 999) -
      (statusOrder[b.status as keyof typeof statusOrder] ?? 999)
    );
  });

  const pendingInvitations = invitations.filter(
    (inv) => inv.status === "pending",
  );
  const hasPendingInvites = pendingInvitations.length > 0;

  const handleStatusChange = (id: string, newStatus: string) => {
    setLocalStatusOverrides((prev) => ({
      ...prev,
      [id]: newStatus,
    }));
  };

  return (
    <SidebarFooter className="border-t border-border pt-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <SidebarMenuButton
                className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground relative"
                tooltip="Inbox"
              >
                <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
                  <Inbox01 />
                </span>
                <span className="truncate">Inbox</span>
                {hasPendingInvites && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
                )}
              </SidebarMenuButton>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[480px] p-0 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Inbox</h3>
              </div>
              <div className="max-h-96 overflow-auto">
                {sortedInvitations.length > 0 ? (
                  sortedInvitations.map((invitation) => (
                    <InvitationItem
                      key={invitation.id}
                      invitation={invitation}
                      onStatusChange={handleStatusChange}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Inbox01
                      size={32}
                      className="text-muted-foreground/40 mb-2"
                    />
                    <p className="text-sm text-muted-foreground">
                      No invitations at the moment
                    </p>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
