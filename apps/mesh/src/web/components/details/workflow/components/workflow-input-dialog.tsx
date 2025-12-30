import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { Play } from "@untitledui/icons";
import { ToolInput } from "./tool-selection/components/tool-input";
import type { JsonSchema } from "@/web/utils/constants";

interface WorkflowInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputSchema: JsonSchema;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
  isPending?: boolean;
}

export function WorkflowInputDialog({
  open,
  onOpenChange,
  inputSchema,
  onSubmit,
  isPending,
}: WorkflowInputDialogProps) {
  const [inputParams, setInputParams] = useState<Record<string, unknown>>({});

  const handleSubmit = async () => {
    await onSubmit(inputParams);
    onOpenChange(false);
    setInputParams({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setInputParams({});
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Workflow Input</DialogTitle>
          <DialogDescription>
            This workflow requires input values to run. Fill in the fields below
            to start the execution.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <ToolInput
            inputSchema={inputSchema}
            inputParams={inputParams}
            setInputParams={setInputParams}
            mentions={[]}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
            {isPending ? <Spinner size="xs" /> : <Play size={14} />}
            Run Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
