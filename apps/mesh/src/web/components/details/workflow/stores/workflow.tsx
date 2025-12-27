import { createStore, StoreApi } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/vanilla/shallow";
import { Workflow, DEFAULT_CODE_STEP } from "@decocms/bindings/workflow";
import { Step, ToolCallAction, CodeAction } from "@decocms/bindings/workflow";
import { createContext, useContext, useState } from "react";
import { jsonSchemaToTypeScript } from "../typescript-to-json-schema";

type CurrentStepTab = "input" | "output" | "action" | "executions";
export type StepType = "tool" | "code";

interface State {
  originalWorkflow: Workflow;
  isAddingStep: boolean;
  /** The type of step being added (set when user clicks add button) */
  addingStepType: StepType | null;
  /** Selected parent steps for multi-selection (used for code steps) */
  selectedParentSteps: string[];
  workflow: Workflow;
  trackingExecutionId: string | undefined;
  currentStepTab: CurrentStepTab;
  currentStepName: string | undefined;
}

interface Actions {
  setToolAction: (toolAction: ToolCallAction) => void;
  appendStep: ({ step, type }: { step?: Step; type: StepType }) => void;
  setIsAddingStep: (isAddingStep: boolean) => void;
  deleteStep: (stepName: string) => void;
  setCurrentStepName: (stepName: string | undefined) => void;
  updateStep: (stepName: string, updates: Partial<Step>) => void;
  setTrackingExecutionId: (executionId: string | undefined) => void;
  setCurrentStepTab: (currentStepTab: CurrentStepTab) => void;
  resetToOriginalWorkflow: () => void;
  /** Start the add step flow - user selects type first */
  startAddingStep: (type: StepType) => void;
  /** Cancel the add step flow */
  cancelAddingStep: () => void;
  /** Add new tool step */
  addToolStep: () => void;
  /** Toggle selection of a parent step (for code steps multi-selection) */
  toggleParentStepSelection: (stepName: string) => void;
  /** Confirm adding a code step with selected parent steps */
  confirmAddCodeStep: () => void;
  setOriginalWorkflow: (workflow: Workflow) => void;
  setWorkflow: (workflow: Workflow) => void;
}

interface Store extends State {
  actions: Actions;
}

