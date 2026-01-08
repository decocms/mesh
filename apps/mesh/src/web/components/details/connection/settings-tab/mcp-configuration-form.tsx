import { useConnections } from "@/web/hooks/collections/use-connection";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useBindingSchemaFromRegistry } from "@/web/hooks/use-binding-schema-from-registry";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Loading01, Plus } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import RjsfForm from "@rjsf/shadcn";
import type { FieldTemplateProps, ObjectFieldTemplateProps } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

interface McpConfigurationFormProps {
  formState: Record<string, unknown>;
  onFormStateChange: (state: Record<string, unknown>) => void;
  stateSchema: Record<string, unknown>;
}

interface FormContext {
  onFieldChange: (fieldPath: string, value: unknown) => void;
  formData: Record<string, unknown>;
  onAddNew: () => void;
}

/**
 * Check if a schema property represents a binding field.
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
 * Extract binding info from schema.
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
 * Extract field name from child element id.
 * e.g., "root_llm___type" -> "llm", "root_model_value" -> "model"
 */
function extractFieldName(childId: string): string {
  const withoutRoot = childId.replace(/^root_/, "");
  const parts = withoutRoot.split("_");
  return parts[0] || "";
}

/**
 * Check if a binding schema value represents an app name that needs dynamic resolution.
 * @example "@deco/database" -> true, "deco/database" -> true, [{name: "TOOL"}] -> false
 */
function isDynamicBindingSchema(
  bindingSchema: unknown,
): bindingSchema is string {
  if (typeof bindingSchema !== "string") return false;
  const normalized = bindingSchema.startsWith("@")
    ? bindingSchema.slice(1)
    : bindingSchema;
  return normalized.includes("/");
}

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
  const bindingSchemaIsDynamic = isDynamicBindingSchema(bindingSchema);
  const bindingTypeIsDynamic = isDynamicBindingSchema(bindingType);
  const needsDynamicResolution = bindingSchemaIsDynamic || bindingTypeIsDynamic;

  const dynamicAppName = bindingSchemaIsDynamic
    ? (bindingSchema as string)
    : bindingTypeIsDynamic
      ? bindingType
      : undefined;

  const { bindingSchema: registrySchema } =
    useBindingSchemaFromRegistry(dynamicAppName);

  const resolvedBinding = (() => {
    if (needsDynamicResolution) {
      return registrySchema;
    }
    if (Array.isArray(bindingSchema)) {
      return bindingSchema as Array<{
        name: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
    }
    if (typeof bindingSchema === "string") {
      return bindingSchema;
    }
    return undefined;
  })();

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

interface BindingSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  binding?:
    | string
    | Array<{
        name: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
  bindingType?: string;
  onAddNew?: () => void;
  className?: string;
}

function BindingSelector({
  value,
  onValueChange,
  placeholder = "Select a connection...",
  binding,
  bindingType,
  onAddNew,
  className,
}: BindingSelectorProps) {
  const [isLocalInstalling, setIsLocalInstalling] = useState(false);
  const { installByBinding, isInstalling: isGlobalInstalling } =
    useInstallFromRegistry();

  const isInstalling = isLocalInstalling || isGlobalInstalling;

  const allConnections = useConnections();
  const filteredConnections = useBindingConnections({
    connections: allConnections,
    binding: binding,
  });

  const parsedBindingType = (() => {
    if (!bindingType?.startsWith("@")) return null;
    const [scope, appName] = bindingType.replace("@", "").split("/");
    return scope && appName ? { scope, appName } : null;
  })();

  const connections = (() => {
    let result = filteredConnections;

    const hasBindingSchema = Array.isArray(binding) && binding.length > 0;

    if (parsedBindingType && !hasBindingSchema) {
      result = result.filter((conn) => {
        const connAppName = conn.app_name;
        const connScopeName = (conn.metadata as Record<string, unknown> | null)
          ?.scopeName as string | undefined;

        return (
          connAppName === parsedBindingType.appName &&
          connScopeName === parsedBindingType.scope
        );
      });
    }

    if (value && !result.some((c) => c.id === value)) {
      const selectedConnection = allConnections?.find((c) => c.id === value);
      if (selectedConnection) {
        return [selectedConnection, ...result];
      }
    }

    return result;
  })();

  const canInstallInline = bindingType?.startsWith("@");

  const handleCreateConnection = async () => {
    if (canInstallInline && bindingType) {
      setIsLocalInstalling(true);
      try {
        const result = await installByBinding(bindingType);
        if (result) {
          onValueChange(result.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to connect MCP: ${message}`);
      } finally {
        setIsLocalInstalling(false);
      }
      return;
    }

    onAddNew?.();
  };

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger size="sm" className={className ?? "w-[200px]"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {connections.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No connections found
          </div>
        ) : (
          connections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              <div className="flex items-center gap-2">
                {connection.icon ? (
                  <img
                    src={connection.icon}
                    alt={connection.title}
                    className="w-4 h-4 rounded"
                  />
                ) : (
                  <div className="w-4 h-4 rounded bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {connection.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span>{connection.title}</span>
              </div>
            </SelectItem>
          ))
        )}
        {(onAddNew || canInstallInline) && (
          <div className="border-t border-border">
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateConnection();
              }}
              disabled={isInstalling}
              variant="ghost"
              className="w-full justify-start gap-2 px-2 py-2 h-auto hover:bg-muted rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isInstalling ? (
                <>
                  <Loading01 size={16} className="animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>
                    {canInstallInline
                      ? "Custom Connection"
                      : "Custom Connection"}
                  </span>
                </>
              )}
            </Button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

function CustomObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { schema, formData, title, description, registry } = props;
  const formContext = registry.formContext as FormContext | undefined;

  const firstChildKey = props.properties[0]?.content?.key as string | undefined;

  const fieldPath =
    title || (firstChildKey ? extractFieldName(firstChildKey) : "");

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

  return (
    <div className="flex flex-col gap-4">
      {props.properties.map((element) => element.content)}
    </div>
  );
}

function CustomFieldTemplate(props: FieldTemplateProps) {
  const { label, children, description, id, schema } = props;

  if (id.includes("__type") || id.includes("__binding")) {
    return null;
  }

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

const TEMPLATES = {
  ObjectFieldTemplate: CustomObjectFieldTemplate,
  FieldTemplate: CustomFieldTemplate,
};

export function McpConfigurationForm({
  formState,
  onFormStateChange,
  stateSchema,
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

  return (
    <div className="flex flex-col h-full overflow-auto p-5">
      <RjsfForm
        schema={stateSchema}
        validator={validator}
        formData={formState}
        onChange={handleChange}
        formContext={formContext}
        liveValidate={false}
        showErrorList={false}
        templates={TEMPLATES}
      >
        {/* Hide default submit button */}
        <></>
      </RjsfForm>
    </div>
  );
}
