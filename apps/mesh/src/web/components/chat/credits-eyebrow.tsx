/**
 * Credits Eyebrow — subtle pills shown above the chat greeting on
 * the home page to communicate credit status.
 *
 * - Has credits: green pill "$2.00 in credits to get started"
 * - No credits: amber pill "No credits remaining"
 */

import { Coins04, AlertCircle } from "@untitledui/icons";
import { cn } from "@decocms/ui/lib/utils.ts";
import { useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";

interface CreditsEyebrowProps {
  balanceDollars: number;
}

export function CreditsEyebrow({ balanceDollars }: CreditsEyebrowProps) {
  const formatted = balanceDollars.toFixed(2);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full",
        "bg-emerald-50 dark:bg-emerald-950/30",
        "border border-emerald-200/60 dark:border-emerald-800/40",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
      )}
    >
      <Coins04 size={13} className="text-emerald-600 dark:text-emerald-400" />
      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
        ${formatted} in credits to get started
      </span>
    </div>
  );
}

export function NoCreditsEyebrow() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() =>
        navigate({
          to: "/$org/settings/ai-providers",
          params: { org: org.slug },
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer",
        "bg-amber-50 dark:bg-amber-950/30",
        "border border-amber-200/60 dark:border-amber-800/40",
        "hover:bg-amber-100/60 dark:hover:bg-amber-900/30",
        "transition-colors duration-150",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
      )}
    >
      <AlertCircle size={13} className="text-amber-600 dark:text-amber-400" />
      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
        No credits remaining &middot; Add more
      </span>
    </button>
  );
}
