/**
 * Base Input Template
 *
 * Standard input widget with controlled value.
 * Based on admin-panel-cx BaseInputTemplate.
 */

import { useCallback, useState, useRef, useEffect } from "react";
import type { WidgetProps } from "@rjsf/utils";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 300;

export function BaseInputWidget(props: WidgetProps) {
  const {
    id,
    value,
    readonly,
    disabled,
    autofocus,
    onBlur,
    onFocus,
    onChange,
    schema,
    options,
    rawErrors,
  } = props;

  // Determine input type from schema
  const inputType = (() => {
    if (schema.type === "number" || schema.type === "integer") return "number";
    if (schema.format === "email") return "email";
    if (schema.format === "uri" || schema.format === "url") return "url";
    if (schema.format === "password") return "password";
    return "text";
  })();

  const isNumberInput = inputType === "number";

  // Format value for display
  const formatValue = (val: unknown) => {
    if (isNumberInput) {
      return val || val === 0 ? String(val) : "";
    }
    return val == null ? "" : String(val);
  };

  // Local state for immediate UI updates
  const [localValue, setLocalValue] = useState(() => formatValue(value));
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when external value changes
  useEffect(() => {
    setLocalValue(formatValue(value));
  }, [value]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle change with debounce
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      
      // Update local state immediately for responsive UI
      setLocalValue(newValue);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce the actual form update
      debounceTimerRef.current = setTimeout(() => {
        if (newValue === "") {
          onChange(options.emptyValue);
        } else if (isNumberInput) {
          const numValue = parseFloat(newValue);
          onChange(Number.isNaN(numValue) ? options.emptyValue : numValue);
        } else {
          onChange(newValue);
        }
      }, DEBOUNCE_DELAY);
    },
    [onChange, options.emptyValue, isNumberInput],
  );

  // Handle blur - flush pending changes
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Flush pending changes immediately on blur
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const newValue = e.target.value;
      if (newValue === "") {
        onChange(options.emptyValue);
      } else if (isNumberInput) {
        const numValue = parseFloat(newValue);
        onChange(Number.isNaN(numValue) ? options.emptyValue : numValue);
      } else {
        onChange(newValue);
      }

      onBlur(id, e.target.value);
    },
    [id, onBlur, onChange, options.emptyValue, isNumberInput],
  );

  // Handle focus
  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onFocus(id, e.target.value);
    },
    [id, onFocus],
  );

  // Check for errors
  const hasError = rawErrors && rawErrors.length > 0;

  return (
    <Input
      id={id}
      name={id}
      type={inputType}
      value={localValue}
      readOnly={readonly}
      disabled={disabled}
      autoFocus={autofocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={options.placeholder || schema.default?.toString()}
      min={schema.minimum}
      max={schema.maximum}
      step={schema.multipleOf || (isNumberInput ? "any" : undefined)}
      className={cn(
        "w-full",
        hasError && "border-destructive focus-visible:ring-destructive",
      )}
      aria-describedby={`${id}-helper`}
    />
  );
}

// Number-specific widget
export function NumberInputWidget(props: WidgetProps) {
  return <BaseInputWidget {...props} />;
}

// Text-specific widget
export function TextInputWidget(props: WidgetProps) {
  return <BaseInputWidget {...props} />;
}
