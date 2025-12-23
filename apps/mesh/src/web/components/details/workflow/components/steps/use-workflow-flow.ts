import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { buildDagEdges, type Step } from "@decocms/bindings/workflow";
import { useWorkflowSteps } from "@/web/components/details/workflow/stores/workflow";

// ============================================
// Types
// ============================================

export type StepStyle =
  | "success"
  | "error"
  | "pending"
  | "waiting_for_signal"
  | "creating"
  | "default"
  | undefined;

export interface StepResult {
  step_id: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  created_at?: string;
  completed_at_epoch_ms?: number | null;
}

export interface StepNodeData extends Record<string, unknown> {
  step: Step;
  stepResult: StepResult | null;
  isFetching: boolean;
  /** The branch root step name if this step is part of a branch */
  branchRoot: string | null;
  /** Whether this step is a branch root (has an "if" condition) */
  isBranchRoot: boolean;
}

export interface TriggerNodeData extends Record<string, unknown> {
  step: Step | null;
  isFetched: boolean;
  isRunning: boolean;
  isPending: boolean;
}

export type WorkflowNode = Node<StepNodeData | TriggerNodeData>;
export type WorkflowEdge = Edge;

// ============================================
// Layout Constants
// ============================================

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;
const TRIGGER_NODE_ID = "__trigger__";

// ============================================
// Dagre Layout Computation
// ============================================

/**
 * Get the PRIMARY parent for each step.
 * Priority:
 * 1. Input dependency from another conditional step in same branch
 * 2. First input dependency
 * 3. If condition reference
 */
