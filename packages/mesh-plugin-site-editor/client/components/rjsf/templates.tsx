import type { FieldTemplateProps, DescriptionFieldProps } from "@rjsf/utils";

export function FieldTemplate({
  id,
  label,
  required,
  children,
  errors,
}: FieldTemplateProps) {
  return (
    <div className="flex flex-col gap-1 mb-3">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      {children}
      {errors && <div className="text-xs text-destructive">{errors}</div>}
    </div>
  );
}

export function DescriptionField({ description }: DescriptionFieldProps) {
  if (!description) return null;
  return <p className="text-xs text-muted-foreground -mt-1">{description}</p>;
}

export const customTemplates = {
  FieldTemplate,
  DescriptionField,
};
