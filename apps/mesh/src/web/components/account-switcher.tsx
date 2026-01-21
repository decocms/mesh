import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/web/lib/auth-client";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import { UserSettingsDialog } from "./user-settings-dialog";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import {
  ChevronDown,
  UserCircle,
  Lock01,
  Settings04,
  BookOpen01,
  LogOut02,
  ArrowUpRight,
  Plus,
  Settings02,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { GitHubIcon } from "@daveyplate/better-auth-ui";
import { toast } from "sonner";

// Match sidebar menu button styling exactly
// Sidebar uses: text-sm, font-[450], gap-2, px-2
const menuItemStyles =
  "w-full h-8 justify-start gap-2 px-2 text-sm font-[450] text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent active:bg-sidebar-accent/75 [&>svg]:size-[18px] [&>svg]:text-muted-foreground hover:[&>svg]:text-sidebar-foreground";

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
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const user = session?.user;
  const userImage = (user as { image?: string } | undefined)?.image;

  const handleCopyUserInfo = () => {
    if (!user) return;
    const userInfo = `ID: ${user.id}\nName: ${user.name || "N/A"}\nEmail: ${user.email}`;
    navigator.clipboard.writeText(userInfo);
    toast.success("User info copied to clipboard");
  };

  const handleOrgSettings = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org/settings",
      params: { org: orgSlug },
    });
  };

  const handleSelectOrg = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org",
      params: { org: orgSlug },
    });
  };

  // Sort orgs: current first, then alphabetically
  const sortedOrganizations = [...(organizations ?? [])].sort((a, b) => {
    if (a.slug === org) return -1;
    if (b.slug === org) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1.5 pl-0.5! px-1.5 justify-start min-w-0 max-w-full hover:bg-sidebar-accent",
              isCollapsed && "justify-center",
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
          {/* Left Panel - User Account */}
          <div className="flex flex-col gap-0.5 bg-sidebar min-w-[250px]">
            {user && (
              <>
                {/* User Info */}
                <Button
                  variant="ghost"
                  onClick={handleCopyUserInfo}
                  className="h-auto p-2 m-1 mb-0 justify-start gap-2 hover:bg-sidebar-accent hover:text-inherit active:bg-sidebar-accent/75"
                >
                  <Avatar
                    url={userImage}
                    fallback={user.name || user.email || "U"}
                    shape="circle"
                    size="sm"
                    className="size-8 shrink-0"
                  />
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-sm text-sidebar-foreground truncate font-[450]">
                      {user.name || "User"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate font-normal">
                      {user.email}
                    </span>
                  </div>
                </Button>

                {/* Menu Items */}
                <div className="p-1 flex flex-col">
                  <MenuItem
                    onClick={() => {
                      setOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <UserCircle size={18} />
                    Profile
                  </MenuItem>

                  <MenuItem>
                    <Lock01 size={18} />
                    Security & Access
                  </MenuItem>

                  <MenuItem>
                    <Settings04 size={18} />
                    Preferences
                  </MenuItem>

                  <MenuItem asChild>
                    <a
                      href="https://www.decocms.com/terms-of-use"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <BookOpen01 size={18} />
                      <span className="flex-1">Terms & Conditions</span>
                      <ArrowUpRight size={14} />
                    </a>
                  </MenuItem>

                  <MenuItem asChild>
                    <a
                      href="https://github.com/decocms/mesh"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <GitHubIcon className="size-[18px]" />
                      <span className="flex-1">decocms/mesh</span>
                      <ArrowUpRight size={14} />
                    </a>
                  </MenuItem>

                  <MenuItem onClick={() => authClient.signOut()}>
                    <LogOut02 size={18} />
                    Log out
                  </MenuItem>
                </div>
              </>
            )}
          </div>

          {/* Right Panel - Organizations */}
          <div className="flex flex-col min-w-[275px] border-l border-border">
            {/* Header */}
            <div className="flex items-center justify-between h-10 px-3 border-b border-border">
              <span className="text-xs text-muted-foreground truncate">
                Your Organizations
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => {
                  setOpen(false);
                  setCreatingOrganization(true);
                }}
              >
                <Plus size={16} className="text-muted-foreground" />
              </Button>
            </div>

            {/* Org list */}
            <div className="flex flex-col gap-0.5 p-1 flex-1 overflow-y-auto">
              {sortedOrganizations.map((organization) => (
                <OrgItem
                  key={organization.slug}
                  org={organization}
                  isActive={organization.slug === org}
                  onClick={() => handleSelectOrg(organization.slug)}
                  onSettings={() => handleOrgSettings(organization.slug)}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <CreateOrganizationDialog
        open={creatingOrganization}
        onOpenChange={setCreatingOrganization}
      />

      {user && settingsOpen && (
        <UserSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          user={{ ...user, name: user.name ?? undefined }}
          userImage={userImage}
        />
      )}
    </>
  );
}

function OrgItem({
  org,
  isActive,
  onClick,
  onSettings,
}: {
  org: { slug: string; name: string; logo?: string | null };
  isActive?: boolean;
  onClick?: () => void;
  onSettings?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const showSettings = isActive || isHovered;

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-center gap-2 w-full justify-start font-normal h-10 px-2 rounded-lg cursor-pointer transition-colors hover:bg-accent/50",
        isActive && "bg-accent hover:bg-accent",
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Avatar
        url={org.logo ?? undefined}
        fallback={org.name}
        size="sm"
        className="size-6 shrink-0 rounded-md"
        objectFit="cover"
      />
      <span className="flex-1 text-sm text-foreground truncate text-left min-w-0">
        {org.name}
      </span>
      {/* Settings button - always reserve space to prevent CLS */}
      {onSettings && showSettings ? (
        <button
          type="button"
          aria-label={`${org.name} settings`}
          className="size-5 shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
        >
          <Settings02 size={16} className="text-muted-foreground" />
        </button>
      ) : (
        <span className="size-5 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}

function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(menuItemStyles, className)}
      {...props}
    />
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
