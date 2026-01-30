import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/web/lib/auth-client";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Check, XClose, Mail01 } from "@untitledui/icons";
import { toast } from "sonner";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Invitation } from "../../types";

interface InvitationItemProps {
  invitation: Invitation;
  onStatusChange: (id: string, newStatus: string) => void;
}

export function InvitationItem({
  invitation,
  onStatusChange,
}: InvitationItemProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const navigate = useNavigate();

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId: invitation.id,
      });

      if (result.error) {
        toast.error(result.error.message);
        setIsAccepting(false);
      } else {
        onStatusChange(invitation.id, "accepted");

        const setActiveResult = await authClient.organization.setActive({
          organizationId: invitation.organizationId,
        });

        if (setActiveResult?.data?.slug) {
          toast.success("Invitation accepted!");
          navigate({ to: "/$org", params: { org: setActiveResult.data.slug } });
        } else {
          toast.success("Invitation accepted! Redirecting...");
          navigate({ to: "/" });
        }
      }
    } catch {
      toast.error("Failed to accept invitation");
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      const result = await authClient.organization.rejectInvitation({
        invitationId: invitation.id,
      });

      if (result.error) {
        toast.error(result.error.message);
        setIsRejecting(false);
      } else {
        toast.success("Invitation rejected");
        onStatusChange(invitation.id, "rejected");
        setIsRejecting(false);
      }
    } catch {
      toast.error("Failed to reject invitation");
      setIsRejecting(false);
    }
  };

  const orgName = invitation.organizationName || invitation.organizationId;
  const isPending = invitation.status === "pending";
  const isAccepted = invitation.status === "accepted";
  const isRejected = invitation.status === "rejected";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 h-12 border-b border-border/50 last:border-b-0",
        !isPending && "opacity-50",
      )}
    >
      <div className="shrink-0 size-5 flex items-center justify-center">
        <Mail01 size={16} className="text-muted-foreground" />
      </div>
      <p className="flex-1 text-sm text-foreground min-w-0 whitespace-nowrap overflow-hidden">
        {"You have been invited to "}
        <span className="font-semibold inline-block max-w-[200px] truncate align-bottom">
          {orgName}
        </span>
      </p>
      <div className="flex items-center gap-1 shrink-0">
        {isPending ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReject}
              disabled={isAccepting || isRejecting}
              className="h-8 w-8"
            >
              <XClose size={14} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleAccept}
              disabled={isAccepting || isRejecting}
              className="h-8 w-8"
            >
              <Check size={14} />
            </Button>
          </>
        ) : isAccepted ? (
          <Badge variant="outline" className="h-6 px-2 text-xs">
            <Check size={12} />
            Accepted
          </Badge>
        ) : isRejected ? (
          <Badge variant="outline" className="h-6 px-2 text-xs">
            <XClose size={12} />
            Declined
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
