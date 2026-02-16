/**
 * Partner Invite Form
 *
 * Simple form to invite a partner to the couple's workspace.
 * Uses Better Auth's organization invite to add a partner as co-owner.
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, ArrowLeft, Heart } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { hypercoupleRouter } from "../lib/router";

// Create a minimal auth client for organization invites
const authClient = createAuthClient({
  plugins: [organizationClient()],
});

export default function PartnerInvite() {
  const navigate = hypercoupleRouter.useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) return;

    setIsLoading(true);
    try {
      const result = await authClient.organization.inviteMember({
        email: email.trim(),
        role: "owner",
      });

      if (result.error) {
        toast.error(result.error.message ?? "Failed to send invitation");
        return;
      }

      setIsSent(true);
    } catch (_err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="flex items-center justify-center size-12 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 mx-auto mb-4">
          <Heart size={20} />
        </div>
        <h2 className="text-xl font-semibold mb-2">Invitation sent!</h2>
        <p className="text-muted-foreground mb-6">
          {email} will receive an email to join your space. Once they accept,
          you'll be ready to plan adventures together.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/hypercouple-layout" })}
        >
          <ArrowLeft size={16} />
          Back to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <button
        type="button"
        onClick={() => navigate({ to: "/hypercouple-layout" })}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Invite your partner
        </h1>
        <p className="text-muted-foreground mt-1">
          Invite your partner to plan adventures together. They'll join as a
          co-owner with equal permissions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="partner-email" className="text-sm font-medium">
            Partner's email
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="partner-email"
              type="email"
              placeholder="partner@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              required
              disabled={isLoading}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || !email.trim()}
        >
          {isLoading ? "Sending..." : "Send Invite"}
        </Button>
      </form>
    </div>
  );
}
