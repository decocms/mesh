import { UserMenu } from "@deco/ui/components/user-menu.tsx";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import {
  UserCircle,
  Globe01,
  LogOut01,
  LinkExternal01,
} from "@untitledui/icons";
import { authClient } from "@/web/lib/auth-client";
import { GitHubIcon } from "@daveyplate/better-auth-ui";
import { useState } from "react";
import { UserSettingsDialog } from "@/web/components/user-settings-dialog.tsx";

function MeshUserMenuBase({
  user,
  userImage,
}: {
  user: { id: string; name?: string; email: string };
  userImage?: string;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <UserMenu
        user={user}
        trigger={() => (
          <Avatar
            url={userImage}
            fallback={user.name || user.email || "U"}
            shape="circle"
            size="sm"
            className="cursor-pointer hover:ring-2 ring-muted-foreground transition-all h-7 w-7"
          />
        )}
        align="end"
      >
        <UserMenu.Item onClick={() => setSettingsOpen(true)}>
          <UserCircle className="text-muted-foreground" size={18} />
          Settings
        </UserMenu.Item>

        <UserMenu.Separator />

        <UserMenu.Item asChild>
          <a
            href="https://github.com/decocms/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2 text-sm cursor-pointer"
          >
            <GitHubIcon className="w-4 h-4 text-muted-foreground" />
            decocms/admin
            <LinkExternal01
              size={18}
              className="text-muted-foreground ml-auto"
            />
          </a>
        </UserMenu.Item>
        <UserMenu.Item asChild>
          <a
            href="https://decocms.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2 text-sm cursor-pointer"
          >
            <Globe01 className="text-muted-foreground" size={18} />
            Homepage
            <LinkExternal01
              size={18}
              className="ml-auto text-muted-foreground"
            />
          </a>
        </UserMenu.Item>

        <UserMenu.Separator />

        <UserMenu.Item onClick={() => authClient.signOut()}>
          <LogOut01 size={18} className="text-muted-foreground" />
          Log out
        </UserMenu.Item>
      </UserMenu>

      {settingsOpen && (
        <UserSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          user={user}
          userImage={userImage}
        />
      )}
    </>
  );
}

export function MeshUserMenu() {
  const { data: session } = authClient.useSession();

  // Return skeleton/placeholder if no session yet
  if (!session?.user) {
    return (
      <Avatar
        url={undefined}
        fallback="U"
        shape="circle"
        size="sm"
        className="cursor-pointer h-7 w-7"
        muted
      />
    );
  }

  const user = session.user;
  const userMenuUser = {
    ...user,
    name: user.name ?? undefined,
  } as typeof user;
  const userImage = (user as { image?: string }).image;

  return <MeshUserMenuBase user={userMenuUser} userImage={userImage} />;
}
