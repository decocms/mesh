import { Card } from "@deco/ui/components/card.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import type { ReactNode } from "react";
import { cn } from "@deco/ui/lib/utils.js";

interface MetricCardProps {
  label: string;
  value?: string;
  subValue?: string;
  quickstartContent?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function MetricCard({
  label,
  value,
  subValue,
  quickstartContent,
  onClick,
  className,
}: MetricCardProps) {
  if (quickstartContent) {
    return (
      <Card
        onClick={onClick}
        className={cn("p-4 hover:bg-accent/0", className)}
      >
        <div className="flex flex-col gap-1 justify-between flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          {quickstartContent}
        </div>
      </Card>
    );
  }

  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 transition-colors",
        onClick ? "cursor-pointer" : "hover:bg-accent/0",
        className,
      )}
    >
      <div className="flex flex-col gap-1 justify-start">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {subValue && (
          <div className="text-xs text-muted-foreground">{subValue}</div>
        )}
      </div>
    </Card>
  );
}

interface QuickstartButtonProps {
  label: string;
  description?: string;
  icon?: string;
  onClick: () => void;
  isLoading?: boolean;
}

export function QuickstartButton({
  label,
  description,
  icon,
  onClick,
  isLoading,
}: QuickstartButtonProps) {
  return (
    <div className="gap-2 flex-1 justify-between flex flex-col">
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <Button
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        disabled={isLoading}
        className="w-full"
      >
        {icon && (
          <>
            <Icon name={icon as any} size={16} />
            <span className="ml-2">{label}</span>
          </>
        )}
        {!icon && label}
      </Button>
    </div>
  );
}
