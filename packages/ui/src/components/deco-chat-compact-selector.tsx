import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";

export interface CompactSelectorOption {
  id: string;
  label: string;
  icon?: string | null;
  description?: string | null;
}

interface DecoChatCompactSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: CompactSelectorOption[];
  placeholder?: string;
  variant?: "bordered" | "borderless";
  disabled?: boolean;
  className?: string;
  /** Show the label of the placeholder when no value is selected */
  showPlaceholderLabel?: boolean;
}

/**
 * A compact inline selector matching the Figma chat input design.
 * - "bordered" variant: pill shape with border (for agent selector)
 * - "borderless" variant: transparent background (for model selector)
 */
export function DecoChatCompactSelector({
  value,
  onValueChange,
  options,
  placeholder = "Select",
  variant = "bordered",
  disabled = false,
  className,
  showPlaceholderLabel = true,
}: DecoChatCompactSelectorProps) {
  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "flex items-center gap-1 h-6 text-xs cursor-pointer outline-none transition-colors",
          "text-foreground hover:text-foreground/80",
          variant === "bordered" &&
            "border border-border rounded-xl pl-1.5 pr-1 py-1",
          variant === "borderless" && "pl-1 pr-1 py-1 rounded-xl",
          disabled && "opacity-50 cursor-not-allowed",
          className,
        )}
      >
        {/* Icon */}
        {selectedOption?.icon ? (
          <img
            src={selectedOption.icon}
            alt=""
            className="size-4 rounded shrink-0"
          />
        ) : (
          showPlaceholderLabel && (
            <div className="size-4 rounded bg-muted shrink-0" />
          )
        )}

        {/* Label */}
        <SelectPrimitive.Value asChild>
          <span className="truncate leading-none">
            {selectedOption?.label ||
              (showPlaceholderLabel ? placeholder : null)}
          </span>
        </SelectPrimitive.Value>

        {/* Chevron */}
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            "bg-popover text-popover-foreground z-50 min-w-[180px] overflow-hidden rounded-xl border shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          )}
          position="popper"
          sideOffset={4}
          align="start"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.id}
                value={option.id}
                className={cn(
                  "relative flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 px-2 text-sm outline-none",
                  "focus:bg-accent focus:text-accent-foreground",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                )}
              >
                {option.icon && (
                  <img
                    src={option.icon}
                    alt=""
                    className="size-5 rounded shrink-0"
                  />
                )}
                <div className="flex flex-col flex-1 min-w-0">
                  <SelectPrimitive.ItemText>
                    <span className="text-sm">{option.label}</span>
                  </SelectPrimitive.ItemText>
                  {option.description && (
                    <span className="text-xs text-muted-foreground truncate">
                      {option.description}
                    </span>
                  )}
                </div>
                <span className="absolute right-2 flex size-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
