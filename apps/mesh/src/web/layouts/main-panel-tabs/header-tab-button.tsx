/**
 * HeaderTabButton — a tab in the agent-shell header tab bar.
 *
 * Two visual states driven by the `active` prop:
 *   - idle (inactive): icon-only square button.
 *   - active: expanded pill with icon + title (accent colors).
 *
 * Every button is wrapped in a Tooltip showing the tab title so the
 * title is discoverable on hover in both states.
 */

import { Package } from "@untitledui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
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
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          aria-label={title}
          className={cn(
            "shrink-0 flex items-center h-8 rounded-md transition-colors",
            active ? "px-2 gap-1.5" : "px-1.5",
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <span className="flex size-5 items-center justify-center shrink-0">
            <Icon icon={icon} />
          </span>
          {active && (
            <span className="text-xs font-medium leading-none whitespace-nowrap">
              {title}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
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