function getPrimaryParentMap(steps: Step[]): Map<string, string> {
  const stepNames = new Set(steps.map((s) => s.name));
  const primaryParent = new Map<string, string>();

  for (const step of steps) {
    if (step.name === "Manual") continue;

    // Get all input dependencies
    const inputDeps: string[] = [];
    function findDeps(value: unknown) {
      if (typeof value === "string") {
        const matches = value.match(/@(\w+)/g);
        if (matches) {
          for (const match of matches) {
            const refName = match.substring(1);
            if (stepNames.has(refName)) {
              inputDeps.push(refName);
            }
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach(findDeps);
      } else if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(findDeps);
      }
    }
    findDeps(step.input);

    if (inputDeps[0]) {
      primaryParent.set(step.name, inputDeps[0]);
    }
  }

  return primaryParent;
}

function computeNodePositions(
  steps: Step[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  g.setNode(TRIGGER_NODE_ID, { width: NODE_WIDTH, height: NODE_HEIGHT });

  for (const step of steps) {
    if (step.name === "Manual") continue;
    g.setNode(step.name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Build LAYOUT edges: use primary parent only
  const primaryParent = getPrimaryParentMap(steps);
  const layoutEdges: [string, string][] = [];

  for (const [child, parent] of primaryParent) {
    layoutEdges.push([parent, child]);
  }

  const stepsWithDeps = new Set(layoutEdges.map(([, to]) => to));
  const rootSteps = steps.filter(
    (s) => s.name !== "Manual" && !stepsWithDeps.has(s.name),
  );

  for (const step of rootSteps) {
    g.setEdge(TRIGGER_NODE_ID, step.name);
  }

  // Add layout edges
  for (const [from, to] of layoutEdges) {
    if (from === "Manual") continue;
    g.setEdge(from, to);
  }

  dagre.layout(g);

  // Extract positions
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId);
    if (node) {
      positions.set(nodeId, {
        x: node.x - NODE_WIDTH / 2,
        y: node.y - NODE_HEIGHT / 2,
      });
    }
  }

  return positions;
}

// ============================================
// Hooks
// ============================================

/**
 * Hook to get React Flow nodes from workflow steps
 * React Compiler handles memoization automatically
 */
export function useWorkflowNodes(): WorkflowNode[] {
  const steps = useWorkflowSteps();
  const positions = computeNodePositions(steps);

  // Find manual trigger step
  const manualTriggerStep = steps.find((step) => step.name === "Manual");

  // Create trigger node
  const triggerNode: WorkflowNode = {
    id: TRIGGER_NODE_ID,
    type: "trigger",
    position: positions.get(TRIGGER_NODE_ID) ?? { x: 0, y: 0 },
    data: {
      step: manualTriggerStep ?? null,
      isFetched: false,
      isRunning: false,
      isPending: false,
    } as TriggerNodeData,
    draggable: false,
  };

  // Create step nodes
  const stepNodes: WorkflowNode[] = steps
    .filter((step) => !!step && step.name !== "Manual")
    .map((step) => {
      return {
        id: step.name,
        type: "step",
        position: positions.get(step.name) ?? { x: 0, y: 0 },
        data: {
          step,
          isFetching: false,
          isBranchRoot: step.config?.maxAttempts !== undefined,
        } as StepNodeData,
        draggable: true,
      };
    });

  return [triggerNode, ...stepNodes];
}

// Colors for edges
const BRANCH_COLOR = "#8b5cf6"; // violet-500

/**
 * Get only the PRIMARY parent for each step.
 * This reduces visual clutter by showing only one edge per step.
 */
function getPrimaryEdges(steps: Step[]): Map<string, string> {
  const dagEdges = buildDagEdges(steps);
  const primaryParent = new Map<string, string>();

  // For each step, pick ONE parent (the first one encountered)
  for (const [from, to] of dagEdges) {
    if (from === "Manual") continue;
    // Only set if not already set (first parent wins)
    if (!primaryParent.has(to)) {
      primaryParent.set(to, from);
    }
  }

  return primaryParent;
}

/**
 * Hook to get React Flow edges from workflow steps
 * Shows only primary structural edges to reduce clutter
 */
export function useWorkflowEdges(): WorkflowEdge[] {
  const steps = useWorkflowSteps();
  const dagEdges = buildDagEdges(steps);
  const primaryParent = getPrimaryEdges(steps);

  // Find root steps (no dependencies) and connect them to trigger
  const stepsWithDeps = new Set(dagEdges.map(([, to]) => to));
  const rootSteps = steps.filter(
    (s) => s.name !== "Manual" && !stepsWithDeps.has(s.name),
  );

  const edges: WorkflowEdge[] = [];

  // Connect trigger to root steps
  for (const step of rootSteps) {
    edges.push({
      id: `${TRIGGER_NODE_ID}-${step.name}`,
      source: TRIGGER_NODE_ID,
      target: step.name,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "default",
      animated: false,
    });
  }

  // Add only PRIMARY edges (one per step)
  for (const [to, from] of primaryParent) {
    const edgeStyle: React.CSSProperties = {
      stroke: BRANCH_COLOR,
      strokeWidth: 1.5,
    };

    edges.push({
      id: `${from}-${to}`,
      source: from,
      target: to,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "default",
      animated: false,
      style: edgeStyle,
    });
  }

  return edges;
}

/**
 * Hook to handle node selection
 * React Compiler handles memoization automatically
 */
export function useNodeSelection() {
  const onNodeClick = (_: React.MouseEvent, _node: Node) => {};

  return { onNodeClick };
}

// Stable no-op handlers defined outside component to avoid recreating on each render
const noopNodesChange: OnNodesChange = () => {
  // No-op: positions are derived from step levels
};

const noopEdgesChange: OnEdgesChange = () => {
  // No-op: edges are derived from step dependencies
};

/**
 * Combined hook for all React Flow state
 * Optimized for performance with stable references
 */
export function useWorkflowFlow() {
  const nodes = useWorkflowNodes();
  const edges = useWorkflowEdges();
  const { onNodeClick } = useNodeSelection();

  return {
    nodes,
    edges,
    onNodesChange: noopNodesChange,
    onEdgesChange: noopEdgesChange,
    onNodeClick,
  };
}

export { TRIGGER_NODE_ID };
