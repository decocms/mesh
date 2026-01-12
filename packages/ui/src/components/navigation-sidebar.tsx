import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./sidebar.tsx";
import { Skeleton } from "./skeleton.tsx";

export interface NavigationSidebarItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  isActive?: boolean;
}

interface NavigationSidebarProps {
  navigationItems: NavigationSidebarItem[];
  header?: ReactNode;
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
  header,
  footer,
  additionalContent,
  variant = "sidebar",
  collapsible = "icon",
}: NavigationSidebarProps) {
  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      {header && <SidebarHeader className="p-0">{header}</SidebarHeader>}
      <SidebarContent className="flex-1 overflow-x-hidden">
        <SidebarGroup className="font-medium mt-1.5 px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground h-7 px-2 gap-2"
                    onClick={item.onClick}
                    isActive={item.isActive}
                    tooltip={item.label}
                  >
                    <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
                      {item.icon}
                    </span>
                    <span className="truncate text-sm">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {additionalContent}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {footer && (
        <SidebarFooter className="border-t border-border py-2 px-2 mt-1.5">
          {footer}
        </SidebarFooter>
      )}
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
