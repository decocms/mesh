import { Card } from "@deco/ui/components/card.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import type { ReactNode } from "react";

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
  const cardContent = quickstartContent ? (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      {quickstartContent}
    </div>
  ) : (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      {subValue && (
        <div className="text-xs text-muted-foreground">{subValue}</div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <Card
        className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${className || ""}`}
        onClick={onClick}
      >
        {cardContent}
      </Card>
    );
  }

  return <Card className={`p-4 ${className || ""}`}>{cardContent}</Card>;
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
    <div className="space-y-2">
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <Button
        size="sm"
        onClick={onClick}
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
