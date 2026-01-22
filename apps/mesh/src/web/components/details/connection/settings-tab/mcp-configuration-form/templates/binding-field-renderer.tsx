/**
 * Binding Field Renderer
 *
 * Renders binding fields with appropriate selectors based on binding type.
 */

import { useState } from "react";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useBindingSchemaFromRegistry } from "@/web/hooks/use-binding-schema-from-registry";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { Loading01, Plus } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { toast } from "sonner";
import { VirtualMCPSelector } from "@/web/components/chat/select-virtual-mcp";
import {
  ModelChangePayload,
  ModelSelector,
  SelectedModelState,
} from "@/web/components/chat";
import { formatTitle, isDynamicBindingSchema, type FormContext } from "../utils";

interface BindingFieldRendererProps {
  bindingType?: string;
  bindingSchema?: unknown;
  currentValue: string;
  formData: Record<string, unknown>;
  fieldPath: string;
  title?: string;
  description?: string;
  formContext?: FormContext;
}

export function BindingFieldRenderer({
  bindingType,
  bindingSchema,
  currentValue,
  formData,
  fieldPath,
  title,
  description,
  formContext,
}: BindingFieldRendererProps) {
  const displayTitle = title ? formatTitle(title) : formatTitle(fieldPath);

  const handleBindingChange = (newValue: string) => {
    const newFieldData = {
      ...formData,
      value: newValue,
      ...(bindingType && { __type: bindingType }),
    };
    formContext?.onFieldChange(fieldPath, newFieldData);
  };

  const handleModelChange = (model: ModelChangePayload) => {
    formContext?.onFieldChange(fieldPath, {
      __type: bindingType,
      value: {
        id: model.id,
        connectionId: model.connectionId,
      },
    });
  };

  // Agent selector
  if (bindingType === "@deco/agent") {
    return (
      <FieldWrapper title={displayTitle} description={description}>
        <VirtualMCPSelector
          selectedVirtualMcpId={currentValue || undefined}
          onVirtualMcpChange={handleBindingChange}
          variant="bordered"
          placeholder="Select Agent"
            className="w-full"
        />
      </FieldWrapper>
    );
  }

  // Language model selector
  if (bindingType === "@deco/language-model") {
    return (
      <FieldWrapper title={displayTitle} description={description}>
        <ModelSelector
          selectedModel={
            currentValue as unknown as SelectedModelState | undefined
          }
          onModelChange={handleModelChange}
          variant="bordered"
          placeholder="Select Language Model"
            className="w-full"
        />
      </FieldWrapper>
    );
  }

  // Generic binding selector
  return (
    <FieldWrapper title={displayTitle} description={description}>
      <BindingFieldWithDynamicSchema
        bindingSchema={bindingSchema}
        bindingType={bindingType}
        currentValue={currentValue}
        onValueChange={handleBindingChange}
        placeholder={`Select ${displayTitle.toLowerCase()}...`}
        onAddNew={() => formContext?.onAddNew()}
            className="w-full"
      />
    </FieldWrapper>
  );
}

// Field wrapper for consistent layout - vertical stack
function FieldWrapper({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{title}</label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="max-w-md">{children}</div>
    </div>
  );
}

// Dynamic binding schema resolution
interface BindingFieldWithDynamicSchemaProps {
  bindingSchema: unknown;
  bindingType?: string;
  currentValue: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  onAddNew: () => void;
  className?: string;
}

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

// Binding selector dropdown
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
      <SelectTrigger size="sm" className={cn("w-[200px]", className)}>
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
                  <span>Custom Connection</span>
                </>
              )}
            </Button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

