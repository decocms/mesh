import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/web/lib/auth-client";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { ChevronDown } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { UserPanel } from "./user-panel";
import { OrgPanel } from "./org-panel";
import { CreateOrganizationDialog } from "@/web/components/create-organization-dialog";
import { UserSettingsDialog } from "@/web/components/user-settings-dialog";

interface MeshAccountSwitcherProps {
  isCollapsed?: boolean;
}

export function MeshAccountSwitcher({
  isCollapsed = false,
}: MeshAccountSwitcherProps) {
  const { org } = useParams({ strict: false });
  const { data: organizations } = authClient.useListOrganizations();
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  const currentOrg = organizations?.find(
    (organization) => organization.slug === org,
  );

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creatingOrganization, setCreatingOrganization] = useState(false);

  const user = session?.user;
  const userImage = (user as { image?: string } | undefined)?.image;

  const handleOrgSettings = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org/$project/org-settings",
      params: { org: orgSlug, project: "org-admin" },
    });
  };

  const handleSelectOrg = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org/$project",
      params: { org: orgSlug, project: "org-admin" },
    });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 min-w-0 max-w-full hover:bg-sidebar-accent",
              isCollapsed ? "justify-center" : "justify-start",
              isCollapsed ? "" : "pl-0.5! px-1.5 gap-1.5",
            )}
          >
            <Avatar
              url={currentOrg?.logo ?? ""}
              fallback={currentOrg?.name ?? ""}
              size="xs"
              className="shrink-0 rounded-[5px]"
              objectFit="cover"
            />
            {!isCollapsed && (
              <>
                <span className="truncate text-[14px] tracking-[-0.00625rem] font-medium text-foreground text-left">
                  {currentOrg?.name ?? "Select org"}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
              </>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          className="p-0 flex w-auto h-88 overflow-hidden"
        >
          {user && (
            <UserPanel
              user={user}
              userImage={userImage}
              onOpenSettings={() => {
                setSettingsOpen(true);
                setOpen(false);
              }}
            />
          )}
          <OrgPanel
            currentOrgSlug={org}
            onOrgSelect={handleSelectOrg}
            onOrgSettings={handleOrgSettings}
            onPopoverClose={() => setOpen(false)}
            onCreateOrganization={() => setCreatingOrganization(true)}
          />
        </PopoverContent>
      </Popover>

      {user && settingsOpen && user.email && (
        <UserSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          user={{ ...user, name: user.name ?? undefined, email: user.email }}
          userImage={userImage}
        />
      )}

      <CreateOrganizationDialog
        open={creatingOrganization}
        onOpenChange={setCreatingOrganization}
      />
    </>
  );
}

MeshAccountSwitcher.Skeleton = function MeshAccountSwitcherSkeleton() {
  return (
    <div className="flex items-center gap-1.5 h-7 px-1.5 w-full">
      <Skeleton className="size-5 rounded-[5px] shrink-0" />
      <Skeleton className="h-3.5 flex-1" />
    </div>
  );
};
