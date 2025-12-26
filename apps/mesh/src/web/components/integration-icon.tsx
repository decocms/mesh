import { cn } from "@deco/ui/lib/utils.ts";
import { useState, type ReactNode } from "react";
import { PuzzlePiece01 } from "@untitledui/icons";

interface IntegrationIconProps {
  icon: string | null | undefined;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  fallbackIcon?: ReactNode;
}

export function IntegrationIcon({
  icon,
  name,
  size = "md",
  className,
  fallbackIcon,
}: IntegrationIconProps) {
  const [imageError, setImageError] = useState(icon ? false : true);

  const sizeClasses = {
    xs: "h-6 w-6",
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
  };

  const minWidthClasses = {
    xs: "min-w-6",
    sm: "min-w-8",
    md: "min-w-12",
    lg: "min-w-16",
  };

  const iconSizes = {
    xs: 12,
    sm: 16,
    md: 24,
    lg: 32,
  };

  const defaultFallback = (
    <PuzzlePiece01 size={iconSizes[size]} className="text-muted-foreground" />
  );

  const fallbackIconElement = (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center bg-muted border border-border shrink-0",
        sizeClasses[size],
        minWidthClasses[size],
        className,
      )}
    >
      {fallbackIcon ?? defaultFallback}
    </div>
  );

  if (icon && !imageError) {
    return (
      <img
        src={icon}
        alt={name}
        onError={() => setImageError(true)}
        className={cn(
          "rounded-lg object-cover border border-border shrink-0",
          sizeClasses[size],
          minWidthClasses[size],
          className,
        )}
      />
    );
  }

  // Fallback: muted icon with connection symbol
  return fallbackIconElement;
}
