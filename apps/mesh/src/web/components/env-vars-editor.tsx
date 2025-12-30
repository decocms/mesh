import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Plus, Trash01 } from "@untitledui/icons";

export interface EnvVar {
  key: string;
  value: string;
}

interface EnvVarsEditorProps {
  value: EnvVar[];
  onChange: (envVars: EnvVar[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  className?: string;
}

export function EnvVarsEditor({
  value,
  onChange,
  keyPlaceholder = "VARIABLE_NAME",
  valuePlaceholder = "value...",
  className,
}: EnvVarsEditorProps) {
  const handleAdd = () => {
    onChange([...value, { key: "", value: "" }]);
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyChange = (index: number, key: string) => {
    const newEnvVars = [...value];
    const current = newEnvVars[index];
    if (current) {
      newEnvVars[index] = { key, value: current.value };
      onChange(newEnvVars);
    }
  };

  const handleValueChange = (index: number, newValue: string) => {
    const newEnvVars = [...value];
    const current = newEnvVars[index];
    if (current) {
      newEnvVars[index] = { key: current.key, value: newValue };
      onChange(newEnvVars);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        {value.map((envVar, index) => (
          <div key={index} className="flex gap-2 items-center">
            <Input
              placeholder={keyPlaceholder}
              value={envVar.key}
              onChange={(e) => handleKeyChange(index, e.target.value)}
              className="h-10 rounded-lg flex-1 font-mono text-sm"
            />
            <Input
              type="password"
              placeholder={valuePlaceholder}
              value={envVar.value}
              onChange={(e) => handleValueChange(index, e.target.value)}
              className="h-10 rounded-lg flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(index)}
            >
              <Trash01 size={16} />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-9 text-muted-foreground"
          onClick={handleAdd}
        >
          <Plus size={16} className="mr-1" />
          Add Environment Variable
        </Button>
      </div>
    </div>
  );
}

/**
 * Convert EnvVar array to Record for API
 */
export function envVarsToRecord(envVars: EnvVar[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { key, value } of envVars) {
    if (key.trim()) {
      record[key.trim()] = value;
    }
  }
  return record;
}

/**
 * Convert Record to EnvVar array for form
 */
export function recordToEnvVars(
  record: Record<string, string> | undefined | null,
): EnvVar[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}
