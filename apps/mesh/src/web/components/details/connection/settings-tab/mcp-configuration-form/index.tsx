/**
 * MCP Configuration Form
 *
 * Form component for configuring MCP connections using RJSF.
 * Uses modular widgets and templates for extensibility.
 */

import { useProjectContext } from "@/web/providers/project-context-provider";
import RjsfForm from "@rjsf/shadcn";
import validator from "@rjsf/validator-ajv8";
import { useNavigate } from "@tanstack/react-router";
import { customWidgets } from "./widgets";
import { customTemplates } from "./templates";
import type { FormContext } from "./utils";

interface McpConfigurationFormProps {
  formState: Record<string, unknown>;
  onFormStateChange: (state: Record<string, unknown>) => void;
  stateSchema: Record<string, unknown>;
}

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
        widgets={customWidgets}
        templates={customTemplates}
      >
        {/* Hide default submit button */}
        <></>
      </RjsfForm>
    </div>
  );
}

