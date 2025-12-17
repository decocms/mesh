import { cn } from "@deco/ui/lib/utils.ts";
import type { ReactNode } from "react";

type BentoTileProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function BentoTile({
  title,
  description,
  action,
  children,
  className,
}: BentoTileProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-background/60 backdrop-blur-sm",
        "shadow-sm",
        className,
      )}
    >
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

      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}
