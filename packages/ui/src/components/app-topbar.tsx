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
        "sticky top-0 z-20 bg-background flex items-center w-full h-12 border-b border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function AppTopbarSidebar({ children, className }: AppTopbarSlotProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-2.5 h-full border-r border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function AppTopbarLeft({ children, className }: AppTopbarSlotProps) {
  return (
    <div className={cn("flex items-center gap-2 px-2 h-full", className)}>
      {children}
    </div>
  );
}

function AppTopbarCenter({ children, className }: AppTopbarSlotProps) {
  return (
    <div
      className={cn("flex items-center gap-2 px-2 h-full flex-1", className)}
    >
      {children}
    </div>
  );
}

function AppTopbarRight({ children, className }: AppTopbarSlotProps) {
  return (
    <div
      className={cn("flex items-center gap-2 px-2 h-full ml-auto", className)}
    >
      {children}
    </div>
  );
}

function AppTopbarSkeleton() {
  return (
    <div className="sticky top-0 z-20 bg-background flex items-center w-full h-12 border-b border-border">
      <div className="flex items-center justify-center px-2 h-full border-r border-border">
        <div className="w-8 h-8 bg-muted rounded-md animate-pulse" />
      </div>
      <div className="flex items-center gap-2 px-2 h-full">
        <div className="w-32 h-6 bg-muted rounded-md animate-pulse" />
      </div>
      <div className="flex items-center gap-2 px-2 h-full ml-auto">
        <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
      </div>
    </div>
  );
}

export const AppTopbar = Object.assign(AppTopbarRoot, {
  Sidebar: AppTopbarSidebar,
  Left: AppTopbarLeft,
  Center: AppTopbarCenter,
  Right: AppTopbarRight,
  Skeleton: AppTopbarSkeleton,
});
