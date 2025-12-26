import type { ReactNode } from "react";
import { Button } from "./button.tsx";
import { cn } from "../lib/utils.ts";
import { MessageChatSquare } from "@untitledui/icons";

interface DecoChatToggleButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  avatar?: string | ReactNode;
}

export function DecoChatToggleButton({
  onClick,
  disabled,
  className,
  children,
  avatar,
}: DecoChatToggleButtonProps) {
  const defaultAvatar = (
    <span className="inline-flex size-5 items-center justify-center rounded-lg bg-lime-400 text-lime-950 shadow-sm">
      <MessageChatSquare size={16} />
    </span>
  );

  const avatarContent =
    typeof avatar === "string" ? (
      <img src={avatar} alt="Chat avatar" className="size-5 rounded-sm" />
    ) : (
      avatar || defaultAvatar
    );

  return (
    <Button
      size="sm"
      variant="default"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "bg-lime-200/70 text-foreground hover:bg-lime-200 focus-visible:ring-lime-400/80 gap-2 rounded-full px-3 text-xs font-medium text-balance",
        className,
      )}
    >
      {avatarContent}
      {children || "deco chat"}
    </Button>
  );
}
