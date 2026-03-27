import { cn } from "@deco/ui/lib/utils.ts";
import type { ReactNode } from "react";
import type { NavigationSidebarItem, SidebarSection } from "./types";

function MobileNavItem({
  item,
  onClose,
}: {
  item: NavigationSidebarItem;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        item.onClick?.();
        onClose();
      }}
      className={cn(
        "flex size-10 items-center justify-center rounded-lg transition-colors",
        item.isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
      title={item.label}
    >
      <span className="[&>svg]:size-5">{item.icon}</span>
    </button>
  );
}

interface MobileNavigationSidebarProps {
  sections: SidebarSection[];
  onClose: () => void;
  footer?: ReactNode;
  additionalContent?: ReactNode;
}

export function MobileNavigationSidebar({
  sections,
  onClose,
  footer,
  additionalContent,
}: MobileNavigationSidebarProps) {
  return (
    <div className="flex flex-col h-full pt-4 pb-3 gap-1.5">
      {sections.map((section, index) => {
        switch (section.type) {
          case "items":
            return (
              <div key={index} className="flex flex-col items-center gap-1.5">
                {section.items.map((item) => (
                  <MobileNavItem key={item.key} item={item} onClose={onClose} />
                ))}
              </div>
            );
          case "group":
            return (
              <div key={index} className="flex flex-col items-center gap-1.5">
                {section.group.items.map((item) => (
                  <MobileNavItem key={item.key} item={item} onClose={onClose} />
                ))}
              </div>
            );
          case "divider":
            return <div key={index} className="h-px bg-border mx-2 my-1" />;
          case "spacer":
            return <div key={index} className="flex-1" />;
        }
      })}
      {additionalContent}
      <div className="flex-1" />
      {footer}
    </div>
  );
}
