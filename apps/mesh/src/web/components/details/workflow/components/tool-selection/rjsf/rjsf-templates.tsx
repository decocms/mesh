import type {
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  ArrayFieldTemplateProps,
  TemplatesType,
} from "@rjsf/utils";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Type,
  Hash,
  Braces,
  Box,
  CheckSquare,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@deco/ui/lib/utils.ts";

function getTypeIcon(type: string | string[] | undefined) {
  const typeStr = Array.isArray(type) ? type[0] : (type ?? "unknown");
  switch (typeStr) {
    case "string":
      return { Icon: Type, color: "text-blue-500" };
    case "number":
    case "integer":
      return { Icon: Hash, color: "text-blue-500" };
    case "array":
      return { Icon: Braces, color: "text-purple-500" };
    case "object":
      return { Icon: Box, color: "text-orange-500" };
    case "boolean":
      return { Icon: CheckSquare, color: "text-pink-500" };
    case "null":
      return { Icon: X, color: "text-gray-500" };
    default:
      return { Icon: FileText, color: "text-muted-foreground" };
  }
}

/**
 * Custom FieldTemplate - wraps each field with label, description, and type indicator
 */
function CustomFieldTemplate(props: FieldTemplateProps) {
  const { id, label, required, description, children, schema, hidden } = props;

  if (hidden) return <div className="hidden">{children}</div>;

  // Don't show label/description for root object
  if (id === "root") {
    return <div className="space-y-4">{children}</div>;
  }

  const schemaType = Array.isArray(schema.type)
    ? schema.type[0]
    : (schema.type ?? "string");
  const { Icon, color } = getTypeIcon(schemaType);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {label}
        </label>
        {required && <span className="text-red-500 text-xs">*</span>}
        <Icon size={14} className={cn(color, "ml-auto")} />
      </div>
      {description && (
        <div className="text-xs text-muted-foreground mb-1">{description}</div>
      )}
      {children}
    </div>
  );
}

/**
 * Custom ObjectFieldTemplate - renders nested objects with left border indent
 */
function CustomObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { properties, title } = props;
  // Use title to determine if root - root usually has no title or "Root"
  const isRoot = !title || title === "Root";

  // Root object - no wrapper
  if (isRoot) {
    return (
      <div className="space-y-4">
        {properties.map((prop) => (
          <div key={prop.name}>{prop.content}</div>
        ))}
      </div>
    );
  }

  // Nested object - show with left border
  return (
    <div className="pl-4 border-l-2 border-border/50 space-y-4">
      {properties.map((prop) => (
        <div key={prop.name}>{prop.content}</div>
      ))}
    </div>
  );
}

/**
 * Custom ArrayFieldTemplate - renders arrays with add/remove controls
 */
function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title } = props;

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={(item as any).key || (item as any).index}
            className="flex gap-2 items-start"
          >
            <div className="flex-1">{item}</div>
          </div>
        ))}
      </div>
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={onAddClick}
        >
          + Add {title || "item"}
        </Button>
      )}
    </div>
  );
}

/**
 * Custom UnsupportedFieldTemplate - hides unsupported field errors
 */
function CustomUnsupportedFieldTemplate() {
  // Return null to hide unsupported field errors
  return null;
}

/**
 * Custom ErrorListTemplate - hides the error list at the top of the form
 */
function CustomErrorListTemplate() {
  // Return null to hide error list
  return null;
}

// Custom templates registry
export const customTemplates: Partial<TemplatesType> = {
  FieldTemplate: CustomFieldTemplate,
  ObjectFieldTemplate: CustomObjectFieldTemplate,
  ArrayFieldTemplate: CustomArrayFieldTemplate,
  UnsupportedFieldTemplate: CustomUnsupportedFieldTemplate,
  ErrorListTemplate: CustomErrorListTemplate,
};
