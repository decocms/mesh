import type { ReactNode } from "react";
import { useState } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible.tsx";
import { ChevronRight } from "@untitledui/icons";

export interface NavigationSidebarItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  isActive?: boolean;
}

interface NavigationSidebarProps {
  navigationItems: NavigationSidebarItem[];
  footer?: ReactNode;
  additionalContent?: ReactNode;
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  defaultNavigationOpen?: boolean;
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
  defaultNavigationOpen = true,
}: NavigationSidebarProps) {
  const [isNavigationOpen, setIsNavigationOpen] = useState(
    defaultNavigationOpen,
  );

  // Separate top-level items from accordion items
  const topLevelKeys = ["home"];
  const topLevelItems = navigationItems.filter((item) =>
    topLevelKeys.includes(item.key),
  );
  const accordionItems = navigationItems.filter(
    (item) => !topLevelKeys.includes(item.key) && item.key !== "settings",
  );

  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      <SidebarContent className="flex-1 overflow-x-hidden">
        <SidebarGroup className="font-medium">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {/* Top-level items outside accordion */}
              {topLevelItems.map((item) => (
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
            </SidebarMenu>
          </SidebarGroupContent>

          {/* Separator between top-level and Navigation */}
          <SidebarSeparator className="my-2 -ml-1" />

          {/* Other navigation items in accordion */}
          {accordionItems.length > 0 && (
            <Collapsible
              open={isNavigationOpen}
              onOpenChange={setIsNavigationOpen}
            >
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="w-full flex items-center gap-1 hover:bg-sidebar-accent rounded-md px-2 h-7! py-0! group-data-[collapsible=icon]:hidden">
                  <span className="text-xs font-medium text-muted-foreground">
                    Default
                  </span>
                  <ChevronRight
                    className={`size-3 transition-transform text-muted-foreground ${isNavigationOpen ? "rotate-90" : ""}`}
                  />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {accordionItems.map((item) => (
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
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          )}
        </SidebarGroup>
        {additionalContent}
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
