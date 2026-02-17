/**
 * Schema Tree Component
 *
 * Renders a JSON Schema as an interactive collapsible tree.
 * Supports object/array nesting, $ref resolution with circular
 * reference protection, and type badges for leaf nodes.
 */

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SchemaTreeProps {
  schema: Record<string, unknown>;
}

type SchemaObject = Record<string, unknown>;

const MAX_DEPTH = 5;

/**
 * Resolve a $ref pointer against the root schema's $defs.
 * Tracks visited refs to prevent infinite recursion.
 */
function resolveRef(
  schema: SchemaObject,
  rootSchema: SchemaObject,
  visitedRefs: Set<string>,
): SchemaObject {
  if (!schema.$ref || typeof schema.$ref !== "string") {
    return schema;
  }

  const ref = schema.$ref;

  if (visitedRefs.has(ref)) {
    return { type: "object", description: "[circular reference]" };
  }

  visitedRefs.add(ref);

  const defName = ref.replace("#/$defs/", "");
  const defs = (rootSchema.$defs ?? rootSchema.definitions ?? {}) as Record<
    string,
    SchemaObject
  >;
  const resolved = defs[defName];

  if (!resolved) {
    return { type: "unknown", description: `Unresolved $ref: ${ref}` };
  }

  // Recursively resolve in case the resolved schema also has a $ref
  return resolveRef(resolved, rootSchema, visitedRefs);
}

function getTypeString(schema: SchemaObject): string {
  if (typeof schema.type === "string") return schema.type;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.properties) return "object";
  if (schema.items) return "array";
  if (schema.enum) return "enum";
  if (schema.oneOf) return "oneOf";
  if (schema.anyOf) return "anyOf";
  if (schema.allOf) return "allOf";
  return "unknown";
}

function isObjectNode(schema: SchemaObject): boolean {
  const type = getTypeString(schema);
  return type === "object" && !!schema.properties;
}

function isArrayNode(schema: SchemaObject): boolean {
  const type = getTypeString(schema);
  return type === "array" && !!schema.items;
}

interface SchemaNodeProps {
  schema: SchemaObject;
  name: string;
  depth: number;
  required?: string[];
  rootSchema: SchemaObject;
  visitedRefs: Set<string>;
}

function SchemaNode({
  schema,
  name,
  depth,
  required,
  rootSchema,
  visitedRefs,
}: SchemaNodeProps) {
  const resolved = resolveRef(schema, rootSchema, new Set(visitedRefs));
  const type = getTypeString(resolved);
  const isRequired = required?.includes(name) ?? false;
  const [open, setOpen] = useState(depth < 2);

  // Max depth guard
  if (depth >= MAX_DEPTH) {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2"
        style={{ paddingLeft: depth * 16 }}
      >
        <span className="text-sm font-medium">{name}</span>
        <Badge variant="outline" className="text-xs">
          {type}
        </Badge>
        <span className="text-xs text-muted-foreground">...</span>
      </div>
    );
  }

  // Object nodes with properties -- collapsible
  if (isObjectNode(resolved)) {
    const properties = resolved.properties as Record<string, SchemaObject>;
    const propertyCount = Object.keys(properties).length;
    const childRequired = (resolved.required ?? []) as string[];

    return (
      <div
        className={cn(depth > 0 && "border-l border-border ml-2")}
        style={{ paddingLeft: depth > 0 ? 4 : 0 }}
      >
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 py-1 px-2 w-full text-left hover:bg-muted/50 rounded-sm transition-colors">
            {open ? (
              <ChevronDown size={12} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={12} className="text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{name}</span>
            {isRequired && <span className="text-red-500 text-xs">*</span>}
            <Badge variant="outline" className="text-xs">
              object
            </Badge>
            <span className="text-xs text-muted-foreground">
              {propertyCount} {propertyCount === 1 ? "prop" : "props"}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {Object.entries(properties).map(([key, propSchema]) => (
              <SchemaNode
                key={key}
                schema={propSchema}
                name={key}
                depth={depth + 1}
                required={childRequired}
                rootSchema={rootSchema}
                visitedRefs={new Set(visitedRefs)}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  // Array nodes with items -- collapsible
  if (isArrayNode(resolved)) {
    const items = resolved.items as SchemaObject;
    const itemsType = getTypeString(items);

    return (
      <div
        className={cn(depth > 0 && "border-l border-border ml-2")}
        style={{ paddingLeft: depth > 0 ? 4 : 0 }}
      >
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 py-1 px-2 w-full text-left hover:bg-muted/50 rounded-sm transition-colors">
            {open ? (
              <ChevronDown size={12} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={12} className="text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{name}</span>
            {isRequired && <span className="text-red-500 text-xs">*</span>}
            <Badge variant="outline" className="text-xs">
              array
            </Badge>
            <span className="text-xs text-muted-foreground">
              of {itemsType}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SchemaNode
              schema={items}
              name="[items]"
              depth={depth + 1}
              rootSchema={rootSchema}
              visitedRefs={new Set(visitedRefs)}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  // Leaf nodes (string, number, boolean, etc.)
  return (
    <div
      className={cn(depth > 0 && "border-l border-border ml-2")}
      style={{ paddingLeft: depth > 0 ? 4 : 0 }}
    >
      <div className="flex items-center gap-2 py-1 px-2">
        <span className="text-sm font-medium">{name}</span>
        {isRequired && <span className="text-red-500 text-xs">*</span>}
        <Badge variant="outline" className="text-xs">
          {type}
        </Badge>
        {Array.isArray(resolved.enum) && (
          <span className="text-xs text-muted-foreground">
            [{(resolved.enum as unknown[]).map(String).join(", ")}]
          </span>
        )}
      </div>
      {typeof resolved.description === "string" && (
        <p
          className="text-xs text-muted-foreground px-2 pb-1"
          style={{ paddingLeft: depth > 0 ? 4 : 0 }}
        >
          {String(resolved.description)}
        </p>
      )}
    </div>
  );
}

/**
 * Root SchemaTree component.
 *
 * Accepts a JSON Schema object and renders it as a collapsible tree.
 */
export default function SchemaTree({ schema }: SchemaTreeProps) {
  if (
    !schema ||
    typeof schema !== "object" ||
    Object.keys(schema).length === 0
  ) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No schema properties defined.
      </p>
    );
  }

  const properties = schema.properties as
    | Record<string, SchemaObject>
    | undefined;

  if (!properties || Object.keys(properties).length === 0) {
    // Schema exists but has no properties -- still render what we can
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Schema structure</p>
        <pre className="text-xs font-mono bg-muted/30 rounded p-3 max-h-80 overflow-auto">
          {JSON.stringify(schema, null, 2)}
        </pre>
      </div>
    );
  }

  const required = (schema.required ?? []) as string[];

  return (
    <div className="space-y-0.5">
      {Object.entries(properties).map(([key, propSchema]) => (
        <SchemaNode
          key={key}
          schema={propSchema}
          name={key}
          depth={0}
          required={required}
          rootSchema={schema}
          visitedRefs={new Set()}
        />
      ))}
    </div>
  );
}
