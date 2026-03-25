/**
 * Add Starter Popover for automation triggers.
 * Provides quick schedule presets and custom cron input.
 */

import { useAutomationTriggerAdd } from "@/web/hooks/use-automations";
import { SCHEDULE_UNITS } from "@/web/lib/cron-utils.ts";
import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Clock, Plus } from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";

export function AddStarterPopover({
  automationId,
  open,
  onOpenChange,
  onCustomSelect,
}: {
  automationId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCustomSelect?: () => void;
}) {
  const addTrigger = useAutomationTriggerAdd();
  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = open ?? internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange ? onOpenChange(newOpen) : setInternalOpen(newOpen);
  };

  const submitCron = async (cron: string) => {
    try {
      await addTrigger.mutateAsync({
        automation_id: automationId,
        type: "cron",
        cron_expression: cron,
      });
      toast.success("Starter added");
      handleOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add starter";
      toast.error(message);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus size={14} />
          Add Starter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2.5">
            <Clock size={14} className="text-muted-foreground shrink-0" />
            Every...
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[160px]">
            {SCHEDULE_UNITS.map((unit) => (
              <DropdownMenuItem
                key={unit.cron}
                className="gap-2.5"
                onSelect={() => submitCron(unit.cron)}
                disabled={addTrigger.isPending}
              >
                <Clock size={14} className="text-muted-foreground shrink-0" />
                Every {unit.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem
          className="gap-2.5"
          onSelect={() => {
            handleOpenChange(false);
            onCustomSelect?.();
          }}
        >
          <Clock size={14} className="text-muted-foreground shrink-0" />
          Custom (cron)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
