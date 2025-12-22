import { cn } from "@deco/ui/lib/utils.ts";
import type { ReactNode } from "react";

type HomeGridCellProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
};

export function HomeGridCell({
  title,
  description,
  action,
  children,
  className,
  noPadding = false,
}: HomeGridCellProps) {
  return (
    <div className={cn("bg-background h-full flex flex-col", className)}>
      <header className="flex items-center justify-between gap-2 md:gap-4 p-3 md:p-5">
        <div className="min-w-0">
          {typeof title === "string" ? (
            <div className="text-sm font-medium text-foreground">{title}</div>
          ) : (
            title
          )}
          {description ? (
            <div className="text-xs text-muted-foreground mt-1">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      {noPadding ? (
        <div className="flex-1 flex flex-col overflow-auto min-h-0">
          {children}
        </div>
      ) : (
        <div className="px-3 pb-3 pt-2 md:px-5 md:pb-5 md:pt-4 flex-1 flex flex-col items-center justify-center min-h-0">
          {children}
        </div>
      )}
    </div>
  );
}
