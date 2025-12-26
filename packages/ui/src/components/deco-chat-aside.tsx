import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";

interface DecoChatAsideProps {
  children: ReactNode;
  className?: string;
}

interface DecoChatAsideHeaderProps {
  children: ReactNode;
  className?: string;
}

interface DecoChatAsideContentProps {
  children: ReactNode;
  className?: string;
}

interface DecoChatAsideFooterProps {
  children: ReactNode;
  className?: string;
}

function DecoChatAsideRoot({ children, className }: DecoChatAsideProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-sidebar transform-[translateZ(0)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DecoChatAsideHeader({
  children,
  className,
}: DecoChatAsideHeaderProps) {
  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between border-b border-border px-4 flex-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DecoChatAsideContent({
  children,
  className,
}: DecoChatAsideContentProps) {
  return (
    <div className={cn("flex-1 min-h-0 overflow-y-auto", className)}>
      {children}
    </div>
  );
}

function DecoChatAsideFooter({
  children,
  className,
}: DecoChatAsideFooterProps) {
  return (
    <div className={cn("flex-none w-full mx-auto p-2", className)}>
      {children}
    </div>
  );
}

export const DecoChatAside = Object.assign(DecoChatAsideRoot, {
  Header: DecoChatAsideHeader,
  Content: DecoChatAsideContent,
  Footer: DecoChatAsideFooter,
});
