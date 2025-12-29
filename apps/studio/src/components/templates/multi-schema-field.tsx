/**
 * MultiSchemaField - Handles anyOf/oneOf/allOf schemas
 * Ported from admin-cx/components/editor/JSONSchema/widgets/MultiSchemaField.tsx
 */
import { useState, useEffect } from "react";
import type {
  FieldProps,
  RJSFSchema,
  StrictRJSFSchema,
  FormContextType,
  ErrorSchema,
} from "@rjsf/utils";
import {
  getDiscriminatorFieldFromSchema,
  getUiOptions,
  getWidget,
  ERRORS_KEY,
} from "@rjsf/utils";
import { beautifySchemaTitle, getResolveTypeFromSchema, get as getValue } from "../../lib/schema-utils";

// Utility functions to replace lodash
function omit<T extends Record<string, any>>(obj: T, keys: string[]): Partial<T> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

interface AnyOfFieldState<S extends StrictRJSFSchema = RJSFSchema> {
  selectedOption: number;
  retrievedOptions: S[];
}

export function MultiSchemaField<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FieldProps<T, S, F>) {
  const {
    formData,
    options = [],
    registry,
    schema,
    name,
    baseType,
    disabled = false,
    errorSchema = {},
    formContext,
    onBlur,
    onFocus,
    uiSchema,
    onChange,
    idSchema,
  } = props;

  const { widgets, fields, translateString, globalUiOptions, schemaUtils } = registry;
  const { SchemaField } = fields;

  // Retrieve options and resolve $refs
  const [state, setState] = useState<AnyOfFieldState<S>>(() => {
    const retrievedOptions = options.map((opt: S) =>
      schemaUtils.retrieveSchema(opt, formData)
    );
    return {
      retrievedOptions,
      selectedOption: getMatchingOption(0, formData, retrievedOptions),
    };
  });

  function getMatchingOption(
    selectedOption: number,
    formData: T | undefined,
    opts: S[]
  ): number {
    const discriminator = getDiscriminatorFieldFromSchema<S>(schema);
    return schemaUtils.getClosestMatchingOption(
      formData,
      opts,
      selectedOption,
      discriminator
    );
  }

  // Update when formData or options change
  useEffect(() => {
    const retrievedOptions = options.map((opt: S) =>
      schemaUtils.retrieveSchema(opt, formData)
    );

    const matchingOption = getMatchingOption(
      state.selectedOption,
      formData,
      retrievedOptions
    );

    if (matchingOption !== state.selectedOption || retrievedOptions !== state.retrievedOptions) {
      setState({ selectedOption: matchingOption, retrievedOptions });
    }
  }, [formData, options]);

  const onOptionChange = (optionValue?: string) => {
    const intOption = optionValue !== undefined ? parseInt(optionValue, 10) : -1;
    if (intOption === state.selectedOption) return;

    const newOption = intOption >= 0 ? state.retrievedOptions[intOption] : undefined;
    const oldOption =
      state.selectedOption >= 0 ? state.retrievedOptions[state.selectedOption] : undefined;

    let newFormData = schemaUtils.sanitizeDataForNewSchema(newOption, oldOption, formData);

    if (newFormData && newOption) {
      newFormData = schemaUtils.getDefaultFormState(
        newOption,
        newFormData,
        "excludeObjectChildren"
      ) as T;
    }

    onChange(newFormData, undefined, getFieldId());
    setState({ ...state, selectedOption: intOption });
  };

  function getFieldId() {
    return `${idSchema.$id}${schema.oneOf ? "__oneof_select" : "__anyof_select"}`;
  }

  const {
    widget = "select",
    placeholder,
    autofocus,
    autocomplete,
    title = schema.title,
    ...uiOptions
  } = getUiOptions<T, S, F>(uiSchema, globalUiOptions);

  const Widget = getWidget<T, S, F>({ type: "number" }, widget, widgets);
  const rawErrors = (errorSchema as any)?.[ERRORS_KEY] ?? [];
  const fieldErrorSchema = omit(errorSchema, [ERRORS_KEY]);
  const displayLabel = schemaUtils.getDisplayLabel(schema, uiSchema, globalUiOptions);

  const selectedOption = state.selectedOption;
  const option = selectedOption >= 0 ? state.retrievedOptions[selectedOption] || null : null;

  let optionSchema: S | undefined;
  if (option) {
    optionSchema = option.type ? option : { ...option, type: baseType } as S;
  }

  // Build enum options with labels
  const enumOptions = state.retrievedOptions.map((opt, index) => {
    // Try to get __resolveType for better labeling
    const resolveType = getResolveTypeFromSchema(opt as any);
    const label = resolveType
      ? beautifySchemaTitle(resolveType)
      : opt.title || `Option ${index + 1}`;

    return {
      label,
      schema: opt,
      value: index,
    };
  });

  return (
    <div className="flex flex-col gap-2" id="multischema-field-template">
      <div className="form-group">
        <Widget
          id={getFieldId()}
          name={`${name}${schema.oneOf ? "__oneof_select" : "__anyof_select"}`}
          schema={{ type: "number", default: 0 } as S}
          onChange={onOptionChange}
          onBlur={onBlur}
          onFocus={onFocus}
          disabled={disabled || isEmpty(enumOptions)}
          multiple={false}
          rawErrors={rawErrors}
          errorSchema={fieldErrorSchema}
          value={selectedOption >= 0 ? selectedOption : undefined}
          options={{ enumOptions, ...uiOptions }}
          registry={registry}
          formContext={formContext}
          placeholder={placeholder}
          autocomplete={autocomplete}
          autofocus={autofocus}
          label={title ?? name}
          hideLabel={!displayLabel}
        />
      </div>
      {option !== null && optionSchema && (
        <SchemaField {...props} schema={optionSchema} />
      )}
    </div>
  );
}

export default MultiSchemaField;

