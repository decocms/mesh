import type * as React from "react";
import { LinkExternal01 } from "@untitledui/icons";

import { cn } from "@deco/ui/lib/utils.ts";

interface EntityLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: React.ReactNode;
  external?: boolean;
}

export function EntityLink({
  children,
  icon,
  className,
  external,
  ...props
}: EntityLinkProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {external && <LinkExternal01 size={12} className="shrink-0 opacity-50" />}
    </a>
  );
}
