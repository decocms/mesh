import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { useRouterState } from "@tanstack/react-router";
import {
  useOrganizationSettings,
  useOrganizationSettingsActions,
} from "../hooks/collections/use-organization-settings";
import { useProjectContext } from "../providers/project-context-provider";

interface PinToSidebarButtonProps {
  connectionId: string;
  title: string;
  icon: string;
}

/**
 * Reusable button component for pinning/unpinning views to the sidebar
 */
export function PinToSidebarButton({
  connectionId,
  title,
  icon,
}: PinToSidebarButtonProps) {
  const routerState = useRouterState();
  const url = routerState.location.href;
  const { org } = useProjectContext();
  const settings = useOrganizationSettings(org.id);
  const actions = useOrganizationSettingsActions(org.id);

  const isPinned = !!settings?.sidebar_items?.some((item) => item.url === url);

  const handleTogglePin = async () => {
    const currentItems = settings?.sidebar_items || [];
    let updatedItems: typeof currentItems;

    if (isPinned) {
      // Unpin: delete the item
      updatedItems = currentItems.filter((item) => item.url !== url);
    } else {
      // Insert new item
      updatedItems = [...currentItems, { title, url, connectionId, icon }];
    }

    await actions.update.mutateAsync({
      sidebar_items: updatedItems,
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={handleTogglePin}
            size="icon"
            variant={isPinned ? "secondary" : "outline"}
            className="size-8 border border-input"
          >
            <Icon name="keep" size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isPinned ? "Pinned" : "Pin to sidebar"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
