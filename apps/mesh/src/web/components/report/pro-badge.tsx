/**
 * ProBadge — reusable upgrade indicator for mocked Pro sections.
 *
 * Renders a small pill badge with a sparkle icon and "Pro" text (or custom
 * label). Uses a violet/purple gradient to stand out from the neutral
 * document style and signal premium/locked content.
 */

interface ProBadgeProps {
  label?: string;
}

export function ProBadge({ label = "Pro" }: ProBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
      {/* Sparkle icon */}
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="currentColor"
        className="shrink-0"
      >
        <path d="M5 0l1.03 3.47L9.5 4.5l-3.47 1.03L5 9l-1.03-3.47L.5 4.5l3.47-1.03L5 0z" />
      </svg>
      {label}
    </span>
  );
}
