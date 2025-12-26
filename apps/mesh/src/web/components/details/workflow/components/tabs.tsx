import {
  useCurrentStep,
  useTrackingExecutionId,
  useWorkflowActions,
  useWorkflowSteps,
} from "@/web/components/details/workflow/stores/workflow";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  CodeAction,
  Step,
  ToolCallAction,
  WaitForSignalAction,
} from "@decocms/bindings/workflow";
import { MonacoCodeEditor } from "./monaco-editor";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { CodeXml, GitBranch, List, Loader2, Plus, Trash2 } from "lucide-react";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useState } from "react";
import type { View } from "../stores/panels";
import {
  useConnection,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import { useWorkflow } from "@/web/components/details/workflow/stores/workflow";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { useWorkflowExecutionCollectionList } from "../hooks/use-workflow-collection-item";
import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { useMembers } from "@/web/hooks/use-members";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { ListRow } from "@/web/components/list-row.tsx";
import { ToolComponent } from "./tool-selector";
import {
  MentionInput,
  MentionItem,
} from "@/web/components/tiptap-mentions-input";
import { McpTool, useMcp } from "@/web/hooks/use-mcp";
import { usePanelsActions } from "../stores/panels";
import { useActiveView } from "../stores/panels";

export function ExecutionsTab() {
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });

  return (
    <div className="h-full w-full">
      <ScrollArea className="h-full">
        <div className="flex flex-col">
          {executions.length === 0 && (
            <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
              No executions yet
            </div>
          )}
          {executions.map((execution) => (
            <ExecutionBar key={execution.id} executionId={execution.id} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function useExecution(executionId: string) {
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });
  return executions.find((execution) => execution.id === executionId);
}

const ExecutionStatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "success":
      return <CheckCircle className="w-4 h-4 text-success" />;
    case "running":
      return <Loader2 className="w-4 h-4 animate-spin text-warning" />;
    case "error":
      return <XCircle className="w-4 h-4 text-destructive" />;
    case "enqueued":
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    default:
      return null;
  }
};

export function ExecutionBar({ executionId }: { executionId: string }) {
  const { setTrackingExecutionId } = useWorkflowActions();
  const { data } = useMembers();
  const trackingExecutionId = useTrackingExecutionId();
  const execution = useExecution(executionId);
  const isTrackingExecution = trackingExecutionId === executionId;

  if (!execution) return null;

  const memberName = data?.data?.members.find(
    (m) => m.userId === execution.created_by,
  )?.user?.name;

  return (
    <ListRow
      selected={isTrackingExecution}
      onClick={() => setTrackingExecutionId(execution.id)}
      className="border-b border-border"
    >
      <ListRow.Icon>
        <ExecutionStatusIcon status={execution.status} />
      </ListRow.Icon>
      <ListRow.Content className="flex items-center gap-2">
        <ListRow.Title>
          {new Date(execution.created_at).toLocaleString()}
        </ListRow.Title>
        <ListRow.Subtitle>{execution.id.slice(0, 8)}...</ListRow.Subtitle>
      </ListRow.Content>
      {memberName && (
        <ListRow.Trailing className="text-xs font-medium text-muted-foreground">
          {memberName}
        </ListRow.Trailing>
      )}
    </ListRow>
  );
}

const viewOptions: { value: View; icon: React.ReactNode; label: string }[] = [
  { value: "list", icon: <List className="w-4 h-4" />, label: "List" },
  { value: "canvas", icon: <GitBranch className="w-4 h-4" />, label: "Canvas" },
  { value: "code", icon: <CodeXml className="w-4 h-4" />, label: "Code" },
];

