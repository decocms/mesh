import { cn } from "../lib/utils.ts";
import type { ReactNode } from "react";

interface AppTopbarProps {
  children: ReactNode;
  className?: string;
}

interface AppTopbarSlotProps {
  children: ReactNode;
  className?: string;
}

function AppTopbarRoot({ children, className }: AppTopbarProps) {
  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-20 bg-sidebar flex items-center justify-between w-full px-2 h-12 border-b border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function AppTopbarLeft({ children, className }: AppTopbarSlotProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>{children}</div>
  );
}

function AppTopbarRight({ children, className }: AppTopbarSlotProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>{children}</div>
  );
}

function AppTopbarSkeleton() {
  return (
    <div className="fixed top-0 left-0 right-0 z-20 bg-sidebar flex items-center justify-between w-full px-4 h-12 border-b border-border">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-muted rounded-md animate-pulse" />
        <div className="w-32 h-6 bg-muted rounded-md animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
      </div>
    </div>
  );
}

export const AppTopbar = Object.assign(AppTopbarRoot, {
  Left: AppTopbarLeft,
  Right: AppTopbarRight,
  Skeleton: AppTopbarSkeleton,
});
