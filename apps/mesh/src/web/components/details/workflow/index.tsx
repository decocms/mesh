import { Spinner } from "@deco/ui/components/spinner.tsx";
import { Workflow } from "@decocms/bindings/workflow";
import {
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
  WorkflowStoreProvider,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowCollectionItem } from "./hooks";
import { toast } from "@deco/ui/components/sonner.tsx";
import { MonacoCodeEditor } from "./components/monaco-editor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deco/ui/components/resizable.js";
import { Button } from "@deco/ui/components/button.js";
import { Eye, X } from "lucide-react";
import { WorkflowEditorHeader } from "./components/workflow-editor-header";
import { WorkflowStepsCanvas } from "./components/workflow-steps-canvas";
import { ToolSidebar } from "./components/tool-sidebar";
import { StepDetailPanel } from "./components/step-detail-panel";
import { ExecutionsList } from "./components/executions-list";
import { useViewModeStore } from "./stores/view-mode";
import { useCurrentStep } from "./stores/workflow";

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

interface WorkflowDetailsProps {
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
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

function WorkflowDetails({ onBack, onUpdate }: WorkflowDetailsProps) {
  const workflow = useWorkflow();
  const trackingExecutionId = useTrackingExecutionId();
  const { setTrackingExecutionId, setOriginalWorkflow } = useWorkflowActions();
  const { viewMode, showExecutionsList } = useViewModeStore();
  const currentStep = useCurrentStep();

  const handleSave = async () => {
    await onUpdate(workflow);
    setOriginalWorkflow(workflow);
  };

  // Determine which sidebar to show
  const isToolStep = currentStep && "toolName" in currentStep.action;
  const hasToolSelected =
    isToolStep &&
    "toolName" in currentStep.action &&
    currentStep.action.toolName;
  const showStepDetail = hasToolSelected;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <WorkflowEditorHeader
        title={workflow.title}
        description={workflow.description}
        onBack={onBack}
        onSave={handleSave}
      />

      {/* Tracking Execution Bar */}
      {trackingExecutionId && (
        <div className="h-10 bg-accent flex items-center justify-between border-b border-border">
          <div className="flex">
            <div className="flex items-center justify-center h-full w-12">
              <Eye className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setTrackingExecutionId(undefined)}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "code" ? (
          <WorkflowCode workflow={workflow} onUpdate={onUpdate} />
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            className="flex w-full h-full"
          >
            {/* Steps Canvas Panel */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <WorkflowStepsCanvas />
            </ResizablePanel>

            <ResizableHandle />

            {/* Right Panel - Executions List OR Step Config */}
            <ResizablePanel defaultSize={50} minSize={25}>
              {showExecutionsList ? (
                <ExecutionsList />
              ) : showStepDetail ? (
                <StepDetailPanel className="border-l border-border" />
              ) : (
                <ToolSidebar className="border-l border-border" />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
