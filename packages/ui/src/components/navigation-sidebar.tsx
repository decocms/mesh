import { ReactNode } from "react";
import { Icon } from "./icon.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./sidebar.tsx";
import { Skeleton } from "./skeleton.tsx";

export interface NavigationSidebarItem {
  key: string;
  label: string;
  icon: string;
  onClick: () => void;
  isActive?: boolean;
}

interface NavigationSidebarProps {
  navigationItems: NavigationSidebarItem[];
  footer?: ReactNode;
  additionalContent?: ReactNode;
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}

/**
 * Generic navigation sidebar that can be used for any context (projects, orgs, etc.)
 * Accepts a list of navigation items and optional footer/additional content.
 */
export function NavigationSidebar({
  navigationItems,
  footer,
  additionalContent,
  variant = "sidebar",
  collapsible = "icon",
}: NavigationSidebarProps) {
  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      <SidebarContent className="flex-1 overflow-x-hidden">
        <SidebarGroup className="font-medium">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    className="cursor-pointer"
                    onClick={item.onClick}
                    isActive={item.isActive}
                    tooltip={item.label}
                  >
                    <Icon
                      name={item.icon}
                      size={20}
                      className="text-muted-foreground/75"
                    />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {additionalContent}
            </SidebarMenu>
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
