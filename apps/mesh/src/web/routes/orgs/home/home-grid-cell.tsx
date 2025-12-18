import { cn } from "@deco/ui/lib/utils.ts";
import type { ReactNode } from "react";

type HomeGridCellProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function HomeGridCell({
  title,
  description,
  action,
  children,
  className,
}: HomeGridCellProps) {
  return (
    <div className={cn("bg-background h-full flex flex-col", className)}>
      <header className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{title}</div>
          {description ? (
            <div className="text-xs text-muted-foreground mt-1">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      <div className="px-5 pb-5 pt-4 flex-1 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
