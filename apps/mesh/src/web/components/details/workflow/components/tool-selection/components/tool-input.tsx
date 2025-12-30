import { useRef } from "react";
import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import type { JsonSchema } from "@/web/utils/constants";
import type { MentionItem } from "@/web/components/tiptap-mentions-input";
import { MentionsContext } from "../rjsf/rjsf-context";
import { customWidgets } from "../rjsf/rjsf-widgets";
import { customTemplates } from "../rjsf/rjsf-templates";
import { ReadonlyToolInput } from "./readonly-tool-input";

export function ToolInput({
  inputSchema,
  inputParams,
  setInputParams,
  handleInputChange,
  mentions,
  readOnly,
}: {
  inputSchema: JsonSchema;
  inputParams?: Record<string, unknown>;
  setInputParams?: (params: Record<string, unknown>) => void;
  handleInputChange?: (key: string, value: unknown) => void;
  mentions?: MentionItem[];
  readOnly?: boolean | undefined;
}) {
  const mentionItems = mentions ?? [];

  if (!inputSchema) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No arguments defined in schema.
      </div>
    );
  }

  // If readonly, use the clean readonly view
  if (readOnly) {
    return (
      <ReadonlyToolInput
        inputSchema={inputSchema}
        inputParams={inputParams}
        mentions={mentionItems}
      />
    );
  }

  // Convert JsonSchema to RJSFSchema
  const rjsfSchema: RJSFSchema = inputSchema as RJSFSchema;

  // Track previous formData to detect changes
  const prevFormDataRef = useRef<Record<string, unknown>>(inputParams ?? {});

  const handleChange = (data: { formData?: Record<string, unknown> }) => {
    const formData = data.formData ?? {};
    const prevFormData = prevFormDataRef.current;
    setInputParams?.(formData);

    // Call handleInputChange for each changed key
    if (handleInputChange) {
      for (const [key, value] of Object.entries(formData)) {
        // Only call if the value actually changed
        if (prevFormData[key] !== value) {
          handleInputChange(key, value);
        }
      }
      // Also check for keys that were removed
      for (const key of Object.keys(prevFormData)) {
        if (!(key in formData)) {
          handleInputChange(key, undefined);
        }
      }
    }

    // Update the ref for the next change
    prevFormDataRef.current = formData;
  };

  return (
    <MentionsContext.Provider value={mentionItems}>
      <Form
        schema={rjsfSchema}
        formData={inputParams}
        onChange={handleChange}
        validator={validator}
        widgets={customWidgets}
        templates={customTemplates}
        readonly={readOnly}
        uiSchema={{
          "ui:submitButtonOptions": { norender: true },
        }}
        liveValidate={false}
        className="rjsf-form"
        omitExtraData
        liveOmit
      >
        {/* Empty children to hide submit button */}
        <></>
      </Form>
    </MentionsContext.Provider>
  );
}
