import { useState } from "react";
import { authClient } from "@/web/lib/auth-client";
import { UserSettingsDialog } from "@/web/components/user-settings-dialog";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  UserCircle,
  Lock01,
  Settings04,
  BookOpen01,
  LogOut02,
  ArrowUpRight,
} from "@untitledui/icons";
import { GitHubIcon } from "@daveyplate/better-auth-ui";
import { toast } from "sonner";
import { MenuItem } from "./menu-item";

interface UserPanelProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  userImage?: string;
  onSettingsOpenChange: (open: boolean) => void;
}

export function UserPanel({
  user,
  userImage,
  onSettingsOpenChange,
}: UserPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleCopyUserInfo = async () => {
    if (!user) return;
    const userInfo = `ID: ${user.id}\nName: ${user.name || "N/A"}\nEmail: ${user.email}`;
    try {
      await navigator.clipboard.writeText(userInfo);
      toast.success("User info copied to clipboard");
    } catch {
      toast.error("Failed to copy user info to clipboard");
    }
  };

  return (
    <>
      <div className="flex flex-col gap-0.5 bg-sidebar min-w-[250px]">
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
              onSettingsOpenChange(false);
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
      </div>

      {user && settingsOpen && user.email && (
        <UserSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          user={{ ...user, name: user.name ?? undefined, email: user.email }}
          userImage={userImage}
        />
      )}
    </>
  );
}
