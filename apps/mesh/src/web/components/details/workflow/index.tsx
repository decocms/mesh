import { Workflow } from "@decocms/bindings/workflow";
import {
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
  WorkflowStoreProvider,
} from "@/web/components/details/workflow/stores/workflow";
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
import { ViewLayout } from "../layout";
import { useParams } from "@tanstack/react-router";
import {
  useCollectionActions,
  useCollectionItem,
} from "@/web/hooks/use-collections";
import { createToolCaller, UNKNOWN_CONNECTION_ID } from "@/tools/client";
import { EmptyState } from "@/web/components/empty-state";

interface WorkflowDetailsViewProps {
  itemId: string;
  onBack: () => void;
}

export function WorkflowDetailsView({
  itemId,
  onBack,
}: WorkflowDetailsViewProps) {
  const { connectionId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });
  const connId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(connId);
  const item = useCollectionItem<Workflow>(
    connId,
    "WORKFLOW",
    itemId,
    toolCaller,
  );
  const actions = useCollectionActions<Workflow>(
    connId,
    "WORKFLOW",
    toolCaller,
  );

  /** This makes it so when the workflow is update on the server, the store is updated */
  const keyFlow = JSON.stringify(item);

  const update = async (updates: Partial<Workflow>): Promise<void> => {
    await actions.update.mutateAsync({
      id: itemId,
      data: updates,
    });
  };

  if (!item) {
    return (
      <ViewLayout onBack={onBack}>
        <div className="flex h-full w-full bg-background">
          <EmptyState
            title="Workflow not found"
            description="This workflow may have been deleted or you may not have access to it."
          />
        </div>
      </ViewLayout>
    );
  }

  return (
    <WorkflowStoreProvider key={keyFlow} workflow={item}>
      <WorkflowDetails onBack={onBack} onUpdate={update} />
    </WorkflowStoreProvider>
  );
}

interface WorkflowDetailsProps {
  onBack: () => void;
  onUpdate: (updates: Partial<Workflow>) => Promise<void>;
}

function WorkflowCode({
  workflow,
  onUpdate,
}: {
  workflow: Workflow;
  onUpdate: (updates: Partial<Workflow>) => Promise<void>;
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
    <ViewLayout onBack={onBack}>
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <WorkflowEditorHeader
          title={workflow.title}
          description={workflow.description}
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
    </ViewLayout>
  );
}
