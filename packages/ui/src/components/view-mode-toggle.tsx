import { Icon } from "@deco/ui/components/icon.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useEffect, useRef, useState } from "react";

export interface ViewModeOption<T extends string = string> {
  value: T;
  icon: string;
  label?: string;
}

type ViewModeSize = "sm" | "md" | "lg";

interface ViewModeToggleProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: [ViewModeOption<T>, ViewModeOption<T>];
  size?: ViewModeSize;
  fullWidth?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: {
    button: "size-7",
    icon: "size-4",
  },
  md: {
    button: "size-9",
    icon: "size-5",
  },
  lg: {
    button: "size-12",
    icon: "size-6",
  },
};

export function ViewModeToggle<T extends string = string>({
  value,
  onValueChange,
  options,
  size = "sm",
  fullWidth = false,
  className,
}: ViewModeToggleProps<T>) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const secondRef = useRef<HTMLButtonElement>(null);
  const [indicatorPosition, setIndicatorPosition] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const updateIndicator = (ref: React.RefObject<HTMLButtonElement | null>) => {
    if (!ref.current) return;
    const { offsetLeft, offsetWidth } = ref.current;
    setIndicatorPosition({
      left: offsetLeft,
      width: offsetWidth,
      opacity: 1,
    });
  };

  // Initialize indicator position based on current value
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const ref = value === options[0].value ? firstRef : secondRef;
    updateIndicator(ref);
  }, [value, options]);

  const config = sizeConfig[size];

  return (
    <div className={cn("relative flex gap-0 bg-muted rounded-lg", className)}>
      <button
        ref={firstRef}
        type="button"
        onClick={() => onValueChange(options[0].value)}
        className={cn(
          "relative z-10 flex items-center justify-center gap-2 rounded-lg transition-colors [transition-timing-function:var(--ease-out-cubic)] duration-200",
          fullWidth ? "flex-1 h-12 px-4" : config.button,
          !fullWidth && options[0].label ? "px-3" : "",
        )}
      >
        <Icon
          name={options[0].icon}
          className={cn(
            "transition-colors ease-out duration-200",
            config.icon,
            value === options[0].value
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        />
        {options[0].label && (
          <span
            className={cn(
              "text-xs transition-colors ease-out duration-200 whitespace-nowrap",
              value === options[0].value
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {options[0].label}
          </span>
        )}
      </button>
      <button
        ref={secondRef}
        type="button"
        onClick={() => onValueChange(options[1].value)}
        className={cn(
          "relative z-10 flex items-center justify-center gap-2 rounded-lg transition-colors [transition-timing-function:var(--ease-out-cubic)] duration-200",
          fullWidth ? "flex-1 h-12 px-4" : config.button,
          !fullWidth && options[1].label ? "px-3" : "",
        )}
      >
        <Icon
          name={options[1].icon}
          className={cn(
            "transition-colors ease-out duration-200",
            config.icon,
            value === options[1].value
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        />
        {options[1].label && (
          <span
            className={cn(
              "text-xs transition-colors ease-out duration-200 whitespace-nowrap",
              value === options[1].value
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {options[1].label}
          </span>
        )}
      </button>
      {/* Sliding indicator */}
      <div
        className={cn(
          "absolute z-0 bg-background rounded-lg border-shadow transition-all [transition-timing-function:var(--ease-out-cubic)] duration-200",
          fullWidth ? "h-12" : config.button,
        )}
        style={{
          left: `${indicatorPosition.left}px`,
          width: `${indicatorPosition.width}px`,
          opacity: indicatorPosition.opacity,
        }}
      />
    </div>
  );
}
