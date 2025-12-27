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
import { StepTabsStoreProvider } from "@/web/components/details/workflow/stores/step-tabs";
import { useWorkflowCollectionItem } from "./hooks/use-workflow-collection-item";
import { WorkflowActions } from "./components/actions";
import { ExecutionsTab, WorkflowTabs } from "./components/tabs";
import { toast } from "@deco/ui/components/sonner.tsx";
import { MonacoCodeEditor } from "./components/monaco-editor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deco/ui/components/resizable.js";
import {
  PANELS,
  useActivePanels,
  useActiveView,
  usePanelsActions,
} from "./stores/panels";
import { Fragment, Suspense } from "react";
import { Button } from "@deco/ui/components/button.js";
import { X } from "lucide-react";
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

  const initialCurrentStepTab =
    item.steps[0] &&
    ("toolName" in item.steps[0].action ||
      "connectionId" in item.steps[0].action)
      ? "tool"
      : "connections";

  return (
    <StepTabsStoreProvider initialCurrentStepTab={initialCurrentStepTab}>
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
    </StepTabsStoreProvider>
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

export function ExecutionsPanel() {
  return (
    <Suspense
      fallback={
        <div className="h-full w-full flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <ExecutionsTab />
    </Suspense>
  );
}

function RightPanel() {
  const activePanels = useActivePanels();
  const { togglePanel } = usePanelsActions();
  const currentStep = useCurrentStep();
  console.log({ activePanels, panels: Object.values(PANELS) });
  return (
    <ResizablePanelGroup direction="vertical" className="flex w-full h-full">
      {Object.keys(PANELS)
        .filter((panel) => activePanels[panel as keyof typeof PANELS])
        .map((panel, i) => {
          const Component = PANELS[panel as keyof typeof PANELS].component;
          return (
            <Fragment key={panel}>
              {i > 0 && (
                <ResizableHandle
                  withHandle={
                    i <
                    Object.values(PANELS).filter((panel) => {
                      console.log({ panel });
                      return activePanels[panel.name as keyof typeof PANELS];
                    }).length -
                      1
                  }
                />
              )}
              <ResizablePanel order={i} className="flex-1">
                <div className="h-10 flex items-center justify-between px-2 border-b border-border bg-muted/50 text-sm font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{PANELS[panel as keyof typeof PANELS].label}</span>
                    {PANELS[panel as keyof typeof PANELS].label === "Step" && (
                      <span className="text-xs text-muted-foreground/50">
                        {currentStep?.name}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => togglePanel(panel as keyof typeof PANELS)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <Component key={panel} />
              </ResizablePanel>
            </Fragment>
          );
        })}
    </ResizablePanelGroup>
  );
}

function WorkflowDetails({ onBack, onUpdate }: WorkflowDetailsProps) {
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
      <div className="h-full relative">
        <div className="absolute top-4 left-4 z-50">
          <WorkflowTabs />
        </div>
        {activeView === "code" && (
          <WorkflowCode workflow={workflow} onUpdate={onUpdate} />
        )}
        {activeView === "canvas" && (
          <ResizablePanelGroup
            direction="horizontal"
            className="flex w-full h-full overflow-hidden"
          >
            <ResizablePanel defaultSize={50}>
              <div className="flex-1 h-full">
                <WorkflowSteps />
              </div>
            </ResizablePanel>
            <ResizableHandle />

            <ResizablePanel defaultSize={50}>
              <RightPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </ViewLayout>
  );
}
