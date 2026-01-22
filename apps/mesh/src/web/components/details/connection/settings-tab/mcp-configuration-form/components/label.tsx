/**
 * Label Component
 *
 * Reusable label with title, description, and optional badge.
 * Based on admin-panel-cx Label component.
 */

import { cn } from "@deco/ui/lib/utils.ts";

interface LabelProps {
  title?: string;
  description?: React.ReactNode; // Can be string or component
  htmlFor?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "default" | "heading";
}

export function Label({
  title,
  description,
  htmlFor,
  required = false,
  readOnly = false,
  disabled = false,
  className,
  variant = "default",
}: LabelProps) {
  const isInteractive = !readOnly && !disabled;

  // Don't render if no title
  if (!title || title === "__resolveType") {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {/* Title row with optional badge - only show optional for non-required fields */}
      <div className="flex flex-row flex-nowrap items-center gap-1.5">
        <label
          htmlFor={htmlFor}
          className={cn(
            "text-sm",
            variant === "heading" ? "font-semibold" : "font-medium",
            isInteractive ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {title}
        </label>
        {required === false && (
          <span className="text-xs text-muted-foreground">(optional)</span>
        )}
      </div>

      {/* Description - use div because RJSF may pass component with div inside */}
      {description && (
        <div
          id={htmlFor ? `${htmlFor}-helper` : undefined}
          className="text-xs text-muted-foreground"
        >
          {description}
        </div>
      )}
    </div>
  );
}

export default Label;

