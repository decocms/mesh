/**
 * PropEditor Component
 *
 * Wraps @rjsf/core Form with custom CMS templates and widgets.
 * Renders any JSON Schema as an editable form for block prop editing.
 */

import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { customTemplates } from "./rjsf/templates";
import { customWidgets } from "./rjsf/widgets";

interface PropEditorProps {
  schema: RJSFSchema;
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  readonly?: boolean;
}

export function PropEditor({
  schema,
  formData,
  onChange,
  readonly,
}: PropEditorProps) {
  return (
    <Form
      schema={schema}
      formData={formData}
      onChange={(data) => onChange(data.formData ?? {})}
      validator={validator}
      widgets={customWidgets}
      templates={customTemplates}
      readonly={readonly}
      uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
      liveValidate={false}
      className="rjsf-form"
      omitExtraData
      liveOmit
    >
      <></>
    </Form>
  );
}
