import { Spinner } from "@deco/ui/components/spinner.tsx";
import { Workflow } from "@decocms/bindings/workflow";
import { ViewActions, ViewLayout, ViewTabs } from "../layout";
import { WorkflowSteps } from "./components/steps/index";
import { WorkflowListView } from "./components/list-view";
import {
  useCurrentStep,
  useWorkflow,
  useWorkflowActions,
  WorkflowStoreProvider,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowCollectionItem } from "./hooks/use-workflow-collection-item";
import { WorkflowActions } from "./components/actions";
import { ActionTab, WorkflowTabs } from "./components/tabs";
import { WorkflowRunsView } from "./components/runs-view";
import { toast } from "@deco/ui/components/sonner.tsx";
import { MonacoCodeEditor } from "./components/monaco-editor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deco/ui/components/resizable.js";
import {
  useActivePanels,
  useActiveView,
  usePanelsActions,
  useRightPanelTab,
  useViewingRunId,
} from "./stores/panels";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft } from "lucide-react";
import { RunDetailView } from "./components/run-detail-view";
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

function RightPanelTabs() {
  const rightPanelTab = useRightPanelTab();
  const { setRightPanelTab } = usePanelsActions();

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3",
          rightPanelTab === "properties"
            ? "bg-accent/50 text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => setRightPanelTab("properties")}
      >
        Properties
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3",
          rightPanelTab === "runs"
            ? "bg-accent/50 text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => setRightPanelTab("runs")}
      >
        Runs
      </Button>
    </div>
  );
}

function RunDetailHeader({ runId }: { runId: string }) {
  const { setViewingRunId } = usePanelsActions();
  const { setTrackingExecutionId } = useWorkflowActions();

  const handleBack = () => {
    setViewingRunId(null);
    setTrackingExecutionId(undefined);
  };

  return (
    <div className="flex items-center gap-2 h-12 border-b border-border shrink-0 px-4">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium">Run {runId.slice(0, 8)}</span>
    </div>
  );
}

function RightPanel() {
  const activePanels = useActivePanels();
  const rightPanelTab = useRightPanelTab();
  const viewingRunId = useViewingRunId();
  const currentStep = useCurrentStep();

  if (!activePanels.step) {
    return null;
  }

  // If viewing a specific run, show the run detail view
  if (viewingRunId) {
    return (
      <div className="h-full flex flex-col">
        <RunDetailHeader runId={viewingRunId} />
        <div className="flex-1 overflow-auto">
          <RunDetailView runId={viewingRunId} />
        </div>
      </div>
    );
  }

  // Normal view with tabs
  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <RightPanelTabs />
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {rightPanelTab === "properties" && currentStep && (
          <ActionTab step={currentStep} />
        )}
        {rightPanelTab === "runs" && <WorkflowRunsView />}
      </div>
    </div>
  );
}

export function WorkflowDetails({ onBack, onUpdate }: WorkflowDetailsProps) {
  const activeView = useActiveView();
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
          <div className="flex-1 h-full pt-14">
            {activeView === "list" && <WorkflowListView />}
            {activeView === "canvas" && <WorkflowSteps />}
            {activeView === "code" && (
              <div className="h-full">
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
