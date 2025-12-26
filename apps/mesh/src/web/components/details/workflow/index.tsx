import { Spinner } from "@deco/ui/components/spinner.tsx";
import { Workflow } from "@decocms/bindings/workflow";
import { ViewActions, ViewLayout, ViewTabs } from "../layout";
import { WorkflowSteps } from "./components/steps/index";
import {
  useCurrentStep,
  useWorkflow,
  useWorkflowActions,
  WorkflowStoreProvider,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowCollectionItem } from "./hooks/use-workflow-collection-item";
import { WorkflowActions } from "./components/actions";
import { ActionTab, ExecutionsTab, WorkflowTabs } from "./components/tabs";
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
} from "./stores/panels";
import { Suspense } from "react";
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
  const activePanels = useActivePanels();
  const hasMultiplePanels =
    Object.values(activePanels).filter(Boolean).length > 1;
  const currentStep = useCurrentStep();
  const { togglePanel } = usePanelsActions();
  return (
    <ResizablePanelGroup direction="vertical">
      <Suspense
        fallback={
          <div className="h-full w-full flex items-center justify-center">
            <Spinner />
          </div>
        }
      >
        {activePanels.executions && (
          <ResizablePanel
            id="executions-panel"
            order={1}
            minSize={15}
            className="overflow-hidden"
          >
            <div className="h-full border-b border-border bg-muted/30">
              <ExecutionsTab />
            </div>
          </ResizablePanel>
        )}
      </Suspense>
      {hasMultiplePanels && <ResizableHandle />}
      {activePanels.step && (
        <ResizablePanel
          id="step-panel"
          order={2}
          defaultSize={100}
          minSize={40}
          className="flex flex-col"
        >
          {/* Step Tabs */}
          <div className="min-h-1/2 h-full">
            <ViewLayout
              onBack={() => togglePanel("step")}
              title={currentStep?.name}
            >
              {currentStep && <ActionTab step={currentStep} />}
            </ViewLayout>
          </div>
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
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
          <div className="flex-1 h-full">
            {activeView === "canvas" && <WorkflowSteps />}
            {activeView === "code" && (
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
