/**
 * HeaderTabButton — a tab in the agent-shell header tab bar.
 *
 * Three visual states driven by props + CSS hover:
 *   - idle (inactive, not hovered): icon-only square button.
 *   - active: expanded pill with icon + title (accent colors).
 *   - hover (inactive): inline-expanded pill with icon + title
 *     (neutral hover styling). Implemented via a group-hover width
 *     transition on the title span.
 */

import { Package } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import type { TabIcon } from "./resolve-tab-icon";

export function HeaderTabButton({
  title,
  icon,
  active,
  onClick,
}: {
  title: string;
  icon: TabIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "group/tab shrink-0 flex items-center h-8 rounded-md transition-colors",
        active ? "px-2 gap-1.5" : "px-1.5 hover:px-2 hover:gap-1.5",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span className="flex size-5 items-center justify-center shrink-0">
        <Icon icon={icon} />
      </span>
      <span
        className={cn(
          "text-xs font-medium leading-none whitespace-nowrap",
          "overflow-hidden transition-all duration-150 ease-out",
          active
            ? "max-w-[200px] opacity-100"
            : "max-w-0 opacity-0 group-hover/tab:max-w-[200px] group-hover/tab:opacity-100",
        )}
      >
        {title}
      </span>
    </button>
  );
}

function Icon({ icon }: { icon: TabIcon }) {
  if (icon.kind === "component") {
    const { Component } = icon;
    return <Component className="size-4" />;
  }
  if (icon.kind === "url") {
    return (
      <img src={icon.src} alt="" className="size-4 rounded-sm object-cover" />
    );
  }
  return <Package className="size-4" />;
}