export function WorkflowTabs() {
  const activeView = useActiveView();
  const { setActiveView } = usePanelsActions();

  return (
    <div className="bg-muted border border-border rounded-lg flex">
      {viewOptions.map((option) => (
        <Button
          key={option.value}
          variant="outline"
          size="xs"
          className={cn(
            "h-7 border-0",
            activeView === option.value
              ? "bg-background text-foreground shadow-sm"
              : "bg-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveView(option.value)}
        >
          {option.icon}
        </Button>
      ))}
    </div>
  );
}

export function StepHeader() {
  const currentStep = useCurrentStep();
  const connection = useConnection(
    (currentStep?.action as ToolCallAction)?.connectionId ?? "",
  );
  return (
    <div className="p-4 flex flex-col gap-4 bg-background">
      <div className="flex items-center gap-2 bg-background">
        <Avatar
          url={connection?.icon ?? ""}
          fallback={currentStep?.name?.charAt(0) ?? ""}
        />
        <p className="text-sm font-medium">{currentStep?.name}</p>
      </div>
      <p className="text-muted-foreground text-xs">
        {currentStep?.description ?? connection?.description ?? ""}
      </p>
    </div>
  );
}

export function ActionTab({
  step,
}: {
  step: Step & {
    action: ToolCallAction | CodeAction | WaitForSignalAction;
  };
}) {
  if ("toolName" in step.action) {
    return (
      <div className="h-full bg-background">
        <ToolAction />
      </div>
    );
  } else if ("code" in step.action) {
    return (
      <div className="h-full flex flex-col bg-background">
        <CodeStepAction step={step as Step & { action: CodeAction }} />
      </div>
    );
  }
  return null;
}

function CodeStepAction({
  step,
}: {
  step: Step & { action: CodeAction };
}) {
  const { updateStep } = useWorkflowActions();
  const workflowSteps = useWorkflowSteps();
  const currentStepIndex = workflowSteps.findIndex((s) => s.name === step.name);
  const [activeTab, setActiveTab] = useState<"code" | "input">("input");

  const allMentions = workflowSteps.slice(0, currentStepIndex).map((s) => ({
    id: s.name,
    label: s.name,
    children: jsonSchemaToMentionItems(
      s.outputSchema as Record<string, unknown>,
      `${s.name}.`,
    ),
  }));

  const handleInputChange = (key: string, value: string) => {
    updateStep(step.name, {
      input: { ...step.input, [key]: value },
    });
  };

  const handleAddInput = () => {
    const existingKeys = Object.keys(step.input ?? {});
    let newKey = "input";
    let counter = 1;
    while (existingKeys.includes(newKey)) {
      newKey = `input${counter}`;
      counter++;
    }
    updateStep(step.name, {
      input: { ...step.input, [newKey]: "" },
    });
  };

  const handleRemoveInput = (key: string) => {
    const newInput = { ...step.input };
    delete newInput[key];
    updateStep(step.name, { input: newInput });
  };

  const handleRenameInput = (oldKey: string, newKey: string) => {
    if (oldKey === newKey || !newKey.trim()) return;
    const input = step.input ?? {};
    const newInput: Record<string, unknown> = {};
    for (const k of Object.keys(input)) {
      if (k === oldKey) {
        newInput[newKey] = input[k];
      } else {
        newInput[k] = input[k];
      }
    }
    updateStep(step.name, { input: newInput });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab toggle */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("input")}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            activeTab === "input"
              ? "bg-accent/50 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Input
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("code")}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            activeTab === "code"
              ? "bg-accent/50 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Code
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "input" && (
          <CodeInputEditor
            input={step.input ?? {}}
            mentions={allMentions}
            onInputChange={handleInputChange}
            onAddInput={handleAddInput}
            onRemoveInput={handleRemoveInput}
            onRenameInput={handleRenameInput}
          />
        )}
        {activeTab === "code" && (
        <MonacoCodeEditor
          key={`code-${step.name}`}
          height="100%"
          code={step.action.code}
          language="typescript"
          onSave={(code, outputSchema) => {
            updateStep(step.name, {
              action: { ...step.action, code },
              outputSchema: outputSchema as Record<string, unknown> | null,
            });
          }}
        />
        )}
      </div>
    </div>
  );
}

