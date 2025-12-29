/**
 * DynamicOptions - Widget that fetches options from a loader/API at runtime
 * Simplified version ported from admin-cx
 */
import { useState, useEffect, useCallback } from "react";
import type { WidgetProps, RJSFSchema, StrictRJSFSchema } from "@rjsf/utils";
import { SelectWidget } from "./select-widget";
import { TextWidget } from "./text-widget";
import { Input } from "../ui/input";
import { Loader2 } from "lucide-react";
import { idToObjectPath, get } from "../../lib/schema-utils";

interface OptionItem {
  value: string;
  label: string;
  image?: string;
}

interface DynamicOptionsProps<T = any, S extends StrictRJSFSchema = RJSFSchema>
  extends WidgetProps<T, S> {
  formContext?: {
    formData?: any;
    loaderEndpoint?: string; // Base URL for loader API calls
  };
}

/**
 * Render Mustache-like templates: {{{fieldName}}}
 */
function renderMustache(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => {
    return String(data[key] ?? "");
  });
}

export function DynamicOptions<T = any, S extends StrictRJSFSchema = RJSFSchema>(
  props: DynamicOptionsProps<T, S>
) {
  const { id, value, schema, onChange, formContext } = props;
  const [options, setOptions] = useState<OptionItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the options URL from schema
  const optionsUrl = (schema as any).options as string | undefined;
  const isMustache = optionsUrl?.includes("{{{");
  const isLoader = optionsUrl?.includes("loaders/") || optionsUrl?.startsWith("http");

  // Get parent data for Mustache rendering
  const parentPath = idToObjectPath(id).slice(0, -1);
  const parentData = formContext?.formData
    ? get(formContext.formData, parentPath)
    : {};

  const fetchOptions = useCallback(
    async (term?: string) => {
      if (!optionsUrl) return;

      // If it's just Mustache without a loader, render directly
      if (isMustache && !isLoader) {
        const rendered = renderMustache(optionsUrl, parentData);
        const opts = rendered.split(",").filter(Boolean);
        setOptions(opts.map((o) => ({ value: o, label: o })));
        return;
      }

      // Fetch from loader
      setIsLoading(true);
      setError(null);

      try {
        const url = new URL(
          isMustache ? renderMustache(optionsUrl, parentData) : optionsUrl,
          formContext?.loaderEndpoint || window.location.origin
        );

        if (term) {
          url.searchParams.set("term", term);
        }

        const response = await fetch(url.href);

        if (!response.ok) {
          throw new Error(`Failed to fetch options: ${response.status}`);
        }

        const result = await response.json();

        // Handle different response formats
        if (Array.isArray(result)) {
          setOptions(
            result.map((item) => {
              if (typeof item === "string") {
                return { value: item, label: item };
              }
              return {
                value: item.value ?? item.id ?? String(item),
                label: item.label ?? item.name ?? item.title ?? String(item),
                image: item.image ?? item.imageUrl,
              };
            })
          );
        } else {
          setError("Invalid response format");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [optionsUrl, parentData, formContext?.loaderEndpoint, isMustache, isLoader]
  );

  // Fetch on mount and when dependencies change
  useEffect(() => {
    if (isLoader || (isMustache && !isLoader)) {
      fetchOptions(value as string | undefined);
    }
  }, [optionsUrl, JSON.stringify(parentData)]);

  // Handle autocomplete search
  const handleSearch = useCallback(
    (term: string) => {
      fetchOptions(term);
    },
    [fetchOptions]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-transparent text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading options...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-destructive bg-destructive/10 text-sm text-destructive">
        Error: {error}
      </div>
    );
  }

  // If we have options, show select widget
  if (options && options.length > 0) {
    return (
      <SelectWidget
        {...props}
        options={{
          ...props.options,
          enumOptions: options.map((opt) => ({
            value: opt.value,
            label: opt.label,
          })),
        }}
      />
    );
  }

  // Fallback to text input
  return <TextWidget {...props} />;
}

export default DynamicOptions;

