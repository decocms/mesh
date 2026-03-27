import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWorkflow, useWorkflowActions } from "../stores/workflow";
import type { JsonSchema } from "@/web/utils/constants";
import { Code02, Database01, Edit04 } from "@untitledui/icons";
import { MonacoCodeEditor } from "./monaco-editor";
import { ToolInput } from "./tool-selection/components/tool-input";

interface InputSchemaPanelProps {
  className?: string;
}

const FIELD_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "Boolean" },
  { value: "object", label: "Object" },
  { value: "array", label: "Array" },
] as const;

const DEFAULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    field: { type: "string", description: "An input field" },
  },
  required: ["field"],
};

const MAX_DEPTH = 2;

export function InputSchemaPanel({ className }: InputSchemaPanelProps) {
  const workflow = useWorkflow();
  const { setWorkflow } = useWorkflowActions();
  const [viewMode, setViewMode] = useState<"visual" | "code">("visual");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInput, setPreviewInput] = useState<Record<string, unknown>>({});

  const inputSchema = (workflow.input_schema ?? null) as JsonSchema | null;

  const updateSchema = (schema: JsonSchema | undefined) => {
    setWorkflow({ ...workflow, input_schema: schema });
  };

  const handleCodeSave = (code: string) => {
    try {
      const parsed = JSON.parse(code);
      updateSchema(parsed);
    } catch {
      // Invalid JSON — don't update
    }
  };

  const handleInit = () => {
    updateSchema(DEFAULT_SCHEMA);
  };

  const handleClear = () => {
    updateSchema(undefined);
  };

  if (!inputSchema) {
    return (
      <div className={cn("flex flex-col h-full bg-sidebar", className)}>
        <PanelHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No input schema defined. Add one to require structured input when
            running this workflow.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleInit}
          >
            <Plus size={14} />
            Add input schema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-sidebar", className)}>
      <PanelHeader>
        <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
          <button
            type="button"
            className={cn(
              "h-6 px-2 rounded text-xs font-medium transition-colors",
              viewMode === "visual"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setViewMode("visual")}
          >
            <Edit04 size={12} />
          </button>
          <button
            type="button"
            className={cn(
              "h-6 px-2 rounded text-xs font-medium transition-colors",
              viewMode === "code"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setViewMode("code")}
          >
            <Code02 size={12} />
          </button>
        </div>
      </PanelHeader>

      {viewMode === "visual" ? (
        <>
          {/* Visual field editor */}
          <div className="flex-1 overflow-auto">
            <SchemaFieldList
              schema={inputSchema}
              onChange={(s) => updateSchema(s)}
              depth={0}
            />
          </div>
        </>
      ) : (
        /* Monaco JSON editor */
        <div className="flex-1 min-h-0">
          <MonacoCodeEditor
            key={`input-schema-${workflow.id}`}
            code={JSON.stringify(inputSchema, null, 2)}
            language="json"
            height="100%"
            onSave={handleCodeSave}
          />
        </div>
      )}

      {/* Preview (collapsible) */}
      <div className="shrink-0 border-t border-border">
        <button
          type="button"
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
          onClick={() => setPreviewOpen(!previewOpen)}
        >
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Preview
          </span>
          {previewOpen ? (
            <ChevronUp size={14} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </button>
        {previewOpen && (
          <div className="px-5 pb-4 max-h-64 overflow-auto">
            <ToolInput
              inputSchema={inputSchema}
              inputParams={previewInput}
              setInputParams={setPreviewInput}
              mentions={[]}
            />
          </div>
        )}
      </div>

      {/* Remove */}
      <div className="px-5 py-3 shrink-0 border-t border-border">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          onClick={handleClear}
        >
          Remove input schema
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel Header
// ─────────────────────────────────────────────────────────────────────────────

function PanelHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="border-b border-border p-5 shrink-0 flex items-center gap-2">
      <Database01 className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-base font-medium text-foreground flex-1">
        Workflow Input
      </span>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual Schema Editor
// ─────────────────────────────────────────────────────────────────────────────

function SchemaFieldList({
  schema,
  onChange,
  depth,
}: {
  schema: JsonSchema;
  onChange: (schema: JsonSchema) => void;
  depth: number;
}) {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = (schema.required ?? []) as string[];

  const addField = () => {
    const existing = Object.keys(properties);
    let name = "field";
    let i = 1;
    while (existing.includes(name)) {
      name = `field_${i}`;
      i++;
    }
    onChange({
      ...schema,
      properties: { ...properties, [name]: { type: "string" } },
      required: [...required, name],
    });
  };

  const removeField = (name: string) => {
    const { [name]: _, ...rest } = properties;
    onChange({
      ...schema,
      properties: rest,
      required: required.filter((r) => r !== name),
    });
  };

  const updateField = (name: string, fieldSchema: JsonSchema) => {
    onChange({
      ...schema,
      properties: { ...properties, [name]: fieldSchema },
    });
  };

  const renameField = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName || properties[newName]) return;
    const newProperties: Record<string, JsonSchema> = {};
    for (const [key, val] of Object.entries(properties)) {
      newProperties[key === oldName ? newName : key] = val;
    }
    onChange({
      ...schema,
      properties: newProperties,
      required: required.map((r) => (r === oldName ? newName : r)),
    });
  };

  const toggleRequired = (name: string) => {
    const isReq = required.includes(name);
    onChange({
      ...schema,
      required: isReq
        ? required.filter((r) => r !== name)
        : [...required, name],
    });
  };

  const entries = Object.entries(properties);

  return (
    <div>
      {entries.length === 0 && depth === 0 && (
        <div className="p-5 text-sm text-muted-foreground text-center">
          No fields defined yet.
        </div>
      )}
      <div className="divide-y divide-border">
        {entries.map(([name, fieldSchema]) => (
          <SchemaFieldRow
            key={name}
            name={name}
            schema={fieldSchema}
            isRequired={required.includes(name)}
            depth={depth}
            onRename={(newName) => renameField(name, newName)}
            onUpdate={(updated) => updateField(name, updated)}
            onToggleRequired={() => toggleRequired(name)}
            onRemove={() => removeField(name)}
          />
        ))}
      </div>
      <div className={cn("p-3", depth > 0 && "pb-1")}>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={addField}
        >
          <Plus size={14} />
          Add field
        </Button>
      </div>
    </div>
  );
}

function SchemaFieldRow({
  name,
  schema,
  isRequired,
  depth,
  onRename,
  onUpdate,
  onToggleRequired,
  onRemove,
}: {
  name: string;
  schema: JsonSchema;
  isRequired: boolean;
  depth: number;
  onRename: (newName: string) => void;
  onUpdate: (schema: JsonSchema) => void;
  onToggleRequired: () => void;
  onRemove: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);

  const fieldType = schema.type ?? "string";
  const isArray = fieldType === "array";
  const isObject = fieldType === "object";
  const canNest = depth < MAX_DEPTH;

  const commitRename = () => {
    setEditingName(false);
    if (draftName.trim() && draftName !== name) {
      onRename(draftName.trim());
    } else {
      setDraftName(name);
    }
  };

  const handleTypeChange = (newType: string) => {
    const base: JsonSchema = { type: newType };
    if (schema.description) base.description = schema.description;

    if (newType === "array") {
      base.items = schema.items ?? { type: "string" };
    }
    if (newType === "object" && canNest) {
      base.properties = schema.properties ?? {};
      base.required = schema.required ?? [];
    }
    onUpdate(base);
  };

  const handleDescriptionChange = (desc: string) => {
    const updated = { ...schema };
    if (desc) {
      updated.description = desc;
    } else {
      delete updated.description;
    }
    onUpdate(updated);
  };

  const handleItemsTypeChange = (itemType: string) => {
    const itemsSchema: JsonSchema = { type: itemType };
    if (itemType === "object" && canNest) {
      itemsSchema.properties = (schema.items as JsonSchema)?.properties ?? {};
      itemsSchema.required = (schema.items as JsonSchema)?.required ?? [];
    }
    onUpdate({ ...schema, items: itemsSchema });
  };

  return (
    <div className={cn("flex flex-col gap-2 p-4", depth > 0 && "py-3")}>
      {/* Row: name + type + remove */}
      <div className="flex items-center gap-2">
        {editingName ? (
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraftName(name);
                setEditingName(false);
              }
            }}
            className="h-7 text-sm font-medium flex-1 min-w-0"
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-foreground flex-1 text-left truncate hover:underline cursor-text min-w-0"
            onClick={() => {
              setDraftName(name);
              setEditingName(true);
            }}
          >
            {name}
          </button>
        )}

        <Select value={fieldType} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-7 w-24 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </Button>
      </div>

      {/* Description */}
      <Input
        value={schema.description ?? ""}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        placeholder="Description (optional)"
        className="h-7 text-xs text-muted-foreground"
      />

      {/* Required toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={onToggleRequired}
          className="rounded border-border"
        />
        <span className="text-xs text-muted-foreground">Required</span>
      </label>

      {/* Array: items type */}
      {isArray && (
        <div className="flex items-center gap-2 pl-2 border-l-2 border-border ml-1">
          <span className="text-xs text-muted-foreground">Items:</span>
          <Select
            value={(schema.items as JsonSchema)?.type ?? "string"}
            onValueChange={handleItemsTypeChange}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Array with object items: nested fields */}
      {isArray &&
        canNest &&
        (schema.items as JsonSchema)?.type === "object" && (
          <div className="pl-2 border-l-2 border-border ml-1">
            <span className="text-xs text-muted-foreground mb-1 block">
              Item properties:
            </span>
            <SchemaFieldList
              schema={schema.items as JsonSchema}
              onChange={(itemsSchema) =>
                onUpdate({ ...schema, items: itemsSchema })
              }
              depth={depth + 1}
            />
          </div>
        )}

      {/* Object: nested fields */}
      {isObject && canNest && (
        <div className="pl-2 border-l-2 border-border ml-1">
          <span className="text-xs text-muted-foreground mb-1 block">
            Properties:
          </span>
          <SchemaFieldList
            schema={schema}
            onChange={(updated) => onUpdate(updated)}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}
