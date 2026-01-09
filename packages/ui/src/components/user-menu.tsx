import {
  ResponsiveDropdown,
  ResponsiveDropdownContent,
  ResponsiveDropdownItem,
  ResponsiveDropdownSeparator,
  ResponsiveDropdownTrigger,
} from "./responsive-dropdown.tsx";
import type { ReactNode } from "react";

interface UserData {
  avatar?: string;
  name?: string;
  email?: string;
}

interface UserMenuProps {
  user: UserData;
  trigger: (user: UserData) => ReactNode;
  align?: "start" | "end";
  children: ReactNode;
}

interface UserMenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  asChild?: boolean;
}

interface UserMenuSeparatorProps {
  className?: string;
}

function UserMenuRoot({
  user,
  trigger,
  align: _align = "start",
  children,
}: UserMenuProps) {
  return (
    <ResponsiveDropdown>
      <ResponsiveDropdownTrigger asChild className="w-full">
        {trigger(user)}
      </ResponsiveDropdownTrigger>
      <ResponsiveDropdownContent
        side="top"
        align="end"
        alignOffset={-32}
        className="md:w-[240px]"
      >
        {children}
      </ResponsiveDropdownContent>
    </ResponsiveDropdown>
  );
}

function UserMenuItem({
  children,
  onClick,
  className,
  asChild,
}: UserMenuItemProps) {
  return (
    <ResponsiveDropdownItem asChild={asChild} className={className}>
      {asChild ? (
        children
      ) : (
        <button
          type="button"
          className="flex items-center gap-2 text-sm w-full cursor-pointer"
          onClick={onClick}
        >
          {children}
        </button>
      )}
    </ResponsiveDropdownItem>
  );
}

function UserMenuSeparator({ className }: UserMenuSeparatorProps) {
  return <ResponsiveDropdownSeparator className={className} />;
}

function UserMenuSkeleton() {
  return <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />;
}

export const UserMenu = Object.assign(UserMenuRoot, {
  Item: UserMenuItem,
  Separator: UserMenuSeparator,
  Skeleton: UserMenuSkeleton,
});
