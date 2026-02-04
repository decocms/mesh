import { Check } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";

const PRESET_COLORS = [
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#EF4444", // Red
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#6366F1", // Indigo
  "#64748B", // Slate
  "#000000", // Black
];

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn(
              "size-8 rounded-lg transition-all",
              value === color && "ring-2 ring-offset-2 ring-primary",
            )}
            style={{ backgroundColor: color }}
          >
            {value === color && <Check className="size-4 text-white mx-auto" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? "#3B82F6"}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 rounded cursor-pointer"
        />
        <span className="text-sm text-muted-foreground">Custom color</span>
      </div>
    </div>
  );
}
