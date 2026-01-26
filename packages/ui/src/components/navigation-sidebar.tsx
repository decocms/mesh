import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "./sidebar.tsx";
import { Skeleton } from "./skeleton.tsx";

export interface NavigationSidebarItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  isActive?: boolean;
}

export interface NavigationSidebarGroup {
  key: string;
  label?: string;
  items: NavigationSidebarItem[];
}

interface NavigationSidebarProps {
  /** @deprecated Use `groups` instead for grouped navigation */
  navigationItems?: NavigationSidebarItem[];
  /** Grouped navigation items with optional section labels */
  groups?: NavigationSidebarGroup[];
  header?: ReactNode;
  footer?: ReactNode;
  additionalContent?: ReactNode;
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}

function NavigationItemsList({ items }: { items: NavigationSidebarItem[] }) {
  return (
    <>
      {items.map((item) => (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton
            className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
            onClick={item.onClick}
            isActive={item.isActive}
            tooltip={item.label}
          >
            <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  );
}

/**
 * Generic navigation sidebar that can be used for any context (projects, orgs, etc.)
 * Accepts a list of navigation items and optional footer/additional content.
 */
export function NavigationSidebar({
  navigationItems,
  groups,
  header,
  footer,
  additionalContent,
  variant = "sidebar",
  collapsible = "icon",
}: NavigationSidebarProps) {
  // Support legacy flat list by converting to single group
  const resolvedGroups: NavigationSidebarGroup[] = groups ?? [
    { key: "main", items: navigationItems ?? [] },
  ];

  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      {header}
      <SidebarContent className="flex-1 overflow-x-hidden">
        {resolvedGroups.map((group, index) => (
          <SidebarGroup key={group.key} className="font-medium py-0">
            {index > 0 && <SidebarSeparator className="my-2" />}
            {group.label && (
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground h-6 px-2">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <NavigationItemsList items={group.items} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup className="font-medium py-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">{additionalContent}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {footer}
    </Sidebar>
  );
}

NavigationSidebar.Skeleton = function NavigationSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="w-full h-8">
          <Skeleton className="h-full bg-sidebar-accent rounded-md" />
        </div>
      ))}
    </div>
  );
};
