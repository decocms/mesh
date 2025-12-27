import { cn } from "@deco/ui/lib/utils.ts";
import type { ReactNode } from "react";

interface ListRowProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

function ListRowRoot({ children, selected, onClick, className }: ListRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-150 w-full",
        "hover:bg-muted/50",
        selected &&
          "bg-primary/10 hover:bg-primary/20 border-l-2 border-l-primary",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface ListRowIconProps {
  children: ReactNode;
  className?: string;
}

function ListRowIcon({ children, className }: ListRowIconProps) {
  return <div className={cn("shrink-0", className)}>{children}</div>;
}

interface ListRowContentProps {
  children: ReactNode;
  className?: string;
}

function ListRowContent({ children, className }: ListRowContentProps) {
  return <div className={cn("flex-1 min-w-0", className)}>{children}</div>;
}

interface ListRowTrailingProps {
  children: ReactNode;
  className?: string;
}

function ListRowTrailing({ children, className }: ListRowTrailingProps) {
  return <div className={cn("shrink-0", className)}>{children}</div>;
}

interface ListRowTitleProps {
  children: ReactNode;
  className?: string;
}

function ListRowTitle({ children, className }: ListRowTitleProps) {
  return (
    <span
      className={cn("text-sm font-medium text-foreground truncate", className)}
    >
      {children}
    </span>
  );
}

interface ListRowSubtitleProps {
  children: ReactNode;
  className?: string;
}

function ListRowSubtitle({ children, className }: ListRowSubtitleProps) {
  return (
    <span className={cn("text-xs text-muted-foreground truncate", className)}>
      {children}
    </span>
  );
}

export const ListRow = Object.assign(ListRowRoot, {
  Icon: ListRowIcon,
  Content: ListRowContent,
  Trailing: ListRowTrailing,
  Title: ListRowTitle,
  Subtitle: ListRowSubtitle,
});
