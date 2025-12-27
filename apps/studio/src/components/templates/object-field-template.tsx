import { useState } from "react";
import type { ObjectFieldTemplateProps } from "@rjsf/utils";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { title, description, properties, idSchema } = props;
  const [isOpen, setIsOpen] = useState(true);

  // Check if this is the root object
  const isRoot = !idSchema || idSchema.$id === "root";

  // Render root without wrapper
  if (isRoot) {
    return (
      <div className="space-y-4">
        {properties.map((prop) => (
          <div key={prop.name}>{prop.content}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {title && <span className="font-medium text-sm">{title}</span>}
          {description && (
            <span className="text-xs text-muted-foreground ml-2">
              {description}
            </span>
          )}
        </div>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="p-4 space-y-4 border-t border-border">
          {properties.map((prop) => (
            <div key={prop.name}>{prop.content}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

