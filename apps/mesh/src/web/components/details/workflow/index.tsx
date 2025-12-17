import { Spinner } from "@deco/ui/components/spinner.tsx";
import {
  Workflow,
  WorkflowExecutionWithStepResults,
} from "@decocms/bindings/workflow";
import { ViewActions, ViewLayout, ViewTabs } from "../layout";
import { WorkflowSteps } from "./components/steps/index";
import {
  useCurrentStepName,
  useCurrentTab,
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
  WorkflowStoreProvider,
} from "@/web/components/details/workflow/stores/workflow";
import {
  useWorkflowCollectionItem,
  useWorkflowExecutionCollectionItem,
  useWorkflowExecutionCollectionList,
} from "./hooks/use-workflow-collection-item";
import { WorkflowActions } from "./components/actions";
import { StepTabs, WorkflowTabs } from "./components/tabs";
import { toast } from "@deco/ui/components/sonner.tsx";
import { MonacoCodeEditor } from "./components/monaco-editor";
import { Check, ChevronsUpDown, ClockIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.js";
import {
  Command,
  CommandItem,
  CommandGroup,
  CommandList,
  CommandInput,
  CommandEmpty,
} from "@deco/ui/components/command.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.js";
import { Button } from "@deco/ui/components/button.js";
import { useState } from "react";
import { cn } from "@deco/ui/lib/utils.js";
export interface WorkflowDetailsViewProps {
  itemId: string;
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

export function WorkflowDetailsView({
  itemId,
  onBack,
}: WorkflowDetailsViewProps) {
  const { item, update } = useWorkflowCollectionItem(itemId);

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <WorkflowStoreProvider workflow={item}>
      <WorkflowDetails
        onBack={onBack}
        onUpdate={async (updates) => {
          try {
            update(updates);
            toast.success("Workflow updated successfully");
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to update workflow",
            );
            throw error;
          }
        }}
      />
    </WorkflowStoreProvider>
  );
}

export function WorkflowExecutionDetailsView({
  itemId,
  onBack,
}: WorkflowDetailsViewProps) {
  const { item } = useWorkflowExecutionCollectionItem(itemId);
  const { item: workflow, update: updateWorkflow } = useWorkflowCollectionItem(
    item?.workflow_id ?? "",
  );
  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <WorkflowStoreProvider workflow={workflow} trackingExecutionId={itemId}>
      <WorkflowDetails
        onBack={onBack}
        onUpdate={async (updates) => {
          try {
            updateWorkflow(updates);
            toast.success("Workflow updated successfully");
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to update workflow",
            );
            throw error;
          }
        }}
      />
    </WorkflowStoreProvider>
  );
}

interface WorkflowDetailsProps {
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

export interface StreamResponse {
  item: WorkflowExecutionWithStepResults | null;
  error?: string;
}

function WorkflowCode({
  workflow,
  onUpdate,
}: {
  workflow: Workflow;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const { setWorkflow } = useWorkflowActions();
  const wf = {
    title: workflow.title,
    description: workflow.description,
    steps: workflow.steps,
  };
  return (
    <MonacoCodeEditor
      key={`workflow-${workflow.id}`}
      height="100%"
      code={JSON.stringify(wf, null, 2)}
      language="json"
      onSave={(code) => {
        const parsed = JSON.parse(code);
        setWorkflow({
          ...workflow,
          ...parsed,
        });
        onUpdate(parsed);
      }}
    />
  );
}

export function useIsExecutionScheduled(id?: string) {
  const { item: execution } = useWorkflowExecutionCollectionItem(id);
  const currentTime = Date.now();
  return (
    (execution?.start_at_epoch_ms ?? 0) > currentTime &&
    execution?.status !== "success" &&
    execution?.status !== "error"
  );
}

export function ExecutionScheduleTooltip({ id }: { id?: string }) {
  const { item: execution } = useWorkflowExecutionCollectionItem(id);
  return (
    <Tooltip>
      <TooltipTrigger>
        <ClockIcon size={12} />
      </TooltipTrigger>
      <TooltipContent>
        <p>
          This execution is scheduled to start at{" "}
          {new Date(execution?.start_at_epoch_ms ?? 0).toLocaleString()}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function ExecutionSelect() {
  const [open, setOpen] = useState(false);
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });
  const trackingExecutionId = useTrackingExecutionId();
  const { setTrackingExecutionId } = useWorkflowActions();

  const currentIndex = executions.findIndex(
    (execution) => execution.id === trackingExecutionId,
  );

  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const nextIndex =
        currentIndex < executions.length - 1 ? currentIndex + 1 : 0;
      setTrackingExecutionId(executions[nextIndex]?.id);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIndex =
        currentIndex > 0 ? currentIndex - 1 : executions.length - 1;
      setTrackingExecutionId(executions[prevIndex]?.id);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-controls={`execution-select-${workflow.id}`}
          aria-labelledby={`execution-select-${workflow.id}`}
          aria-expanded={open}
          className="w-[200px] justify-between"
          onKeyDown={handleKeyNavigation}
        >
          {trackingExecutionId
            ? new Date(
                executions.find(
                  (execution) => execution.id === trackingExecutionId,
                )?.created_at ?? 0,
              ).toLocaleString()
            : "Select execution..."}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" onKeyDown={handleKeyNavigation}>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search execution..." className="h-9" />
          <CommandList>
            <CommandEmpty>No execution found.</CommandEmpty>
            <CommandGroup>
              {executions.map((execution) => (
                <CommandItem
                  key={execution.id}
                  value={execution.id}
                  onSelect={(currentValue) => {
                    setTrackingExecutionId(
                      currentValue === trackingExecutionId
                        ? undefined
                        : execution.id,
                    );
                    setOpen(false);
                  }}
                >
                  {new Date(execution.created_at).toLocaleString()}-{" "}
                  {execution.status}
                  <Check
                    className={cn(
                      "ml-auto",
                      trackingExecutionId === execution.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function WorkflowDetails({ onBack, onUpdate }: WorkflowDetailsProps) {
  const currentTab = useCurrentTab();
  const currentStepName = useCurrentStepName();
  const workflow = useWorkflow();
  return (
    <ViewLayout onBack={onBack}>
      <ViewTabs>
        <div className="flex items-center gap-3 font-sans">
          <h2 className="text-base font-normal text-foreground">
            {workflow.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {workflow.description}
          </p>
        </div>
      </ViewTabs>

      <ViewActions>
        <ExecutionSelect />
        <WorkflowActions onUpdate={onUpdate} />
      </ViewActions>

      {/* Main Content */}
      <div className="flex w-full h-full bg-background overflow-hidden relative">
        <div className="absolute top-4 left-4 z-50">
          <WorkflowTabs />
        </div>
        <div className="flex-1 h-full">
          {currentTab === "steps" ? (
            <WorkflowSteps />
          ) : (
            <div className="h-[calc(100%-60px)]">
              <WorkflowCode workflow={workflow} onUpdate={onUpdate} />
            </div>
          )}
        </div>
        {currentStepName && currentTab === "steps" && <StepTabs />}
      </div>
    </ViewLayout>
  );
}
