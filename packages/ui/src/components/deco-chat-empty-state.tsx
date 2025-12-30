import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";

interface DecoChatEmptyStateProps {
  title?: string;
  description?: ReactNode;
  avatar?: string;
  avatarNode?: ReactNode;
  className?: string;
}

export function DecoChatEmptyState({
  title = "Start a conversation",
  description,
  avatar,
  avatarNode,
  className,
}: DecoChatEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-0 text-center",
        className,
      )}
    >
      {avatarNode
        ? avatarNode
        : avatar && (
            <img
              src={avatar}
              alt="Chat avatar"
              className="size-[60px] rounded-[18px] border-[1.875px] border-border/10"
            />
          )}
      {title && (
        <h3 className="text-xl font-medium text-foreground">{title}</h3>
      )}
      {description && (
        <div className="text-muted-foreground text-center text-sm max-w-md">
          {description}
        </div>
      )}
    </div>
  );
}
