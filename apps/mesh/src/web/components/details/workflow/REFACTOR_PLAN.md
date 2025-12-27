# Refactor Plan: `tabs.tsx`

## Current Issues Analysis

### 1. File Organization
- **Problem**: Single 531-line file containing multiple unrelated concerns
- **Impact**: Hard to maintain, test, and understand
- **Components Mixed**:
  - Execution list/display
  - Workflow view switching (code/canvas)
  - Step header display
  - Action tab rendering (tool/code)
  - Tool selection flow (connections → tools → config)
  - Utility functions

### 2. Naming & Semantics Issues

#### Components
- `ExecutionsTab` ✅ (good)
- `ExecutionBar` ✅ (good)
- `WorkflowTabs` ❌ → `WorkflowViewSwitcher` (more descriptive)
- `StepHeader` ✅ (good)
- `ActionTab` ❌ → `StepActionTab` (more specific)
- `ToolAction` ❌ → `ToolActionConfigurator` (describes purpose)
- `ConnectionSelector` ✅ (good)
- `ToolSelector` ✅ (good)
- `SelectedTool` ❌ → `ToolInputForm` or `ToolConfigurator` (describes purpose)

#### Functions/Hooks
- `useExecution` ❌ → `useWorkflowExecutionById` (more specific)
- `useTool` ❌ → Already exists in `tool-selector.tsx`, should reuse or rename
- `jsonSchemaToMentionItems` ❌ → Move to utils, rename to `convertJsonSchemaToMentionItems`

#### Variables
- `stepAsTool` ❌ → `toolStep` (clearer)
- `sortedWithSelectedConnectionAtFirst` ❌ → `prioritizedConnections` (shorter)
- `sortedWithSelectedToolAtFirst` ❌ → `prioritizedTools` (shorter)

### 3. Type Reuse Issues

**Repeated Type Definitions:**
```typescript
// Repeated 3+ times
Step & { action: ToolCallAction }

// Repeated 2+ times  
Step & { action: ToolCallAction | CodeAction | WaitForSignalAction }
```

**Solution**: Create shared types:
```typescript
type ToolStep = Step & { action: ToolCallAction };
type StepWithAction = Step & { 
  action: ToolCallAction | CodeAction | WaitForSignalAction 
};
```

### 4. Logic in Components (Should be Hooks)

#### `ExecutionsTab`
- Keyboard navigation logic (ArrowUp/ArrowDown/Escape)
- Scroll-to-execution logic
- Item ref management

**Extract to**: `useExecutionNavigation`

#### `ToolAction`
- Tab state management (already uses `useToolActionTab`, but could be improved)
- Connection/tool selection flow logic

**Extract to**: `useToolActionFlow`

#### `SelectedTool`
- Input change handling
- Mentions generation from previous steps

**Extract to**: `useToolInput` and `useStepMentions`

#### Sorting Logic
- `sortedWithSelectedConnectionAtFirst` - repeated pattern
- `sortedWithSelectedToolAtFirst` - repeated pattern

**Extract to**: `usePrioritizedList` utility hook

### 5. Code Duplication

- Sorting logic duplicated in `ConnectionSelector` and `ToolSelector`
- Similar item selection patterns
- Similar ref management patterns

### 6. Component Responsibilities

**Too Much Logic:**
- `ToolAction` manages entire flow (connections → tools → tool config)
- `SelectedTool` handles input changes, mentions, and tool execution

**Should Be:**
- Components only handle UI rendering
- Hooks handle state and business logic

## Refactor Structure

### Proposed File Structure

```
workflow/components/
├── tabs.tsx                          # Main exports (barrel file)
├── executions/
│   ├── executions-tab.tsx           # ExecutionsTab component
│   ├── execution-bar.tsx            # ExecutionBar component
│   ├── execution-status-icon.tsx    # ExecutionStatusIcon component
│   └── hooks/
│       └── use-execution-navigation.ts  # Keyboard nav + scroll logic
├── workflow-views/
│   └── workflow-view-switcher.tsx   # WorkflowTabs → renamed
├── step-header/
│   └── step-header.tsx              # StepHeader component
├── action-tabs/
│   ├── step-action-tab.tsx          # ActionTab → renamed
│   ├── code-action-tab.tsx          # Code action rendering
│   └── tool-action-tab.tsx          # Tool action rendering (ToolAction)
├── tool-selection/
│   ├── connection-selector.tsx      # ConnectionSelector
│   ├── tool-selector.tsx            # ToolSelector
│   ├── tool-configurator.tsx        # SelectedTool → renamed
│   └── hooks/
│       ├── use-tool-action-flow.ts  # Tab flow management
│       ├── use-tool-input.ts        # Input change handling
│       └── use-step-mentions.ts     # Mentions generation
└── utils/
    └── json-schema-to-mentions.ts   # jsonSchemaToMentionItems utility
```

### Type Definitions

**Create**: `workflow/components/types.ts`
```typescript
import { Step, ToolCallAction, CodeAction, WaitForSignalAction } from "@decocms/bindings/workflow";

export type ToolStep = Step & { action: ToolCallAction };
export type CodeStep = Step & { action: CodeAction };
export type StepWithAction = Step & { 
  action: ToolCallAction | CodeAction | WaitForSignalAction 
};

export type ExecutionStatus = "success" | "running" | "error" | "enqueued";
```

