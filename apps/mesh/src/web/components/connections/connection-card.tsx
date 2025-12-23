import { Card } from "@deco/ui/components/card.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { IntegrationIcon } from "../integration-icon.tsx";

export interface ConnectionCardData {
  id?: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  status?: "active" | "inactive" | "error";
}

export interface ConnectionCardProps {
  connection: ConnectionCardData;
  onClick?: () => void;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
  fallbackIcon?: string;
}

export function ConnectionCard({
  connection,
  onClick,
  headerActions,
  footer,
  className,
  size = "md",
  fallbackIcon,
}: ConnectionCardProps) {
  const paddingClass = size === "sm" ? "p-4" : "p-6";
  const titleSizeClass = size === "sm" ? "text-sm" : "text-base";
  const descriptionSizeClass = size === "sm" ? "text-xs" : "text-sm";

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors group",
        onClick && "hover:bg-muted/50",
        className,
      )}
      onClick={onClick}
    >
      <div className={cn("flex flex-col gap-4 relative", paddingClass)}>
        {/* Header: Icon + Status Badge / Header Actions */}
        <div className="flex items-start justify-between">
          <IntegrationIcon
            icon={connection.icon}
            name={connection.title}
            size="md"
            className="shrink-0 shadow-sm"
            fallbackIcon={fallbackIcon}
          />
          {/* Header Actions container */}
          <div className="relative">
            {/* Header Actions: hidden by default, visible on hover */}
            {headerActions && (
              <div
                className={cn(
                  "transition-opacity",
                  "opacity-0 group-hover:opacity-100",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {headerActions}
              </div>
            )}
          </div>
        </div>

        {/* Title and Description */}
        <div className="flex flex-col gap-0">
          <h3
            className={cn(
              "font-medium text-foreground truncate",
              titleSizeClass,
            )}
          >
            {connection.title}
          </h3>
          <p
            className={cn(
              "text-muted-foreground line-clamp-2",
              descriptionSizeClass,
            )}
          >
            {connection.description || "No description"}
          </p>
        </div>

        {/* Footer: Custom footer */}
        {footer && <div onClick={(e) => e.stopPropagation()}>{footer}</div>}
      </div>
    </Card>
  );
}
