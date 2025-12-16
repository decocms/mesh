import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useBindingSchemaFromRegistry } from "@/web/hooks/use-binding-schema-from-registry";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Loader2 } from "lucide-react";
import Form from "@rjsf/shadcn";
import validator from "@rjsf/validator-ajv8";
import type { FieldTemplateProps, ObjectFieldTemplateProps } from "@rjsf/utils";
import { BindingSelector } from "./binding-selector";
import { useNavigate } from "@tanstack/react-router";

interface McpConfigurationResult {
  stateSchema: Record<string, unknown>;
  scopes?: string[];
}

export function useMcpConfiguration(connectionId: string) {
  const toolCaller = createToolCaller(connectionId);

  const {
    data: configResult,
    isLoading,
    error,
  } = useToolCall<Record<string, never>, McpConfigurationResult>({
    toolCaller,
    toolName: "MCP_CONFIGURATION",
    toolInputParams: {},
    enabled: !!connectionId,
  });

  const stateSchema = configResult?.stateSchema ?? {
    type: "object",
    properties: {},
  };

  const scopes = configResult?.scopes ?? [];

  return { stateSchema, scopes, isLoading, error };
}

export interface McpConfigurationFormProps {
  formState: Record<string, unknown>;
  onFormStateChange: (state: Record<string, unknown>) => void;
  stateSchema: Record<string, unknown>;
  isLoading: boolean;
  error: Error | null;
}

interface FormContext {
  onFieldChange: (fieldPath: string, value: unknown) => void;
  formData: Record<string, unknown>;
  onAddNew: () => void;
}

/**
 * Check if a schema property represents a binding field
 */
function isBindingField(schema: Record<string, unknown>): boolean {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return false;

  const typeProperty = properties.__type as Record<string, unknown> | undefined;
  const bindingProperty = properties.__binding as
    | Record<string, unknown>
    | undefined;

  return !!(typeProperty?.const || bindingProperty?.const);
}

/**
 * Extract binding info from schema
 */
function getBindingInfo(schema: Record<string, unknown>): {
  bindingType?: string;
  bindingSchema?: unknown;
} {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return {};

  const typeProperty = properties.__type as Record<string, unknown> | undefined;
  const bindingProperty = properties.__binding as
    | Record<string, unknown>
    | undefined;

  return {
    bindingType: typeProperty?.const as string | undefined,
    bindingSchema: bindingProperty?.const,
  };
}

/**
 * Extract field name from child element id
 * e.g., "root_llm___type" -> "llm", "root_model_value" -> "model"
 */
function extractFieldName(childId: string): string {
  // Remove "root_" prefix and get the first segment
  const withoutRoot = childId.replace(/^root_/, "");
  // Split by underscore and get the first part (the field name)
  const parts = withoutRoot.split("_");
  return parts[0] || "";
}

/**
 * Check if a binding schema value represents an app name that needs dynamic resolution
 * @example "@deco/database" -> true, "deco/database" -> true, [{name: "TOOL"}] -> false
 */
function isDynamicBindingSchema(
  bindingSchema: unknown,
): bindingSchema is string {
  if (typeof bindingSchema !== "string") return false;
  // Check for @scope/app or scope/app format
  const normalized = bindingSchema.startsWith("@")
    ? bindingSchema.slice(1)
    : bindingSchema;
  return normalized.includes("/");
}

/**
 * Props for BindingFieldWithDynamicSchema component
 */
interface BindingFieldWithDynamicSchemaProps {
  bindingSchema: unknown;
  bindingType?: string;
  currentValue: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  onAddNew: () => void;
  className?: string;
}

/**
 * Wrapper component that handles dynamic binding schema resolution from registry.
 * If bindingSchema is an app name (e.g., "@deco/database"), it fetches the
 * binding tools from the registry and uses them for filtering.
 */