## Detailed Refactor Steps

### Step 1: Extract Types
- [ ] Create `types.ts` with shared type definitions
- [ ] Replace all inline type definitions with shared types

### Step 2: Extract Utilities
- [ ] Move `jsonSchemaToMentionItems` to `utils/json-schema-to-mentions.ts`
- [ ] Rename to `convertJsonSchemaToMentionItems`
- [ ] Add JSDoc comments

### Step 3: Extract Execution Components
- [ ] Create `executions/` directory
- [ ] Extract `ExecutionStatusIcon` to separate file
- [ ] Extract `ExecutionBar` to separate file
- [ ] Extract `ExecutionsTab` to separate file
- [ ] Create `use-execution-navigation.ts` hook:
  ```typescript
  function useExecutionNavigation(executions: Execution[], selectedId: string) {
    // Keyboard navigation logic
    // Scroll management
    // Ref management
  }
  ```
- [ ] Rename `useExecution` to `useWorkflowExecutionById` and move to hooks

### Step 4: Extract Workflow View Switcher
- [ ] Create `workflow-views/` directory
- [ ] Move `WorkflowTabs` → `WorkflowViewSwitcher`
- [ ] Simplify component (only UI)

### Step 5: Extract Step Header
- [ ] Create `step-header/` directory
- [ ] Move `StepHeader` component
- [ ] Extract connection lookup logic to hook if needed

### Step 6: Extract Action Tabs
- [ ] Create `action-tabs/` directory
- [ ] Split `ActionTab` into:
  - `StepActionTab` (main component, routes to sub-components)
  - `CodeActionTab` (code editor rendering)
  - `ToolActionTab` (tool action rendering)
- [ ] Move `ToolAction` → `ToolActionTab`

### Step 7: Extract Tool Selection Flow
- [ ] Create `tool-selection/` directory
- [ ] Move `ConnectionSelector`, `ToolSelector`, `SelectedTool` → `ToolConfigurator`
- [ ] Create `use-tool-action-flow.ts`:
  ```typescript
  function useToolActionFlow(step: ToolStep) {
    const { activeTab, setActiveTab } = useToolActionTab();
    const { connection, tool } = useToolData(step);
    
    const handleConnectionSelect = (connectionId: string) => {
      updateStep(step.name, { action: { ...step.action, connectionId } });
      setActiveTab("tools");
    };
    
    const handleToolSelect = (toolName: string) => {
      updateStep(step.name, { action: { ...step.action, toolName } });
      setActiveTab("tool");
    };
    
    return { activeTab, connection, tool, handleConnectionSelect, handleToolSelect };
  }
  ```
- [ ] Create `use-tool-input.ts`:
  ```typescript
  function useToolInput(step: ToolStep, tool: McpTool) {
    const { updateStep } = useWorkflowActions();
    const mentions = useStepMentions(step.name);
    
    const handleInputChange = (inputParams: Record<string, unknown>) => {
      updateStep(step.name, { input: { ...step.input, ...inputParams } });
    };
    
    return { mentions, handleInputChange };
  }
  ```
- [ ] Create `use-step-mentions.ts`:
  ```typescript
  function useStepMentions(currentStepName: string): MentionItem[] {
    const workflowSteps = useWorkflowSteps();
    const currentStepIndex = workflowSteps.findIndex(s => s.name === currentStepName);
    const previousSteps = workflowSteps.slice(0, currentStepIndex);
    
    return previousSteps.map(step => ({
      id: step.name,
      label: step.name,
      children: convertJsonSchemaToMentionItems(
        step.outputSchema as Record<string, unknown>,
        `${step.name}.`
      ),
    }));
  }
  ```

### Step 8: Create Utility Hook for Prioritized Lists
- [ ] Create `use-prioritized-list.ts`:
  ```typescript
  function usePrioritizedList<T>(
    items: T[],
    selectedItem: T | null,
    getKey: (item: T) => string,
    compareFn?: (a: T, b: T) => number
  ): T[] {
    // Sort with selected item first
  }
  ```

### Step 9: Update Main File
- [ ] `tabs.tsx` becomes barrel file with exports:
  ```typescript
  export { ExecutionsTab } from "./executions/executions-tab";
  export { WorkflowViewSwitcher } from "./workflow-views/workflow-view-switcher";
  export { StepHeader } from "./step-header/step-header";
  export { StepActionTab } from "./action-tabs/step-action-tab";
  ```

### Step 10: Cleanup
- [ ] Remove unused imports
- [ ] Update all imports across codebase
- [ ] Run linter and formatter
- [ ] Verify tests still pass

## Benefits

1. **Maintainability**: Each file has a single responsibility
2. **Testability**: Hooks and utilities can be tested independently
3. **Reusability**: Hooks can be reused in other components
4. **Readability**: Smaller files are easier to understand
5. **Type Safety**: Shared types ensure consistency
6. **Performance**: Better code splitting opportunities

## Migration Notes

- All exports remain the same (barrel file pattern)
- No breaking changes to parent components
- Gradual migration possible (one section at a time)