function CodeInputEditor({
  input,
  mentions,
  onInputChange,
  onAddInput,
  onRemoveInput,
  onRenameInput,
}: {
  input: Record<string, unknown>;
  mentions: MentionItem[];
  onInputChange: (key: string, value: string) => void;
  onAddInput: () => void;
  onRemoveInput: (key: string) => void;
  onRenameInput: (oldKey: string, newKey: string) => void;
}) {
  const entries = Object.entries(input);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          Input Variables
        </span>
        <Button variant="outline" size="sm" onClick={onAddInput}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
          No inputs defined. Click "Add" to create an input variable.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, value]) => (
            <CodeInputRow
              key={key}
              inputKey={key}
              value={String(value ?? "")}
              mentions={mentions}
              onChange={(v) => onInputChange(key, v)}
              onRemove={() => onRemoveInput(key)}
              onRename={(newKey) => onRenameInput(key, newKey)}
            />
          ))}
        </div>
      )}
      </div>
    );
  }

function CodeInputRow({
  inputKey,
  value,
  mentions,
  onChange,
  onRemove,
  onRename,
}: {
  inputKey: string;
  value: string;
  mentions: MentionItem[];
  onChange: (value: string) => void;
  onRemove: () => void;
  onRename: (newKey: string) => void;
}) {
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [editedKey, setEditedKey] = useState(inputKey);

  const handleKeyBlur = () => {
    setIsEditingKey(false);
    if (editedKey !== inputKey && editedKey.trim()) {
      onRename(editedKey);
    } else {
      setEditedKey(inputKey);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <div className="w-32 shrink-0">
        {isEditingKey ? (
          <input
            type="text"
            value={editedKey}
            onChange={(e) => setEditedKey(e.target.value)}
            onBlur={handleKeyBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleKeyBlur();
              }
            }}
            className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-accent"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingKey(true)}
            className="w-full px-2 py-1.5 text-sm text-left font-mono bg-muted/50 border border-border rounded-md hover:bg-muted transition-colors truncate"
          >
            {inputKey}
          </button>
        )}
      </div>
      <div className="flex-1">
        <MentionInput
          mentions={mentions}
          value={value}
          onChange={onChange}
          placeholder="Enter value or use @ to reference previous step outputs..."
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
function jsonSchemaToMentionItems(
  schema: Record<string, unknown>,
  prefix = "",
): MentionItem[] {
  if (schema?.type === "object" && schema?.properties) {
    return Object.entries(schema.properties as Record<string, unknown>).map(
      ([key, value]) => {
        const children = jsonSchemaToMentionItems(
          value as Record<string, unknown>,
          `${prefix}${key}.`,
        );
        return {
          id: `${prefix}${key}`,
          label: key,
          ...(children.length > 0 && { children }),
        };
      },
    );
  }
  if (schema?.type === "array" && schema?.items) {
    const itemSchema = schema?.items as Record<string, unknown>;
    return jsonSchemaToMentionItems(itemSchema, prefix);
  }
  return [];
}

function StepNameInput({ step }: { step: Step }) {
  const { updateStep } = useWorkflowActions();
  const [name, setName] = useState(step.name);

  const handleBlur = () => {
    if (name !== step.name && name.trim()) {
      updateStep(step.name, { name: name.trim() });
    } else {
      setName(step.name);
    }
  };

  return (
    <div className="px-4 py-3 border-b border-border">
      <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">
        Step Name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleBlur();
          }
        }}
        className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}

