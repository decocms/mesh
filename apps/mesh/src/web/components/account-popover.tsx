import { useState } from "react";
import { useNavigate, useMatch } from "@tanstack/react-router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@deco/ui/components/select.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deco/ui/components/toggle-group.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Bell01,
  Check,
  Code01,
  Copy01,
  File06,
  Globe01,
  LogOut01,
  Monitor01,
  Moon01,
  Plus,
  Settings01,
  Shield01,
  Sun,
  Users03,
} from "@untitledui/icons";
import { GitHubIcon } from "@daveyplate/better-auth-ui";
import { SidebarMenuButton } from "@deco/ui/components/sidebar.tsx";
import { authClient } from "@/web/lib/auth-client";
import { CreateOrganizationDialog } from "@/web/components/create-organization-dialog";
import { usePreferences, type ThemeMode } from "@/web/hooks/use-preferences.ts";
import { toast } from "@deco/ui/components/sonner.js";

type PanelView = "organizations" | "preferences";

function getOrgColorStyle(name: string): {
  backgroundColor: string;
  color: string;
} {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return {
    backgroundColor: `hsl(${h} 55% 70%)`,
    color: `hsl(${h} 55% 20%)`,
  };
}

function OrgIcon({
  org,
  size = "sm",
}: {
  org: { name: string; logo?: string | null };
  size?: "xs" | "sm";
}) {
  const sizeClass = size === "xs" ? "size-5" : "size-6";
  const textClass = size === "xs" ? "text-[9px]" : "text-xs";

  return (
    <div
      className={cn(
        sizeClass,
        "shrink-0 rounded-md flex items-center justify-center border border-border/50 overflow-hidden",
      )}
      style={org.logo ? undefined : getOrgColorStyle(org.name)}
    >
      {org.logo ? (
        <img src={org.logo} alt="" className="size-full object-cover" />
      ) : (
        <span className={cn("font-semibold leading-none", textClass)}>
          {org.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}

function MenuItemButton({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  const baseClass =
    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left w-full transition-colors text-foreground/80 hover:bg-sidebar-accent hover:text-foreground";

  if (item.href) {
    return (
      <a
        href={item.href}
        target={item.external ? "_blank" : undefined}
        rel={item.external ? "noopener noreferrer" : undefined}
        className={baseClass}
        onClick={onClose}
      >
        <span className="shrink-0 text-muted-foreground">{item.icon}</span>
        <span className="flex-1">{item.label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        item.onClick?.();
        onClose();
      }}
      className={baseClass}
    >
      <span className="shrink-0 text-muted-foreground">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
    </button>
  );
}

function OrganizationsPanel({
  sortedOrgs,
  orgParam,
  onSelectOrg,
  onCreateOrg,
}: {
  sortedOrgs: Array<{
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  }>;
  orgParam?: string;
  onSelectOrg: (slug: string) => void;
  onCreateOrg: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground/60">
          Your Organizations
        </span>
        <button
          type="button"
          onClick={onCreateOrg}
          className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1">
        {sortedOrgs.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => onSelectOrg(org.slug)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left w-full transition-colors",
              org.slug === orgParam
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent/50",
            )}
          >
            <OrgIcon org={org} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{org.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {org.slug}
              </p>
            </div>
            {org.slug === orgParam && (
              <Check
                size={14}
                className="ml-auto text-muted-foreground shrink-0"
              />
            )}
          </button>
        ))}
      </div>
    </>
  );
}

function PreferenceRow({
  icon,
  label,
  control,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  control: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1.5"
      onClick={disabled ? undefined : onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{ cursor: onClick && !disabled ? "pointer" : undefined }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        {control}
      </div>
    </div>
  );
}

function PreferencesPanel() {
  const [preferences, setPreferences] = usePreferences();

  const handleNotificationsChange = async (checked: boolean) => {
    if (checked) {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        toast.error(
          "Notifications denied. Please enable them in your browser settings.",
        );
        setPreferences((prev) => ({ ...prev, enableNotifications: false }));
        return;
      }
    }
    setPreferences((prev) => ({ ...prev, enableNotifications: checked }));
  };

  return (
    <div className="flex flex-col px-4 py-3 gap-1">
      <PreferenceRow
        icon={<Sun size={14} />}
        label="Theme"
        control={
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={preferences.theme}
            onValueChange={(value) => {
              if (value) {
                setPreferences((prev) => ({
                  ...prev,
                  theme: value as ThemeMode,
                }));
              }
            }}
          >
            <ToggleGroupItem value="light" aria-label="Light theme">
              <Sun size={14} />
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Dark theme">
              <Moon01 size={14} />
            </ToggleGroupItem>
            <ToggleGroupItem value="system" aria-label="System theme">
              <Monitor01 size={14} />
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />
      <PreferenceRow
        icon={<Code01 size={14} />}
        label="Developer Mode"
        onClick={() =>
          setPreferences((prev) => ({ ...prev, devMode: !prev.devMode }))
        }
        control={
          <Switch
            checked={preferences.devMode}
            onCheckedChange={(checked) =>
              setPreferences((prev) => ({ ...prev, devMode: checked }))
            }
          />
        }
      />
      <PreferenceRow
        icon={<Bell01 size={14} />}
        label="Notifications"
        disabled={typeof Notification === "undefined"}
        onClick={() =>
          handleNotificationsChange(!preferences.enableNotifications)
        }
        control={
          <Switch
            disabled={typeof Notification === "undefined"}
            checked={preferences.enableNotifications}
            onCheckedChange={handleNotificationsChange}
          />
        }
      />
      <PreferenceRow
        icon={<Shield01 size={14} />}
        label="Tool Approval"
        control={
          <Select
            value={preferences.toolApprovalLevel}
            onValueChange={(value) =>
              setPreferences((prev) => ({
                ...prev,
                toolApprovalLevel: value as "auto" | "readonly" | "plan",
              }))
            }
          >
            <SelectTrigger className="w-28 h-7 text-xs">
              <span>
                {
                  {
                    readonly: "Skip read-only",
                    auto: "Auto-approve",
                    plan: "Plan mode",
                  }[preferences.toolApprovalLevel]
                }
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="readonly" textValue="Skip read-only">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Skip read-only</span>
                  <span className="text-xs text-muted-foreground">
                    Auto-approve read-only tools
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="auto" textValue="Auto-approve all">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Auto-approve all</span>
                  <span className="text-xs text-muted-foreground">
                    Execute all without approval
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="plan" textValue="Plan mode">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Plan mode</span>
                  <span className="text-xs text-muted-foreground">
                    Read-only, then propose a plan
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
}

export function AccountPopover() {
  const { data: session } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();
  const navigate = useNavigate();
  const orgMatch = useMatch({ from: "/shell/$org", shouldThrow: false });
  const orgParam = orgMatch?.params.org;

  const [open, setOpen] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelView>("organizations");

  const user = session?.user;
  const userImage = (user as { image?: string } | undefined)?.image;

  const currentOrg = organizations?.find(
    (o: { slug: string }) => o.slug === orgParam,
  );

  const sortedOrgs = [...(organizations ?? [])].sort((a, b) => {
    if (a.slug === orgParam) return -1;
    if (b.slug === orgParam) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelectOrg = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org",
      params: { org: orgSlug },
    });
  };

  const close = () => setOpen(false);

  const menuItems: MenuItem[] = [
    {
      key: "terms",
      label: "Terms of Use",
      icon: <File06 size={16} />,
      href: "https://www.decocms.com/terms-of-use",
      external: true,
    },
    {
      key: "privacy",
      label: "Privacy Policy",
      icon: <Shield01 size={16} />,
      href: "https://www.decocms.com/privacy-policy",
      external: true,
    },
    {
      key: "github",
      label: "decocms/mesh",
      icon: <GitHubIcon className="w-4 h-4" />,
      href: "https://github.com/decocms/mesh",
      external: true,
    },
    {
      key: "community",
      label: "Community",
      icon: <Users03 size={16} />,
      href: "https://decocms.com/discord",
      external: true,
    },
    {
      key: "homepage",
      label: "Homepage",
      icon: <Globe01 size={16} />,
      href: "https://decocms.com",
      external: true,
    },
  ];

  const signOutItem: MenuItem = {
    key: "logout",
    label: "Sign out",
    icon: <LogOut01 size={16} />,
    onClick: () => authClient.signOut(),
  };

  const navItemClass = (view: PanelView) =>
    cn(
      "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left w-full transition-colors",
      activePanel === view
        ? "bg-sidebar-accent text-foreground"
        : "text-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
    );

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setActivePanel("organizations");
        }}
      >
        <PopoverTrigger asChild>
          <SidebarMenuButton
            tooltip={currentOrg?.name ?? "Account"}
            className="rounded-md"
          >
            <div
              className="shrink-0 size-6 rounded-md flex items-center justify-center border border-border/50 overflow-hidden"
              style={
                currentOrg?.logo
                  ? undefined
                  : getOrgColorStyle(currentOrg?.name ?? "")
              }
            >
              {currentOrg?.logo ? (
                <img
                  src={currentOrg.logo}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="font-semibold leading-none text-[9px]">
                  {(currentOrg?.name ?? "?").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          </SidebarMenuButton>
        </PopoverTrigger>

        <PopoverContent
          side="right"
          align="end"
          sideOffset={18}
          collisionPadding={16}
          className="w-[520px] p-0 flex"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex min-h-[380px] w-full">
            {/* Left panel */}
            <div className="w-60 shrink-0 flex flex-col border-r border-border bg-sidebar/75">
              {/* User info */}
              <div className="flex items-center gap-3 px-4 py-3 mx-1 mt-1">
                <Avatar
                  url={userImage}
                  fallback={user?.name ?? "U"}
                  shape="circle"
                  size="sm"
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user?.name ?? "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          if (!user?.id) return;
                          navigator.clipboard.writeText(user.id).then(() => {
                            toast.success("User ID copied");
                          });
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy01 size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs">Copy user ID</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Navigation items */}
              <nav className="flex-1 flex flex-col px-2 pt-1">
                {/* Organizations */}
                <button
                  type="button"
                  autoFocus
                  className={cn(navItemClass("organizations"))}
                  onMouseEnter={() => setActivePanel("organizations")}
                >
                  <span className="shrink-0 text-muted-foreground">
                    <Users03 size={16} />
                  </span>
                  <span className="flex-1">Organizations</span>
                </button>

                {/* Preferences */}
                <button
                  type="button"
                  className={cn(navItemClass("preferences"))}
                  onMouseEnter={() => setActivePanel("preferences")}
                >
                  <span className="shrink-0 text-muted-foreground">
                    <Settings01 size={16} />
                  </span>
                  <span className="flex-1">Preferences</span>
                </button>

                {/* Divider */}
                <div className="my-2 border-t border-border" />

                {/* External links */}
                {menuItems.map((item) => (
                  <MenuItemButton key={item.key} item={item} onClose={close} />
                ))}
                <MenuItemButton item={signOutItem} onClose={close} />

                <div className="flex-1" />
                <div className="px-3 py-1.5">
                  <span className="text-xs text-muted-foreground/60">
                    v{__MESH_VERSION__}
                  </span>
                </div>
              </nav>
            </div>

            {/* Right panel - contextual */}
            <div className="flex-1 flex flex-col min-w-0">
              {activePanel === "organizations" && (
                <OrganizationsPanel
                  sortedOrgs={sortedOrgs}
                  orgParam={orgParam}
                  onSelectOrg={handleSelectOrg}
                  onCreateOrg={() => {
                    setOpen(false);
                    setCreatingOrg(true);
                  }}
                />
              )}
              {activePanel === "preferences" && <PreferencesPanel />}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <CreateOrganizationDialog
        open={creatingOrg}
        onOpenChange={setCreatingOrg}
      />
    </>
  );
}
