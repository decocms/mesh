import type { ReactNode } from "react";

interface CollectionHeaderProps {
  title: string;
  ctaButton?: ReactNode;
}

/**
 * Simple header for collection pages.
 */
export function CollectionHeader({ title, ctaButton }: CollectionHeaderProps) {
  return (
    <div className="shrink-0 w-full border-b border-border h-12">
      <div className="flex items-center justify-between gap-3 h-12 px-4">
        <h1 className="text-sm font-medium text-foreground">{title}</h1>
        <div className="flex items-center gap-2">{ctaButton}</div>
      </div>
    </div>
  );
}