function BindingFieldWithDynamicSchema({
  bindingSchema,
  bindingType,
  currentValue,
  onValueChange,
  placeholder,
  onAddNew,
  className,
}: BindingFieldWithDynamicSchemaProps) {
  // Check if we need to resolve binding schema from registry
  // Priority: use bindingSchema if it's a dynamic app name, otherwise check bindingType
  const bindingSchemaIsDynamic = isDynamicBindingSchema(bindingSchema);
  const bindingTypeIsDynamic = isDynamicBindingSchema(bindingType);
  const needsDynamicResolution = bindingSchemaIsDynamic || bindingTypeIsDynamic;

  // Determine which value to use for dynamic resolution
  // - If bindingSchema is a dynamic app name (e.g., "@deco/database"), use it
  // - Otherwise if bindingType is a dynamic app name (e.g., "@deco/postgres"), use that
  const dynamicAppName = bindingSchemaIsDynamic
    ? (bindingSchema as string)
    : bindingTypeIsDynamic
      ? bindingType
      : undefined;

  // Use the hook to fetch binding schema from registry (only when needed)
  const { bindingSchema: resolvedSchema, isLoading: isResolvingSchema } =
    useBindingSchemaFromRegistry(dynamicAppName);

  // Determine the final binding to use:
  // 1. If dynamic resolution is needed and we got a result, use it
  // 2. If bindingSchema is an array of tools, use it directly
  // 3. If bindingSchema is a well-known binding name (string without /), use it directly
  // 4. Otherwise, undefined (no filtering)
  const resolvedBinding = (() => {
    if (needsDynamicResolution) {
      // Use resolved schema from registry, or undefined while loading
      return resolvedSchema;
    }
    if (Array.isArray(bindingSchema)) {
      // Direct array of tools
      return bindingSchema as Array<{
        name: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
    }
    if (typeof bindingSchema === "string") {
      // Well-known binding name (e.g., "LLMS", "AGENTS")
      return bindingSchema;
    }
    return undefined;
  })();

  // Show loading indicator if we're resolving schema
  if (needsDynamicResolution && isResolvingSchema) {
    return (
      <div className={className ?? "w-[200px] shrink-0"}>
        <div className="flex items-center justify-center h-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-xs">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <BindingSelector
      value={currentValue}
      onValueChange={onValueChange}
      placeholder={placeholder}
      binding={resolvedBinding}
      bindingType={bindingType}
      onAddNew={onAddNew}
      className={className}
    />
  );
}

/**
 * Custom ObjectFieldTemplate that handles binding fields specially
 */
function CustomObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { schema, formData, title, description, registry } = props;
  const formContext = registry.formContext as FormContext | undefined;

  // Extract the field name from the first child element's content key/id
  // Each element in properties has a content with a key that contains the field path
  const firstChildKey = props.properties[0]?.content?.key as string | undefined;

  // Use title if available (it's the actual field name like "DATABASE")
  // Fall back to extracting from child key only if title is not available
  const fieldPath =
    title || (firstChildKey ? extractFieldName(firstChildKey) : "");

  // Check if this is a binding field (has __type or __binding in properties)
  if (isBindingField(schema as Record<string, unknown>)) {
    const { bindingType, bindingSchema } = getBindingInfo(
      schema as Record<string, unknown>,
    );
    const currentValue = (formData?.value as string) || "";

    const handleBindingChange = (newValue: string) => {
      const newFieldData = {
        ...formData,
        value: newValue,
        ...(bindingType && { __type: bindingType }),
      };
      formContext?.onFieldChange(fieldPath, newFieldData);
    };

    // Format title to Title Case
    // e.g., "DATABASE" -> "Database", "llm_model" -> "Llm Model"
    const formatTitle = (str: string) =>
      str
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const displayTitle = title ? formatTitle(title) : formatTitle(fieldPath);

    return (
      <div className="flex items-center gap-3 justify-between">
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium truncate block">
            {displayTitle}
          </label>
          {description && (
            <p className="text-xs text-muted-foreground truncate">
              {description}
            </p>
          )}
        </div>
        <BindingFieldWithDynamicSchema
          bindingSchema={bindingSchema}
          bindingType={bindingType}
          currentValue={currentValue}
          onValueChange={handleBindingChange}
          placeholder={`Select ${displayTitle.toLowerCase()}...`}
          onAddNew={() => formContext?.onAddNew()}
          className="w-[200px] shrink-0"
        />
      </div>
    );
  }

  // Default rendering for non-binding objects
  return (
    <div className="flex flex-col gap-4">
      {props.properties.map((element) => element.content)}
    </div>
  );
}

/**
 * Custom FieldTemplate for better styling
 */
function CustomFieldTemplate(props: FieldTemplateProps) {
  const { label, children, description, id, schema } = props;

  // Skip rendering for binding internal fields
  if (id.includes("__type") || id.includes("__binding")) {
    return null;
  }

  // For object types, let ObjectFieldTemplate handle everything
  if (schema.type === "object") {
    return children;
  }

  return (
    <div className="flex items-center gap-3 justify-between">
      <div className="flex-1 min-w-0">
        {label && (
          <label className="text-sm font-medium truncate block" htmlFor={id}>
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs text-muted-foreground truncate">
            {description}
          </p>
        )}
      </div>
      <div className="w-[200px] shrink-0">{children}</div>
    </div>
  );
}

export function McpConfigurationForm({
  formState,
  onFormStateChange,
  stateSchema,
  isLoading,
  error,
}: McpConfigurationFormProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const handleChange = (data: { formData?: Record<string, unknown> }) => {
    if (data.formData) {
      onFormStateChange(data.formData);
    }
  };

  const handleFieldChange = (fieldPath: string, value: unknown) => {
    const newFormState = { ...formState, [fieldPath]: value };
    onFormStateChange(newFormState);
  };

  const handleAddNew = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const formContext: FormContext = {
    onFieldChange: handleFieldChange,
    formData: formState,
    onAddNew: handleAddNew,
  };

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-20 items-center justify-center text-muted-foreground">
        Failed to load configuration: {(error as Error).message}
      </div>
    );
  }

  const hasProperties =
    stateSchema.properties &&
    typeof stateSchema.properties === "object" &&
    Object.keys(stateSchema.properties).length > 0;

  if (!hasProperties) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No configuration available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-5">
      <Form
        schema={stateSchema}
        validator={validator}
        formData={formState}
        onChange={handleChange}
        formContext={formContext}
        liveValidate={false}
        showErrorList={false}
        templates={{
          ObjectFieldTemplate: CustomObjectFieldTemplate,
          FieldTemplate: CustomFieldTemplate,
        }}
      >
        {/* Hide default submit button */}
        <></>
      </Form>
    </div>
  );
}
