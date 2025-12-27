import { ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@deco/ui/components/checkbox.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import type { JsonSchema } from "@/web/utils/constants";
import {
  useOutputSchemaActions,
  useIsPathSelected,
} from "../../stores/output-schema-selection";
import { cn } from "@deco/ui/lib/utils.js";
import { useOutputSchemaSelection } from "./hooks/use-output-schema";

// =============================================================================
// Types
// =============================================================================

interface PropertyContext {
  path: string;
  name: string;
  schema: JsonSchema;
  isRequired: boolean;
  depth: number;
}

// =============================================================================
// Composite Components
// =============================================================================

/**
 * Root component - Entry point for rendering a JSON schema.
 */
function Root({ className }: { className?: string }) {
  const { schema } = useOutputSchemaSelection();
  if (!schema.properties) {
    return null;
  }

  const required = schema.required ?? [];

  return (
    <div className={cn("flex flex-col", className)}>
      {Object.entries(schema.properties).map(([key, prop]) => (
        <Property
          key={key}
          name={key}
          path={key}
          schema={prop}
          isRequired={required.includes(key)}
          depth={0}
        />
      ))}
    </div>
  );
}

/**
 * Property component - Renders a single property based on its type.
 * This is the main dispatch component in the composite pattern.
 */
function Property({ name, path, schema, isRequired, depth }: PropertyContext) {
  const type = schema.type;

  if (type === "object") {
    return (
      <ObjectProperty
        name={name}
        path={path}
        schema={schema}
        isRequired={isRequired}
        depth={depth}
      />
    );
  }

  if (type === "array") {
    return (
      <ArrayProperty
        name={name}
        path={path}
        schema={schema}
        isRequired={isRequired}
        depth={depth}
      />
    );
  }

  return (
    <PrimitiveProperty
      name={name}
      path={path}
      schema={schema}
      isRequired={isRequired}
      depth={depth}
    />
  );
}

/**
 * ObjectProperty - Renders an object with nested properties.
 * Uses Collapsible for expand/collapse functionality.
 */
function ObjectProperty({
  name,
  path,
  schema,
  isRequired,
  depth,
}: PropertyContext) {
  const { togglePath } = useOutputSchemaActions();
  const isSelected = useIsPathSelected(path);
  const properties = schema.properties;
  const required = schema.required ?? [];

  if (!properties) {
    return (
      <PrimitiveProperty
        name={name}
        path={path}
        schema={schema}
        isRequired={isRequired}
        depth={depth}
      />
    );
  }

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors",
          depth > 0 && "ml-4",
        )}
      >
        <PropertyCheckbox
          path={path}
          isSelected={isSelected}
          onToggle={() => togglePath(path)}
        />

        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
          <span className="group-data-[state=open]/collapsible:hidden">
            <ChevronRight className="size-4 text-muted-foreground" />
          </span>
          <span className="group-data-[state=closed]/collapsible:hidden">
            <ChevronDown className="size-4 text-muted-foreground" />
          </span>

          <PropertyName name={name} isRequired={isRequired} />
          <TypeBadge type="object" />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div
          className={cn(
            "border-l border-border ml-4 pl-2",
            depth > 0 && "ml-8",
          )}
        >
          {Object.entries(properties).map(([key, prop]) => (
            <Property
              key={key}
              name={key}
              path={`${path}.${key}`}
              schema={prop}
              isRequired={required.includes(key)}
              depth={depth + 1}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * ArrayProperty - Renders an array type with its item schema.
 */
function ArrayProperty({
  name,
  path,
  schema,
  isRequired,
  depth,
}: PropertyContext) {
  const { togglePath } = useOutputSchemaActions();
  const isSelected = useIsPathSelected(path);
  const items = schema.items;

  if (!items || (items.type !== "object" && items.type !== "array")) {
    // Simple array with primitive items
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors",
          depth > 0 && "ml-4",
        )}
      >
        <PropertyCheckbox
          path={path}
          isSelected={isSelected}
          onToggle={() => togglePath(path)}
        />
        <PropertyName name={name} isRequired={isRequired} />
        <TypeBadge type="array" itemType={items?.type} />
      </div>
    );
  }

  // Array with complex items
  return (
    <Collapsible defaultOpen className="group/collapsible">
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors",
          depth > 0 && "ml-4",
        )}
      >
        <PropertyCheckbox
          path={path}
          isSelected={isSelected}
          onToggle={() => togglePath(path)}
        />

        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
          <span className="group-data-[state=open]/collapsible:hidden">
            <ChevronRight className="size-4 text-muted-foreground" />
          </span>
          <span className="group-data-[state=closed]/collapsible:hidden">
            <ChevronDown className="size-4 text-muted-foreground" />
          </span>

          <PropertyName name={name} isRequired={isRequired} />
          <TypeBadge type="array" itemType={items.type} />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div
          className={cn(
            "border-l border-border ml-4 pl-2",
            depth > 0 && "ml-8",
          )}
        >
          {items.type === "object" && items.properties ? (
            Object.entries(items.properties).map(([key, prop]) => (
              <Property
                key={key}
                name={key}
                path={`${path}.${key}`}
                schema={prop}
                isRequired={(items.required ?? []).includes(key)}
                depth={depth + 1}
              />
            ))
          ) : items.type === "array" ? (
            <Property
              name="items"
              path={path}
              schema={items}
              isRequired={false}
              depth={depth + 1}
            />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * PrimitiveProperty - Renders a leaf property (string, number, boolean, etc.)
 */
function PrimitiveProperty({
  name,
  path,
  schema,
  isRequired,
  depth,
}: PropertyContext) {
  const { togglePath } = useOutputSchemaActions();
  const isSelected = useIsPathSelected(path);

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors",
        depth > 0 && "ml-4",
      )}
    >
      <PropertyCheckbox
        path={path}
        isSelected={isSelected}
        onToggle={() => togglePath(path)}
      />
      <PropertyName name={name} isRequired={isRequired} />
      <TypeBadge type={schema.type} format={schema.format} />
      {schema.description && (
        <span
          className="text-xs text-muted-foreground truncate max-w-48"
          title={schema.description}
        >
          {schema.description}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Primitive UI Components
// =============================================================================

function PropertyCheckbox({
  path,
  isSelected,
  onToggle,
}: {
  path: string;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <Checkbox
      checked={isSelected}
      onCheckedChange={onToggle}
      aria-label={`Select ${path}`}
      className="shrink-0"
    />
  );
}

function PropertyName({
  name,
  isRequired,
}: {
  name: string;
  isRequired: boolean;
}) {
  return (
    <span className="font-mono text-sm flex items-center gap-1">
      {name}
      {isRequired && <span className="text-destructive">*</span>}
    </span>
  );
}

function TypeBadge({
  type,
  format,
  itemType,
}: {
  type?: string;
  format?: string;
  itemType?: string;
}) {
  const displayType = format ? `${type}:${format}` : type;
  const fullType = itemType ? `${displayType}[${itemType}]` : displayType;

  return (
    <Badge variant="outline" className="text-xs font-mono shrink-0">
      {fullType ?? "unknown"}
    </Badge>
  );
}

// =============================================================================
// Exports - Composite Pattern API
// =============================================================================

export const OutputSchema = {
  Root,
  Property,
  Object: ObjectProperty,
  Array: ArrayProperty,
  Primitive: PrimitiveProperty,
};
