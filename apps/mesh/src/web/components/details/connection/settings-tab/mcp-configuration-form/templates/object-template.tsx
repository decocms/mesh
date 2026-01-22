/**
 * Object Field Template
 *
 * Handles rendering of object fields including:
 * - Binding fields (special selectors)
 * - Nested objects (collapsible sections with chevron)
 * - Root objects (flat rendering)
 *
 * Based on admin-panel-cx ObjectFieldTemplate.
 */

import type { ObjectFieldTemplateProps } from "@rjsf/utils";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { ChevronRight } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  isBindingField,
  getBindingInfo,
  extractFieldName,
  formatTitle,
  isNestedObjectSchema,
  type FormContext,
} from "../utils";
import { BindingFieldRenderer } from "./binding-field-renderer";

export function CustomObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { schema, formData, title, description, registry, properties } = props;
  const formContext = registry.formContext as FormContext | undefined;
  const [isOpen, setIsOpen] = useState(true);

  const firstChildKey = properties[0]?.content?.key as string | undefined;
  const fieldPath =
    (typeof title === "string" ? title : undefined) ||
    (firstChildKey ? extractFieldName(firstChildKey) : "");

  // Convert title to string (it can be a ReactElement in some cases)
  const titleStr = typeof title === "string" ? title : undefined;
  const descriptionStr =
    typeof description === "string" ? description : undefined;

  // Handle binding fields with special selectors
  if (isBindingField(schema as Record<string, unknown>)) {
    const { bindingType, bindingSchema } = getBindingInfo(
      schema as Record<string, unknown>,
    );
    const currentValue = (formData?.value as string) || "";

    return (
      <BindingFieldRenderer
        bindingType={bindingType}
        bindingSchema={bindingSchema}
        currentValue={currentValue}
        formData={formData}
        fieldPath={fieldPath}
        title={titleStr}
        description={descriptionStr}
        formContext={formContext}
      />
    );
  }

  // Handle nested objects with collapsible sections
  if (isNestedObjectSchema(schema as Record<string, unknown>, titleStr)) {
    const displayTitle = formatTitle(titleStr || fieldPath);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <CollapsibleTrigger className="flex flex-col items-start gap-0.5 w-full py-2 hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors">
          <div className="flex items-center gap-2 w-full">
            <ChevronRight
              size={16}
              className={cn(
                "text-muted-foreground transition-transform duration-200 shrink-0",
                isOpen && "rotate-90",
              )}
            />
            <span className="font-semibold text-sm">{displayTitle}</span>
          </div>
          {descriptionStr && (
            <p className="text-xs text-muted-foreground pl-6">
              {descriptionStr}
            </p>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-5 border-l-2 border-border/40 ml-2 mt-2 space-y-4 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          {properties.map((element) => (
            <div key={element.name}>{element.content}</div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Default: render children flat (root object or simple objects)
  return (
    <div className="flex flex-col gap-4">
      {properties.map((element) => (
        <div key={element.name}>{element.content}</div>
      ))}
    </div>
  );
}
