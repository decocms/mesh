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
import { Eye, FileIcon, X } from "lucide-react";
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
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { EmptyState } from "@deco/ui/components/empty-state.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared hook for workflow/execution data
// ─────────────────────────────────────────────────────────────────────────────

function useCollectionWorkflow({ itemId }: { itemId: string }) {
  const { connectionId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });
  const scopeKey = connectionId ?? "no-connection";

  const collectionName = "WORKFLOW";

  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: connectionId ?? null,
    orgSlug: org.slug,
  });

  const item = useCollectionItem<Workflow>(
    scopeKey,
    collectionName,
    itemId,
    client,
  );

  const actions = useCollectionActions<Workflow>(
    scopeKey,
    collectionName,
    client,
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
  };
}

interface WorkflowViewProps {
  onBack: () => void;
}

interface WorkflowDetailsProps extends WorkflowViewProps {
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

export function WorkflowDetails({ onBack }: WorkflowDetailsProps) {
  const { itemId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });
  const { item: workflow, update } = useCollectionWorkflow({ itemId });

  const keyFlow = JSON.stringify(workflow);

  if (!workflow) {
    return (
      <ViewLayout onBack={onBack}>
        <div className="flex h-full w-full bg-background">
          <EmptyState
            icon={<FileIcon className="w-10 h-10 text-muted-foreground" />}
            title="Workflow not found"
            description="This workflow may have been deleted or you may not have access to it."
          />
        </div>
      </ViewLayout>
    );
  }

  return (
    <WorkflowStoreProvider
      key={keyFlow}
      initialState={{
        workflow,
        trackingExecutionId: undefined,
        currentStepTab: "input",
      }}
    >
      <WorkflowStudio onBack={onBack} onUpdate={update} />
    </WorkflowStoreProvider>
  );
}
function WorkflowStudio({ onBack, onUpdate }: WorkflowDetailsProps) {
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

function useCollectionWorkflowExecution({ itemId }: { itemId: string }) {
  const { connectionId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });
  const scopeKey = connectionId ?? "no-connection";

  const collectionName = "WORKFLOW_EXECUTION";

  const item = useCollectionItem<WorkflowExecution>(
    scopeKey,
    collectionName,
    itemId,
    connectionId,
  );

  return {
    item,
  };
}

export function WorkflowExecutionDetailsView({ onBack }: WorkflowViewProps) {
  const { itemId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });
  const { item: execution } = useCollectionWorkflowExecution({
    itemId: itemId,
  });

  if (!execution) {
    return (
      <ViewLayout onBack={onBack}>
        <div className="flex h-full w-full bg-background">
          <EmptyState
            icon={<FileIcon className="w-10 h-10 text-muted-foreground" />}
            title="Workflow execution not found"
            description="This workflow execution may have been deleted or you may not have access to it."
          />
        </div>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout onBack={onBack}>
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <MonacoCodeEditor
          height="100%"
          code={JSON.stringify(execution, null, 2)}
          language="json"
          readOnly={true}
        />
      </div>
    </ViewLayout>
  );
}
