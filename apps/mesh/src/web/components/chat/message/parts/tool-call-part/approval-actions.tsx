"use client";

import { Check, X } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { useChat } from "../../../context.tsx";

interface ApprovalActionsProps {
  approvalId: string;
}

const DEFAULT_DENY_REASON =
  "User denied this tool call, give other alternatives.";

export function ApprovalActions({ approvalId }: ApprovalActionsProps) {
  const { addToolApprovalResponse } = useChat();

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          addToolApprovalResponse({
            id: approvalId,
            approved: false,
            reason: DEFAULT_DENY_REASON,
          });
        }}
      >
        <X className="size-4" />
        Deny
      </Button>
      <Button
        type="button"
        variant="default"
        className="text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          addToolApprovalResponse({ id: approvalId, approved: true });
        }}
      >
        <Check className="size-4" />
        Approve
      </Button>
    </div>
  );
}
