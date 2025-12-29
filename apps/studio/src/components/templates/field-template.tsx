import type { FieldTemplateProps } from "@rjsf/utils";
import { Label } from "../ui/label";
import { cn } from "@/lib/utils";

export function FieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    label,
    required,
    rawDescription,
    children,
    errors,
    help,
    hidden,
    classNames,
  } = props;

  if (hidden) {
    return <div className="hidden">{children}</div>;
  }

  // Don't render labels for objects and arrays (they have their own)
  const isComplex =
    classNames?.includes("field-object") || classNames?.includes("field-array");

  const showLabel = label && !isComplex;

  return (
    <div className={cn("space-y-2", classNames)}>
      {showLabel && (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {rawDescription && (
            <span className="text-xs text-muted-foreground">{rawDescription}</span>
          )}
        </div>
      )}
      {children}
      {errors}
      {help}
    </div>
  );
}

