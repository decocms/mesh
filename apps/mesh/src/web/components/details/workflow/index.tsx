import { Spinner } from "@deco/ui/components/spinner.tsx";
import { Workflow } from "@decocms/bindings/workflow";
import { ViewActions, ViewLayout, ViewTabs } from "../layout";
import { WorkflowSteps } from "./components/steps/index";
import {
  useCurrentTab,
  useWorkflow,
  useWorkflowActions,
  WorkflowStoreProvider,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowCollectionItem } from "./hooks/use-workflow-collection-item";
import { WorkflowActions } from "./components/actions";
import { ExecutionsTab, StepTabs, WorkflowTabs } from "./components/tabs";
import { toast } from "@deco/ui/components/sonner.tsx";
import { MonacoCodeEditor } from "./components/monaco-editor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deco/ui/components/resizable.js";
import { type ComponentRef, useRef, useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import { useTrackingExecutionId } from "@/web/components/details/workflow/stores/workflow";
import { ExecutionBar } from "./components/tabs";
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

function RightPanel() {
  const [showExecutions, setShowExecutions] = useState(false);
  const executionsPanelRef = useRef<ComponentRef<typeof ResizablePanel>>(null);
  const trackingExecutionId = useTrackingExecutionId();

  return (
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel
        ref={executionsPanelRef}
        collapsible
        collapsedSize={0}
        minSize={15}
        defaultSize={0}
        onCollapse={() => setShowExecutions(false)}
        onExpand={() => setShowExecutions(true)}
        className="overflow-hidden"
      >
        <div className="h-full border-b border-border bg-muted/30">
          <ExecutionsTab />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={100} minSize={40} className="flex flex-col">
        {/* Executions Toggle Header */}
        <div className="shrink-0 border-b border-border bg-muted/50">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between rounded-none h-9 px-3 hover:bg-muted"
            onClick={() => {
              const panel = executionsPanelRef.current;
              if (panel) {
                if (panel.isCollapsed()) {
                  panel.expand();
                } else {
                  panel.collapse();
                }
              }
            }}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Executions
            </span>
            {showExecutions ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </div>

        {/* Tracking Execution Bar - shown when collapsed */}
        {!showExecutions && trackingExecutionId && (
          <div className="shrink-0 border-b border-border bg-muted/20">
            <ExecutionBar executionId={trackingExecutionId} />
          </div>
        )}

        {/* Step Tabs */}
        <div className="flex-1 min-h-0">
          <StepTabs />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function WorkflowDetails({ onBack, onUpdate }: WorkflowDetailsProps) {
  const currentTab = useCurrentTab();
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
        <WorkflowActions onUpdate={onUpdate} />
      </ViewActions>

      {/* Main Content */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex w-full h-full overflow-hidden relative"
      >
        <div className="absolute top-4 left-4 z-50">
          <WorkflowTabs />
        </div>
        <ResizablePanel defaultSize={50}>
          <div className="flex-1 h-full">
            {currentTab !== "code" && <WorkflowSteps />}
            {currentTab === "code" && (
              <div className="h-[calc(100%-60px)]">
                <WorkflowCode workflow={workflow} onUpdate={onUpdate} />
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="bg-background" defaultSize={50}>
          <RightPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </ViewLayout>
  );
}
