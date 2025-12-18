import { cn } from "@deco/ui/lib/utils.ts";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useState } from "react";

interface IntegrationIconProps {
  icon: string | null | undefined;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function IntegrationIcon({
  icon,
  name,
  size = "md",
  className,
}: IntegrationIconProps) {
  const [imageError, setImageError] = useState(icon ? false : true);

  const sizeClasses = {
    xs: "h-6 w-6",
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
  };

  const iconSizes = {
    xs: 12,
    sm: 16,
    md: 24,
    lg: 32,
  };

  const fallbackIcon = (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center bg-muted border border-border",
        sizeClasses[size],
        className,
      )}
    >
      <Icon
        name="cable"
        size={iconSizes[size]}
        className="text-muted-foreground"
      />
    </div>
  );

  if (icon && !imageError) {
    return (
      <img
        src={icon}
        alt={name}
        onError={() => setImageError(true)}
        className={cn(
          "rounded-lg object-cover border border-border",
          sizeClasses[size],
          className,
        )}
      />
    );
  }

  // Fallback: muted icon with connection symbol
  return fallbackIcon;
}
