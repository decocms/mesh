import { memo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type DefaultEdgeOptions,
  type NodeTypes,
  Panel,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CodeXml, Plus, Wrench, X } from "lucide-react";
import { cn } from "@deco/ui/lib/utils.js";
import {
  type StepType,
  useIsAddingStep,
  useWorkflowActions,
  useWorkflowSteps,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowFlow } from "./use-workflow-flow";
import { StepNode, TriggerNode } from "./nodes";
import { AddFirstStepButton } from "./new-step-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.js";

// ============================================
// Node Types Configuration
// ============================================

const nodeTypes: NodeTypes = {
  step: StepNode,
  trigger: TriggerNode,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  style: {
    strokeWidth: 1.5,
  },
  animated: false,
  type: "default",
};

// ============================================
// Empty State
// ============================================

const EmptyState = memo(function EmptyState() {
  const { appendStep } = useWorkflowActions();

  const handleAdd = (type: StepType) => {
    appendStep({ type });
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center py-8 text-center z-10">
      <p className="text-sm text-muted-foreground mb-4">
        No steps yet. Add your first step to get started.
      </p>
      <AddFirstStepButton onAdd={handleAdd} />
    </div>
  );
});

// ============================================
// Floating Add Step Button
// ============================================

interface StepButton {
  type: StepType;
  icon: React.ReactNode;
  label: string;
}

const stepButtons: StepButton[] = [
  {
    type: "code",
    icon: <CodeXml className="w-4 h-4" />,
    label: "Code Step",
  },
  {
    type: "tool",
    icon: <Wrench className="w-4 h-4" />,
    label: "Tool Step",
  },
];

const FloatingAddStepButton = memo(function FloatingAddStepButton() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { startAddingStep, cancelAddingStep } = useWorkflowActions();
  const isAddingStep = useIsAddingStep();
  const { setCurrentStepTab, setTrackingExecutionId } = useWorkflowActions();
  const handleSelectType = (type: StepType) => {
    startAddingStep(type);
    setCurrentStepTab("action");
    setTrackingExecutionId(undefined);
    setIsExpanded(false);
  };

  const handleCancel = () => {
    cancelAddingStep();
    setIsExpanded(false);
  };

  // If we're in "adding step" mode, show cancel button and instructions
  if (isAddingStep) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-md backdrop-blur-sm">
          Click a highlighted step to add after it
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className={cn(
            "w-8 h-8 rounded-full border-2 border-destructive bg-background",
            "flex items-center justify-center cursor-pointer",
            "hover:bg-destructive/10 transition-colors",
            "shadow-lg",
          )}
        >
          <X className="w-4 h-4 text-destructive" />
        </button>
      </div>
    );
  }

  const firstSlice = stepButtons.slice(0, Math.floor(stepButtons.length / 2));
  const secondSlice = stepButtons.slice(Math.floor(stepButtons.length / 2));
  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full transition-all ease-in-out cursor-pointer",
      )}
    >
      <div className="w-full h-full flex items-center justify-center">
        <div className="transition-all duration-200 ease-in-out flex items-center justify-center w-full h-full">
          {/* Plus button (collapsed state) */}
          <div
            className={cn(
              "absolute transition-all duration-200 ease-in-out flex items-center justify-center w-full h-full",
              isExpanded && "scale-0 opacity-0 pointer-events-none",
            )}
          >
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className={cn(
                "bg-transparent rounded-full flex items-center justify-center cursor-pointer transition-all ease-in-out h-8 w-8",
                isExpanded && "hover:border-muted",
                !isExpanded &&
                  "hover:border-primary border-2 border-primary/50 transition-all ease-in-out",
              )}
            >
              <Plus className="w-5 h-5 text-primary-foreground transition-all ease-in-out" />
            </button>
          </div>

          {/* Menu (expanded state) - floating overlay */}
          <div
            className={cn(
              "absolute transition-all duration-200 ease-in-out",
              !isExpanded && "scale-0 opacity-0 pointer-events-none",
            )}
          >
            <div className="flex items-center gap-3 w-full h-full">
              {firstSlice.map((button) => (
                <Tooltip key={button.type}>
                  <TooltipTrigger
                    onClick={() => handleSelectType(button.type)}
                    asChild
                    className="hover:text-primary transition-all ease-in-out h-5 w-5 p-px"
                  >
                    {button.icon}
                  </TooltipTrigger>
                  <TooltipContent>{button.label}</TooltipContent>
                </Tooltip>
              ))}
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className={cn(
                  "w-8 h-8 rounded-full bg-transparent transition-all ease-in-out cursor-pointer flex items-center justify-center border-2",
                  isExpanded && "hover:border-muted border-primary/50",
                  !isExpanded &&
                    "hover:border-primary border-2 border-primary/50 transition-all ease-in-out",
                )}
              >
                <X className="w-4 h-4 text-primary-foreground transition-all ease-in-out" />
              </button>
              {secondSlice.map((button) => (
                <Tooltip key={button.type}>
                  <TooltipTrigger
                    onClick={() => handleSelectType(button.type)}
                    asChild
                    className="hover:text-primary transition-all ease-in-out h-5 w-5 p-px"
                  >
                    {button.icon}
                  </TooltipTrigger>
                  <TooltipContent>{button.label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================
// Workflow Canvas
// ============================================

// Stable options objects defined outside component to avoid recreating on each render
const fitViewOptions = {
  padding: 0.3,
  maxZoom: 1.5,
} as const;

const proOptions = { hideAttribution: true } as const;

export const WorkflowCanvas = memo(function WorkflowCanvas() {
  const steps = useWorkflowSteps();
  const { nodes, edges, onNodesChange, onEdgesChange, onNodeClick } =
    useWorkflowFlow();

  // Check if workflow has actual steps (excluding Manual trigger)
  const hasSteps = steps.some((s) => s.name !== "Manual");

  return (
    <div
      className="w-full h-full min-h-[400px] relative"
      style={{ height: "100%" }}
    >
      {!hasSteps && <EmptyState />}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.3}
        maxZoom={2}
        proOptions={proOptions}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        selectNodesOnDrag={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={40}
          size={1}
          className="bg-background!"
        />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-right"
          className="bg-card! border-border! shadow-sm!"
        />

        {/* Floating Add Step Button */}
        {hasSteps && (
          <Panel position="bottom-center" className="mb-4">
            <FloatingAddStepButton />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
});

// Re-export for compatibility
export default WorkflowCanvas;