function ToolSelectors({
  step,
  onConnectionChange,
  onToolChange,
}: {
  step: Step & { action: ToolCallAction };
  onConnectionChange: (connectionId: string) => void;
  onToolChange: (toolName: string) => void;
}) {
  const connections = useConnections();
  const selectedConnection = useConnection(step?.action?.connectionId ?? "");
  const tools = selectedConnection?.tools ?? [];

  return (
    <div className="px-4 py-3 border-b border-border space-y-3">
      {/* MCP/Connection Select */}
      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">
          Connection
        </label>
        <Select
          value={step?.action?.connectionId ?? ""}
          onValueChange={onConnectionChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select connection">
              {selectedConnection && (
                <div className="flex items-center gap-2">
                  <IntegrationIcon
                    icon={selectedConnection.icon}
                    name={selectedConnection.title}
                    size="xs"
                  />
                  <span>{selectedConnection.title}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {connections.map((conn) => (
              <SelectItem key={conn.id} value={conn.id}>
                <div className="flex items-center gap-2">
                  <IntegrationIcon icon={conn.icon} name={conn.title} size="xs" />
                  <span>{conn.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tool Select */}
      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">
          Tool
        </label>
        <Select
          value={step?.action?.toolName ?? ""}
          onValueChange={onToolChange}
          disabled={!step?.action?.connectionId}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select tool" />
          </SelectTrigger>
          <SelectContent>
            {tools.map((tool) => (
              <SelectItem key={tool.name} value={tool.name}>
                {tool.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ToolAction() {
  const currentStep = useCurrentStep();
  const stepAsTool = currentStep as Step & {
    action: ToolCallAction;
  };
  const { updateStep } = useWorkflowActions();
  const { tool } = useTool(
    stepAsTool?.action?.connectionId ?? "",
    stepAsTool?.action?.toolName ?? "",
  );

  const handleConnectionChange = (connectionId: string) => {
    updateStep(stepAsTool.name, {
      action: { ...stepAsTool.action, connectionId, toolName: "" },
    });
  };

  const handleToolChange = (toolName: string) => {
    updateStep(stepAsTool.name, {
      action: { ...stepAsTool.action, toolName },
      outputSchema: tool?.outputSchema as Record<string, unknown> | null,
    });
  };

  return (
    <div className="w-full h-full flex flex-col">
      <ToolSelectors
        step={stepAsTool}
        onConnectionChange={handleConnectionChange}
        onToolChange={handleToolChange}
      />
      <StepNameInput step={stepAsTool} />
      {stepAsTool?.action?.toolName && (
          <SelectedTool step={stepAsTool} />
      )}
    </div>
  );
}

function useTool(connectionId: string, toolName: string) {
  const mcp = useMcp({
    url: `/mcp/${connectionId}`,
    enabled: !!connectionId && !!toolName,
  });
  const connection = useConnection(connectionId);
  const tool = connection?.tools?.find((t) => t.name === toolName);
  return {
    tool,
    mcp,
    connection,
  };
}

function getOutputVariables(step: Step): string[] {
  if (!step.outputSchema) return [];
  const schema = step.outputSchema as { properties?: Record<string, unknown> };
  if (!schema.properties) return [];
  return Object.keys(schema.properties);
}

function SelectedTool({
  step,
}: {
  step: Step & {
    action: ToolCallAction;
  };
}) {
  const { tool, mcp, connection } = useTool(
    step?.action?.connectionId ?? "",
    step?.action?.toolName ?? "",
  );
  const { updateStep } = useWorkflowActions();
  const trackingExecutionId = useTrackingExecutionId();
  const handleInputChange = (inputParams: Record<string, unknown>) => {
    if (!step?.action?.toolName) return;
    updateStep(step?.name, {
      input: inputParams,
    });
  };
  const workflowSteps = useWorkflowSteps();
  const currentStepIndex = workflowSteps.findIndex((s) => s.name === step.name);

  const allMentions = workflowSteps.slice(0, currentStepIndex).map((step) => ({
    id: step.name,
    label: step.name,
    children: jsonSchemaToMentionItems(
      step.outputSchema as Record<string, unknown>,
      `${step.name}.`,
    ),
  }));

  const outputVariables = getOutputVariables(step);
  const isInRunMode = !!trackingExecutionId;

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="overflow-scroll h-full">
      <ToolComponent
        tool={tool as McpTool}
        connection={connection}
        onInputChange={handleInputChange}
        initialInputParams={step?.input ?? {}}
        mentions={allMentions}
        mcp={mcp}
        showExecutionResult={isInRunMode}
        outputVariables={outputVariables}
      />
    </div>
  );
}
