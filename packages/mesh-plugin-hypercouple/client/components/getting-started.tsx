/**
 * Getting Started Checklist
 *
 * The main view users see when entering the Hypercouple workspace.
 * Guides them through initial setup with a warm, calm tone.
 * Shows couple identity and reflects actual org member status.
 */

import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { cn } from "@deco/ui/lib/utils.ts";
import { CalendarDays, Check, Mail, Plane } from "lucide-react";
import { hypercoupleRouter } from "../lib/router";
import CoupleIdentity, { useCoupleMembers } from "./couple-identity";

interface ChecklistItem {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: "actionable" | "done" | "coming-soon";
  href?: string;
}

function ChecklistCard({ item }: { item: ChecklistItem }) {
  const navigate = hypercoupleRouter.useNavigate();
  const isDone = item.status === "done";
  const isComingSoon = item.status === "coming-soon";

  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-lg border transition-colors",
        isDone &&
          "border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20",
        isComingSoon && "border-border/50 bg-muted/30 opacity-60",
        item.status === "actionable" &&
          "border-border hover:border-rose-200 hover:bg-rose-50/30 dark:hover:border-rose-900/30 dark:hover:bg-rose-950/10 cursor-pointer",
      )}
      onClick={() => {
        if (item.status === "actionable" && item.href) {
          navigate({ to: item.href as any });
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && item.status === "actionable" && item.href) {
          navigate({ to: item.href as any });
        }
      }}
      role={item.status === "actionable" ? "button" : undefined}
      tabIndex={item.status === "actionable" ? 0 : undefined}
    >
      {/* Status indicator */}
      <div
        className={cn(
          "flex items-center justify-center size-8 rounded-full shrink-0 mt-0.5",
          isDone &&
            "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
          isComingSoon && "bg-muted text-muted-foreground",
          item.status === "actionable" &&
            "bg-rose-100 text-rose-500 dark:bg-rose-900/30 dark:text-rose-400",
        )}
      >
        {isDone ? <Check size={16} /> : item.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{item.title}</h3>
          {isComingSoon && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
              Coming soon
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {item.description}
        </p>
      </div>
    </div>
  );
}

export default function GettingStarted() {
  const { session } = usePluginContext({ partial: true });
  const { memberCount } = useCoupleMembers();

  // Partner is invited when org has 2 members
  const partnerInvited = memberCount >= 2;

  const userName = session?.user?.name?.split(" ")[0] ?? "there";

  const items: ChecklistItem[] = [
    {
      icon: <Mail size={16} />,
      title: "Invite your partner",
      description: partnerInvited
        ? "Your partner has joined the space!"
        : "Send an invite so you can plan adventures together.",
      status: partnerInvited ? "done" : "actionable",
      // Only link to invite if partner hasn't joined yet
      href: partnerInvited ? undefined : "/hypercouple-layout/invite",
    },
    {
      icon: <Plane size={16} />,
      title: "Set travel preferences",
      description:
        "Tell us what you both love -- beaches, mountains, city breaks.",
      status: "coming-soon",
    },
    {
      icon: <CalendarDays size={16} />,
      title: "Connect your calendar",
      description:
        "Find the perfect time for your next getaway, automatically.",
      status: "coming-soon",
    },
  ];

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      {/* Couple Identity */}
      <div className="mb-8">
        <CoupleIdentity />
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hey {userName}, let's get you set up
        </h1>
        <p className="text-muted-foreground mt-1">
          A few quick steps to get your couple's workspace ready.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <ChecklistCard key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}
