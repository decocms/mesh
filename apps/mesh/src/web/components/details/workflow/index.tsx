import {
  ToolCallAction,
  Workflow,
  WorkflowExecution,
} from "@decocms/bindings/workflow";
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared hook for workflow/execution data
// ─────────────────────────────────────────────────────────────────────────────

type WorkflowMode = "workflow" | "execution";

interface UseWorkflowDataParams {
  itemId: string;
  mode: WorkflowMode;
}

function useWorkflowData({ itemId, mode }: UseWorkflowDataParams) {
  const { connectionId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });
  const connId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(connId);

  const collectionName =
    mode === "workflow" ? "WORKFLOW" : "WORKFLOW_EXECUTION";

  const item = useCollectionItem<Workflow | WorkflowExecution>(
    connId,
    collectionName,
    itemId,
    toolCaller,
  );

  const actions = useCollectionActions<Workflow | WorkflowExecution>(
    connId,
    collectionName,
    toolCaller,
  );

  const update = async (updates: Partial<Workflow>): Promise<void> => {
    await actions.update.mutateAsync({
      id: itemId,
      data: updates,
    });
  };

  return {
    item,
    update,
    trackingExecutionId: mode === "execution" ? itemId : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Workflow View Component
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowDetailsViewProps {
  itemId: string;
  onBack: () => void;
}

interface UnifiedWorkflowViewProps extends WorkflowDetailsViewProps {
  mode: WorkflowMode;
}

function UnifiedWorkflowView({
  itemId,
  onBack,
  mode,
}: UnifiedWorkflowViewProps) {
  const { item, update, trackingExecutionId } = useWorkflowData({
    itemId,
    mode,
  });

  /** This makes it so when the workflow is updated on the server, the store is updated */
  const keyFlow = JSON.stringify(item);

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

  // Normalize to Workflow type (WorkflowExecution has nullable description)
  const workflow: Workflow = {
    ...item,
    description: item.description ?? undefined,
  };

  return (
    <WorkflowStoreProvider
      key={keyFlow}
      initialState={{
        workflow,
        trackingExecutionId,
        currentStepTab: mode === "execution" ? "action" : "executions",
      }}
    >
      <WorkflowDetails onBack={onBack} onUpdate={update} />
    </WorkflowStoreProvider>
  );
}

export function WorkflowDetailsView(props: WorkflowDetailsViewProps) {
  return <UnifiedWorkflowView {...props} mode="workflow" />;
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

function WorkflowExecutionBar() {
  const { setTrackingExecutionId } = useWorkflowActions();
  const trackingExecutionId = useTrackingExecutionId();

  return (
    <div className="h-10 bg-accent flex items-center justify-between border-b border-border">
      <div className="flex items-center h-full">
        <div className="flex items-center justify-center h-full w-12">
          <Eye className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="flex gap-3 items-center h-full">
          <strong className="text-base text-foreground">Run</strong>
          <span className="text-sm text-muted-foreground">
            #{trackingExecutionId}
          </span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setTrackingExecutionId(undefined)}
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function WorkflowDetails({ onBack, onUpdate }: WorkflowDetailsProps) {
  const workflow = useWorkflow();
  const trackingExecutionId = useTrackingExecutionId();
  const { setOriginalWorkflow } = useWorkflowActions();
  const { viewMode, showExecutionsList } = useViewModeStore();
  const currentStep = useCurrentStep();

  const handleSave = async () => {
    await onUpdate(workflow);
    setOriginalWorkflow(workflow);
  };

  const isToolStep = currentStep && "toolName" in currentStep.action;
  const toolName = isToolStep
    ? (currentStep.action as ToolCallAction).toolName
    : null;
  const showToolSidebar = isToolStep && !toolName && !trackingExecutionId;
  const showStepDetail =
    !showToolSidebar &&
    (currentStep || trackingExecutionId || !showExecutionsList);

  return (
    <ViewLayout onBack={onBack}>
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <WorkflowEditorHeader
          title={workflow.title}
          description={workflow.description}
          onSave={handleSave}
        />

        {/* Tracking Execution Bar */}
        {trackingExecutionId && <WorkflowExecutionBar />}

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
                {showToolSidebar && (
                  <ToolSidebar className="border-l border-border" />
                )}
                {showExecutionsList && <ExecutionsList />}
                {showStepDetail && (
                  <StepDetailPanel className="border-l border-border" />
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
    </ViewLayout>
  );
}

export function WorkflowExecutionDetailsView(props: WorkflowDetailsViewProps) {
  return <UnifiedWorkflowView {...props} mode="execution" />;
}
