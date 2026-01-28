"use client";

import type * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "@untitledui/icons";

import { cn } from "@deco/ui/lib/utils.ts";

type CheckboxVariant = "default" | "exclude";

interface CheckboxProps
  extends React.ComponentProps<typeof CheckboxPrimitive.Root> {
  variant?: CheckboxVariant;
}

function Checkbox({ className, variant = "default", ...props }: CheckboxProps) {
  const isExclude = variant === "exclude";

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-variant={variant}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        isExclude
          ? "border-muted-foreground/40 dark:bg-input/30 data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground dark:data-[state=checked]:bg-destructive data-[state=checked]:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50"
          : "border-muted-foreground/40 dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn(
          "flex items-center justify-center transition-none",
          isExclude ? "text-destructive-foreground" : "text-primary-foreground",
        )}
      >
        {isExclude ? (
          <Minus className="size-3.5" />
        ) : (
          <Check className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
export type { CheckboxVariant };
