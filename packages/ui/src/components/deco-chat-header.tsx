import type { ReactNode } from "react";
import { Button } from "./button.tsx";
import { cn } from "../lib/utils.ts";
import { X } from "@untitledui/icons";

interface DecoChatHeaderProps {
  avatar?: string;
  name: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function DecoChatHeader({
  avatar,
  name,
  subtitle,
  actions,
  onClose,
  className,
}: DecoChatHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 w-full",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {avatar && (
          <img
            src={avatar}
            alt={name}
            className="size-5 rounded flex-shrink-0"
          />
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{name}</span>
          {subtitle && (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {actions}
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-6 rounded-full"
            title="Close chat"
          >
            <X size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
