import {
  Children,
  isValidElement,
  type ReactNode,
  PropsWithChildren,
} from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { MessageAssistant } from "./message-assistant.tsx";
import { MessageUser } from "./message-user.tsx";

export function MessageFooter({ children }: PropsWithChildren) {
  return <>{children}</>;
}

interface MessageListProps {
  children: ReactNode;
  className?: string;
  minHeightOffset?: number;
}

export function MessageList({
  children,
  className,
  minHeightOffset,
}: MessageListProps) {
  const [maybeFooter, maybeAssistant, maybeUser, ...rest] =
    Children.toArray(children).toReversed();

  const footer =
    isValidElement(maybeFooter) && maybeFooter.type === MessageFooter
      ? maybeFooter
      : null;

  const assistant =
    isValidElement(maybeAssistant) && maybeAssistant.type === MessageAssistant
      ? maybeAssistant
      : null;

  const user =
    isValidElement(maybeUser) && maybeUser.type === MessageUser
      ? maybeUser
      : null;

  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden",
        className,
      )}
    >
      <div className="flex flex-col min-w-0 max-w-2xl mx-auto w-full py-4">
        {rest.length > 0 && (
          <div className="flex flex-col">{rest.toReversed()}</div>
        )}

        {assistant && user ? (
          <div
            className="flex flex-col"
            style={
              minHeightOffset
                ? { minHeight: `calc(100vh - ${minHeightOffset}px)` }
                : undefined
            }
          >
            {user}
            {assistant}
          </div>
        ) : (
          <div className="flex flex-col">
            {user}
            {assistant}
          </div>
        )}

        {footer}
      </div>
    </div>
  );
}
