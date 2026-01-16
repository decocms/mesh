import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Inbox01, Check, XClose, Mail01 } from "@untitledui/icons";
import { AuthUIContext } from "@daveyplate/better-auth-ui";
import { useContext, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/web/lib/auth-client";
import { toast } from "sonner";

interface Invitation {
  id: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  inviterId: string;
  inviter?: {
    name?: string;
    email?: string;
    image?: string;
  };
}

function InvitationItem({
  invitation,
  onStatusChange,
}: {
  invitation: Invitation;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
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
        // Update local state immediately for UI feedback
        onStatusChange(invitation.id, "accepted");

        // Set the new org as active to update session
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
        // Update local state immediately
        onStatusChange(invitation.id, "rejected");
        setIsRejecting(false);
      }
    } catch {
      toast.error("Failed to reject invitation");
      setIsRejecting(false);
    }
  };

  // Use what data we have from the invitation
  const orgName = invitation.organizationName || invitation.organizationId;
  const inviterDisplay =
    invitation.inviter?.name ||
    invitation.inviter?.email ||
    invitation.email ||
    "Someone";

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
        <span className="font-semibold inline-block max-w-[120px] truncate align-bottom">
          {inviterDisplay}
        </span>
        {" invited you to join "}
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

export function InboxButton() {
  const [open, setOpen] = useState(false);
  const authUi = useContext(AuthUIContext);
  const { data: _invitations } = authUi.hooks.useListUserInvitations();
  const { data: organizations } = authClient.useListOrganizations();
  const [localStatusOverrides, setLocalStatusOverrides] = useState<
    Record<string, string>
  >({});

  const rawInvitations = (_invitations ?? []) as Invitation[];

  // Enrich invitations with organization slugs
  const enrichedInvitations = rawInvitations.map((inv) => {
    const org = (organizations ?? []).find((o) => o.id === inv.organizationId);
    return {
      ...inv,
      organizationSlug: org?.slug || inv.organizationSlug,
      organizationName: org?.name || inv.organizationName,
    };
  });

  // Apply local status overrides
  const invitations = enrichedInvitations.map((inv) => ({
    ...inv,
    status: localStatusOverrides[inv.id] || inv.status,
  }));

  // Sort invitations: pending first, then accepted, then rejected
  const sortedInvitations = [...invitations].sort((a, b) => {
    const statusOrder = { pending: 0, accepted: 1, rejected: 2 };
    return (
      (statusOrder[a.status as keyof typeof statusOrder] ?? 999) -
      (statusOrder[b.status as keyof typeof statusOrder] ?? 999)
    );
  });

  const pendingInvitations = invitations.filter(
    (inv) => inv.status === "pending",
  );
  const hasPendingInvites = pendingInvitations.length > 0;

  const handleStatusChange = (id: string, newStatus: string) => {
    setLocalStatusOverrides((prev) => ({
      ...prev,
      [id]: newStatus,
    }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-7 w-7 p-0"
          aria-label="Inbox"
        >
          <Inbox01 size={18} className="text-muted-foreground" />
          {hasPendingInvites && (
            <span className="absolute bottom-1 right-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[480px] p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Inbox</h3>
        </div>
        <div className="max-h-96 overflow-auto">
          {sortedInvitations.length > 0 ? (
            sortedInvitations.map((invitation) => (
              <InvitationItem
                key={invitation.id}
                invitation={invitation}
                onStatusChange={handleStatusChange}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Inbox01 size={32} className="text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No invitations at the moment
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
