import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { JSONSchema7 } from "../types/json-schema";
import type { RJSFSchema, UiSchema, RegistryWidgetsType, RegistryFieldsType } from "@rjsf/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { TextWidget } from "./widgets/text-widget";
import { TextareaWidget } from "./widgets/textarea-widget";
import { SelectWidget } from "./widgets/select-widget";
import { CheckboxWidget } from "./widgets/checkbox-widget";
import { ColorWidget } from "./widgets/color-widget";
import { SelectBlock } from "./widgets/select-block";
import { DynamicOptions } from "./widgets/dynamic-options";
import { SavedLoaderSelect } from "./widgets/saved-loader-select";
import { ArrayFieldTemplate } from "./templates/array-field-template";
import { FieldTemplate } from "./templates/field-template";
import { ObjectFieldTemplate } from "./templates/object-field-template";
import { BaseInputTemplate } from "./templates/base-input-template";
import { MultiSchemaField } from "./templates/multi-schema-field";

interface ContentEditorProps {
  schema: JSONSchema7;
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  /** Base URL for loader API calls (for DynamicOptions) */
  loaderEndpoint?: string;
  /** Available blocks for SelectBlock widget */
  blocks?: Array<{ id: string; name: string; schema: JSONSchema7 }>;
}

const widgets: RegistryWidgetsType = {
  TextWidget,
  TextareaWidget,
  SelectWidget,
  CheckboxWidget,
  ColorWidget,
  "color-input": ColorWidget,
  "select-block": SelectBlock,
  "dynamic-options": DynamicOptions,
  "saved-loader": SavedLoaderSelect,
};

// Custom fields for anyOf/oneOf handling
const fields: RegistryFieldsType = {
  AnyOfField: MultiSchemaField,
  OneOfField: MultiSchemaField,
};

const templates = {
  ArrayFieldTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  BaseInputTemplate,
  ButtonTemplates: {
    SubmitButton: () => null,
  },
  ErrorListTemplate: () => null,
};

export function ContentEditor({
  schema,
  formData,
  onChange,
  loaderEndpoint,
  blocks,
}: ContentEditorProps) {
  const uiSchema: UiSchema = generateUiSchema(schema);

  // Form context provides data to widgets like DynamicOptions and SelectBlock
  const formContext = {
    formData,
    loaderEndpoint,
    blocks,
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{schema.title || "Content Editor"}</span>
          {schema.description && (
            <span className="text-sm font-normal text-muted-foreground">
              {schema.description}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <Form
          schema={schema as RJSFSchema}
          uiSchema={uiSchema}
          formData={formData}
          validator={validator}
          widgets={widgets}
          fields={fields}
          templates={templates}
          formContext={formContext}
          onChange={(e) => onChange(e.formData)}
          liveValidate
          noHtml5Validate
        />
      </CardContent>
    </Card>
  );
}

function generateUiSchema(schema: JSONSchema7): UiSchema {
  const uiSchema: UiSchema = {};

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propSchema = prop as JSONSchema7 & { options?: string };

      // Hide __resolveType from the form (it's internal)
      if (key === "__resolveType") {
        uiSchema[key] = { "ui:widget": "hidden" };
        continue;
      }

      // Handle dynamic options from loaders
      if (propSchema.options) {
        uiSchema[key] = { "ui:widget": "dynamic-options" };
        continue;
      }

      // Infer widget from format or type
      if (propSchema.format === "color" || key.toLowerCase().includes("color")) {
        uiSchema[key] = { "ui:widget": "ColorWidget" };
      } else if (propSchema.format === "uri" || propSchema.format === "url") {
        uiSchema[key] = { "ui:widget": "URLWidget" };
      } else if (propSchema.format === "email") {
        uiSchema[key] = { "ui:widget": "email" };
      } else if (
        propSchema.type === "string" &&
        (propSchema.maxLength ?? 0) > 100
      ) {
        uiSchema[key] = { "ui:widget": "textarea" };
      }

      // Handle nested objects
      if (propSchema.type === "object" && propSchema.properties) {
        uiSchema[key] = generateUiSchema(propSchema);
      }

      // Handle anyOf/oneOf with block selection
      if (propSchema.anyOf || propSchema.oneOf) {
        const hasLoaderOptions = (propSchema.anyOf || propSchema.oneOf)?.some(
          (opt: any) => opt.properties?.__resolveType?.default?.includes("/loaders/")
        );
        if (hasLoaderOptions) {
          uiSchema[key] = { "ui:widget": "select-block" };
        }
      }
    }
  }

  return uiSchema;
}

