import { AlertCircle, MessageQuestionCircle } from "@untitledui/icons";
import type { UserAskToolPart } from "../../types.ts";
import { getToolPartErrorText } from "./utils.ts";

export function UserAskQuestionPart({ part }: { part: UserAskToolPart }) {
  if (part.state === "output-available" && part.output) {
    return (
      <div className="flex flex-col gap-2 p-3 border border-dashed rounded-lg bg-accent/10 text-sm">
        <div className="flex items-center gap-2">
          <MessageQuestionCircle className="size-4 text-muted-foreground" />
          <span className="font-medium text-foreground">
            {part.input?.prompt}
          </span>
        </div>
        <div className="pl-6 text-muted-foreground">
          Response: <span className="font-medium">{part.output.response}</span>
        </div>
      </div>
    );
  }
  if (part.state === "output-error") {
    const errorText = getToolPartErrorText(part);
    return (
      <div className="flex items-center gap-2 p-3 border border-dashed rounded-lg bg-destructive/10 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>{errorText}</span>
      </div>
    );
  }
  if (part.state === "output-denied") {
    return (
      <div className="flex items-center gap-2 p-3 border border-dashed rounded-lg bg-muted/50 text-sm text-muted-foreground">
        <MessageQuestionCircle className="size-4" />
        <span>Response denied</span>
      </div>
    );
  }
  return null;
}
