/**
 * Readonly String Widget
 *
 * Renders readonly string fields with a disabled input and copy button.
 */

import { Input } from "@deco/ui/components/input.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Copy01, Check } from "@untitledui/icons";
import type { WidgetProps } from "@rjsf/utils";
import { useState } from "react";
import { toast } from "sonner";

export function ReadonlyStringWidget({ value, schema }: WidgetProps) {
  const [copied, setCopied] = useState(false);

  const displayValue =
    (value as string) ?? (schema.default as string | undefined) ?? "";

  const handleCopy = async () => {
    if (!displayValue) return;

    try {
      await navigator.clipboard.writeText(displayValue);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={displayValue}
        disabled
        className="flex-1 bg-muted/50 text-muted-foreground"
        readOnly
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        className="shrink-0"
        type="button"
        disabled={!displayValue}
      >
        {copied ? (
          <Check size={16} className="text-green-500" />
        ) : (
          <Copy01 size={16} />
        )}
      </Button>
    </div>
  );
}

