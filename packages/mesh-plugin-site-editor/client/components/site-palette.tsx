/**
 * Site Palette — Command palette for site selection
 *
 * Searchable command palette listing all site connections with status indicators.
 * Includes "Add site..." action for connecting new projects.
 */

import { Check, Plus } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandEmpty,
} from "@deco/ui/components/command.tsx";
import { useSiteStore } from "../lib/site-store";

interface SitePaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchSite: (connectionId: string) => void;
  onAddSite: () => void;
}

const statusDotColor: Record<string, string> = {
  active: "bg-green-500",
  error: "bg-red-500",
  inactive: "bg-gray-400",
};

function SitePalette({
  open,
  onOpenChange,
  onSwitchSite,
  onAddSite,
}: SitePaletteProps) {
  const { sites, activeSiteId } = useSiteStore();

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Switch site"
      description="Search and select a site connection"
    >
      <CommandInput placeholder="Search sites..." />
      <CommandList>
        <CommandEmpty>No sites found.</CommandEmpty>
        <CommandGroup heading="Sites">
          {sites.map((site) => {
            const isActive = site.connectionId === activeSiteId;
            const isDisconnected = site.status !== "active";

            return (
              <CommandItem
                key={site.connectionId}
                value={`${site.displayName} ${site.projectPath}`}
                onSelect={() => {
                  onSwitchSite(site.connectionId);
                  onOpenChange(false);
                }}
                className={cn(isDisconnected && "opacity-50")}
              >
                <span
                  className={cn(
                    "size-2 rounded-full shrink-0",
                    statusDotColor[site.status] ?? "bg-gray-400",
                  )}
                />
                <div className={cn("flex flex-col flex-1 min-w-0")}>
                  <span
                    className={cn("text-sm truncate", isActive && "font-bold")}
                  >
                    {site.displayName}
                    {isDisconnected && (
                      <span
                        className={cn("text-muted-foreground font-normal ml-1")}
                      >
                        (disconnected)
                      </span>
                    )}
                  </span>
                  <span
                    className={cn("text-xs text-muted-foreground truncate")}
                  >
                    {site.projectPath}
                  </span>
                </div>
                {isActive && (
                  <Check size={14} className={cn("text-primary shrink-0")} />
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              onAddSite();
              onOpenChange(false);
            }}
          >
            <Plus size={14} />
            <span>Add site...</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default SitePalette;
