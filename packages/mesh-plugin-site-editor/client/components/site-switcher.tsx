/**
 * Site Switcher — Top bar component
 *
 * Shows the current active site with a colored status dot and a "+" button
 * for adding new sites. Clicking the site name opens the command palette.
 */

import { ChevronDown, Plus } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { useSiteStore } from "../lib/site-store";

interface SiteSwitcherProps {
  onOpenPalette: () => void;
  onAddSite: () => void;
}

const statusDotColor: Record<string, string> = {
  active: "bg-green-500",
  error: "bg-red-500",
  inactive: "bg-gray-400",
};

function SiteSwitcher({ onOpenPalette, onAddSite }: SiteSwitcherProps) {
  const { sites, activeSiteId } = useSiteStore();
  const activeSite = sites.find((s) => s.connectionId === activeSiteId);

  return (
    <div className={cn("flex items-center gap-1")}>
      <button
        type="button"
        onClick={onOpenPalette}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md",
          "border border-border bg-background hover:bg-accent transition-colors",
        )}
      >
        {activeSite ? (
          <>
            <span
              className={cn(
                "size-2 rounded-full shrink-0",
                statusDotColor[activeSite.status] ?? "bg-gray-400",
              )}
            />
            <span className={cn("text-sm font-medium truncate max-w-[180px]")}>
              {activeSite.displayName}
            </span>
          </>
        ) : (
          <span className={cn("text-sm text-muted-foreground")}>
            No site selected
          </span>
        )}
        <ChevronDown size={14} className={cn("text-muted-foreground")} />
      </button>
      <button
        type="button"
        onClick={onAddSite}
        className={cn(
          "inline-flex items-center justify-center size-8 rounded-md",
          "border border-border bg-background hover:bg-accent transition-colors",
        )}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default SiteSwitcher;