function generateUniqueName(baseName: string, existingSteps: Step[]): string {
  const trimmedName = baseName.trim();
  const exists = existingSteps.some(
    (s) => s.name.toLowerCase() === trimmedName.toLowerCase(),
  );
  if (!exists) return trimmedName;
  return `${trimmedName}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Replace the Input interface in code with a new interface definition.
 * If no Input interface exists, prepends the new one.
 * Handles nested braces in the interface body.
 */
function replaceInputInterface(
  code: string,
  newInputInterface: string,
): string {
  // Find "interface Input {" and then match balanced braces
  const startMatch = code.match(/interface\s+Input\s*\{/);
  if (!startMatch || startMatch.index === undefined) {
    // No existing Input interface, prepend the new one
    return `${newInputInterface}\n\n${code.trimStart()}`;
  }

  const startIdx = startMatch.index;
  const braceStart = startIdx + startMatch[0].length - 1; // Position of opening {

  // Find the matching closing brace
  let depth = 1;
  let endIdx = braceStart + 1;
  while (endIdx < code.length && depth > 0) {
    if (code[endIdx] === "{") depth++;
    else if (code[endIdx] === "}") depth--;
    endIdx++;
  }

  // Replace the entire interface (from "interface Input" to closing "}")
  return code.slice(0, startIdx) + newInputInterface + code.slice(endIdx);
}

function createDefaultStep(type: StepType, index: number): Step {
  switch (type) {
    case "tool":
      return {
        input: {},
        action: { toolName: "", connectionId: "" },
        outputSchema: {},
        name: `Step_${index + 1}`,
      };
    case "code":
      return { ...DEFAULT_CODE_STEP, name: `Step_${index + 1}` };
    default:
      throw new Error(`Invalid step type: ${type}`);
  }
}

const WorkflowStoreContext = createContext<StoreApi<Store> | null>(null);
const createWorkflowStore = (initialState: State) => {
  return createStore<Store>()(
    persist(
      (set) => ({
        ...initialState,
        actions: {
          setIsAddingStep: (isAddingStep) =>
            set((state) => ({
              ...state,
              isAddingStep: isAddingStep,
            })),

          setCurrentStepTab: (currentStepTab) =>
            set((state) => ({
              ...state,
              currentStepTab: currentStepTab,
            })),
          setToolAction: (toolAction) =>
            set((state) => ({
              workflow: {
                ...state.workflow,
                steps: state.workflow.steps.map((step) =>
                  "toolName" in step.action &&
                  step.action.toolName !== toolAction.toolName
                    ? { ...step, action: toolAction }
                    : step,
                ),
              },
            })),
          appendStep: ({ step, type }) =>
            set((state) => {
              const newStep =
                step ?? createDefaultStep(type, state.workflow.steps.length);
              const existingName = state.workflow.steps.find(
                (s) => s.name === newStep.name,
              );
              const newName = existingName
                ? `${newStep.name} ${
                    parseInt(
                      existingName.name.split(" ").pop() ??
                        Math.random().toString(36).substring(2, 15),
                    ) + 1
                  }`
                : newStep.name;
              return {
                workflow: {
                  ...state.workflow,
                  steps: [
                    ...state.workflow.steps,
                    { ...newStep, name: newName },
                  ],
                },
              };
            }),

          deleteStep: (stepName) =>
            set((state) => ({
              workflow: {
                ...state.workflow,
                steps: state.workflow.steps.filter(
                  (step) => step.name !== stepName,
                ),
              },
            })),
          setCurrentStepName: (stepName) =>
            set((state) => ({
              ...state,
              currentStepName: stepName,
            })),
          updateStep: (stepName, updates) =>
            set((state) => ({
              ...state,
              workflow: {
                ...state.workflow,
                steps: state.workflow.steps.map((step) =>
                  step.name === stepName ? { ...step, ...updates } : step,
                ),
              },
            })),
          setTrackingExecutionId: (executionId) =>
            set((state) => ({
              ...state,
              trackingExecutionId: executionId,
            })),
          resetToOriginalWorkflow: () =>
            set((state) => ({
              ...state,
              workflow: state.originalWorkflow,
            })),
          startAddingStep: (type: StepType) =>
            set((state) => ({
              ...state,
              isAddingStep: true,
              addingStepType: type,
            })),
          cancelAddingStep: () =>
            set((state) => ({
              ...state,
              isAddingStep: false,
              addingStepType: null,
              selectedParentSteps: [],
            })),
          toggleParentStepSelection: (stepName: string) =>
            set((state) => {
              const isSelected = state.selectedParentSteps.includes(stepName);
              return {
                ...state,
                selectedParentSteps: isSelected
                  ? state.selectedParentSteps.filter((s) => s !== stepName)
                  : [...state.selectedParentSteps, stepName],
              };
            }),
          confirmAddCodeStep: () =>
            set((state) => {
              const { selectedParentSteps, addingStepType, workflow } = state;
              if (addingStepType !== "code" || selectedParentSteps.length === 0)
                return state;

              // Build input object with references to all selected parent steps
              const input: Record<string, string> = {};
              for (const stepName of selectedParentSteps) {
                input[stepName] = `@${stepName}`;
              }

              // Combine outputSchemas from all selected parent steps
              const combinedProperties: Record<string, unknown> = {};
              for (const stepName of selectedParentSteps) {
                const parentStep = workflow.steps.find(
                  (s) => s.name === stepName,
                );
                if (parentStep?.outputSchema) {
                  combinedProperties[stepName] = parentStep.outputSchema;
                }
              }

              const combinedSchema: Record<string, unknown> | undefined =
                Object.keys(combinedProperties).length > 0
                  ? {
                      type: "object",
                      properties: combinedProperties,
                      required: Object.keys(combinedProperties),
                    }
                  : undefined;

              // Create the new code step
              let newStep = createDefaultStep(
                "code",
                Number((Math.random() * 1000000).toFixed(0)),
              );

              newStep = {
                ...newStep,
                input,
              };

              // Inject the combined Input interface into the code
              if (combinedSchema) {
                const inputInterface = jsonSchemaToTypeScript(
                  combinedSchema,
                  "Input",
                );
                const codeAction = newStep.action as CodeAction;
                const updatedCode = replaceInputInterface(
                  codeAction.code,
                  inputInterface,
                );
                newStep = {
                  ...newStep,
                  action: { ...codeAction, code: updatedCode },
                };
              }

              const newName = generateUniqueName(newStep.name, workflow.steps);

              return {
                ...state,
                isAddingStep: false,
                addingStepType: null,
                selectedParentSteps: [],
                workflow: {
                  ...workflow,
                  steps: [...workflow.steps, { ...newStep, name: newName }],
                },
                currentStepName: newName,
              };
            }),
          addToolStep: () =>
            set((state) => {
              // Create the new step
              let newStep = createDefaultStep(
                "tool",
                Number((Math.random() * 1000000).toFixed(0)),
              );

              const newName = generateUniqueName(
                newStep.name,
                state.workflow.steps,
              );

              return {
                ...state,
                isAddingStep: false,
                addingStepType: null,
                workflow: {
                  ...state.workflow,
                  steps: [
                    ...state.workflow.steps,
                    { ...newStep, name: newName },
                  ],
                },
                currentStepName: newName,
              };
            }),
          setOriginalWorkflow: (workflow) =>
            set((state) => ({
              ...state,
              originalWorkflow: workflow,
            })),
          setWorkflow: (workflow) =>
            set((state) => ({
              ...state,
              workflow: workflow,
            })),
        },
      }),
      {
        name: `workflow-store-${encodeURIComponent(
          initialState.workflow.id,
        ).slice(0, 200)}`,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          workflow: state.workflow,
          trackingExecutionId: state.trackingExecutionId,
          currentStepName: state.currentStepName,
          currentStepTab: state.currentStepTab,
          originalWorkflow: state.originalWorkflow,
          isAddingStep: state.isAddingStep,
          addingStepType: state.addingStepType,
          selectedParentSteps: state.selectedParentSteps,
        }),
      },
    ),
  );
};

export function WorkflowStoreProvider({
  children,
  workflow,
  trackingExecutionId,
}: {
  children: React.ReactNode;
  workflow: Workflow;
  trackingExecutionId?: string;
}) {
  const [store] = useState(() =>
    createWorkflowStore({
      originalWorkflow: workflow,
      workflow,
      isAddingStep: false,
      addingStepType: null,
      selectedParentSteps: [],
      currentStepName: undefined,
      trackingExecutionId,
      currentStepTab: "input",
    }),
  );

  return (
    <WorkflowStoreContext.Provider value={store}>
      {children}
    </WorkflowStoreContext.Provider>
  );
}
function useWorkflowStore<T>(
  selector: (state: Store) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useContext(WorkflowStoreContext);
  if (!store) {
    throw new Error(
      "Missing WorkflowStoreProvider - refresh the page. If the error persists, please contact support.",
    );
  }
  return useStoreWithEqualityFn(store, selector, equalityFn ?? shallow);
}

export function useWorkflow() {
  return useWorkflowStore((state) => state.workflow);
}

export function useWorkflowActions() {
  return useWorkflowStore((state) => state.actions);
}

export function useCurrentStepName() {
  const steps = useWorkflowSteps();
  return useWorkflowStore((state) => state.currentStepName) ?? steps[0]?.name;
}

export function useCurrentStep() {
  const currentStepName = useCurrentStepName();
  const steps = useWorkflowSteps();
  const exact = steps.find((step) => step.name === currentStepName);
  if (exact) return exact;
  return steps[0];
}

export function useWorkflowSteps() {
  return useWorkflow().steps;
}

export function useIsDirty() {
  const workflow = useWorkflow();
  const originalWorkflow = useWorkflowStore((state) => state.originalWorkflow);
  return JSON.stringify(workflow) !== JSON.stringify(originalWorkflow);
}

export function useTrackingExecutionId() {
  return useWorkflowStore((state) => state.trackingExecutionId);
}

export function useIsAddingStep() {
  return useWorkflowStore((state) => state.isAddingStep);
}

export function useAddingStepType() {
  return useWorkflowStore((state) => state.addingStepType);
}

export function useSelectedParentSteps() {
  return useWorkflowStore((state) => state.selectedParentSteps);
}
