/**
 * HeaderTabButton — a tab in the agent-shell header tab bar.
 *
 * Two visual states driven by the `active` prop:
 *   - idle (inactive): icon-only square button.
 *   - active: expanded pill with icon + title (accent colors).
 *
 * Pill animation uses a single unified transition (180ms ease-out-cubic) on
 * all properties so the expand/collapse reads as one clean motion rather than
 * staggered layers. Kept simple on purpose — tab bars are seen constantly.
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
    <Tooltip delayDuration={700}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          aria-label={title}
          className={cn(
            "shrink-0 grid items-center h-7 rounded-md overflow-hidden",
            "[transition:grid-template-columns_180ms_var(--ease-out-cubic),gap_180ms_var(--ease-out-cubic),padding_180ms_var(--ease-out-cubic),background-color_180ms_ease,color_180ms_ease]",
            active
              ? "grid-cols-[auto_1fr] gap-1.5 px-2"
              : "grid-cols-[auto_0fr] gap-0 px-1.5",
            active
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <span className="flex size-5 items-center justify-center">
            <Icon icon={icon} />
          </span>
          <span
            aria-hidden={!active}
            className={cn(
              "whitespace-nowrap text-sm font-medium leading-none min-w-0",
              "[transition:opacity_180ms_ease]",
              active ? "opacity-100" : "opacity-0",
            )}
          >
            {title}
          </span>
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
