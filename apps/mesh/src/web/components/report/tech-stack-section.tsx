/**
 * TechStackSection — displays detected tech stack from the tech stack
 * diagnostic agent: platform, analytics, CDN, payment providers, chat tools.
 */

import { Badge } from "@deco/ui/components/badge.tsx";
import type { TechStackResult } from "@/diagnostic/types";

// ============================================================================
// Sub-components
// ============================================================================

interface TechBadgeProps {
  name: string;
  confidence?: number;
}

function TechBadge({ name, confidence }: TechBadgeProps) {
  const label =
    confidence !== undefined
      ? `${name} (${Math.round(confidence * 100)}%)`
      : name;

  return (
    <Badge variant="secondary" className="text-xs">
      {label}
    </Badge>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface TechStackSectionProps {
  data: TechStackResult | null | undefined;
}

export function TechStackSection({ data }: TechStackSectionProps) {
  if (!data) {
    return (
      <section aria-labelledby="tech-stack-heading">
        <h2
          id="tech-stack-heading"
          className="text-xl font-semibold text-foreground"
        >
          Tech Stack
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          No tech stack data available for this report.
        </p>
      </section>
    );
  }

  const hasAnyData =
    data.platform ||
    (data.analytics && data.analytics.length > 0) ||
    data.cdn ||
    (data.paymentProviders && data.paymentProviders.length > 0) ||
    (data.chatTools && data.chatTools.length > 0) ||
    (data.reviewWidgets && data.reviewWidgets.length > 0) ||
    (data.otherTech && data.otherTech.length > 0);

  return (
    <section aria-labelledby="tech-stack-heading">
      <h2
        id="tech-stack-heading"
        className="text-xl font-semibold text-foreground"
      >
        Tech Stack
      </h2>

      {!hasAnyData ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No technologies detected.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full">
            <tbody>
              {/* Platform — prominent row */}
              {data.platform && (
                <tr className="border-b border-border bg-muted/30">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-foreground w-36"
                  >
                    Platform
                  </th>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="text-sm px-3 py-1">
                        {data.platform.name}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(data.platform.confidence * 100)}% confidence
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {/* Other categories */}
              {data.analytics && data.analytics.length > 0 && (
                <tr className="border-t border-border">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-foreground align-top w-36"
                  >
                    Analytics
                  </th>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {data.analytics.map((item) => (
                        <TechBadge key={item.name} name={item.name} />
                      ))}
                    </div>
                  </td>
                </tr>
              )}

              {data.cdn && (
                <tr className="border-t border-border">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-foreground w-36"
                  >
                    CDN
                  </th>
                  <td className="px-4 py-3">
                    <TechBadge name={data.cdn.name} />
                  </td>
                </tr>
              )}

              {data.paymentProviders && data.paymentProviders.length > 0 && (
                <tr className="border-t border-border">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-foreground align-top w-36"
                  >
                    Payments
                  </th>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {data.paymentProviders.map((item) => (
                        <TechBadge key={item.name} name={item.name} />
                      ))}
                    </div>
                  </td>
                </tr>
              )}

              {data.chatTools && data.chatTools.length > 0 && (
                <tr className="border-t border-border">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-foreground align-top w-36"
                  >
                    Chat
                  </th>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {data.chatTools.map((item) => (
                        <TechBadge key={item.name} name={item.name} />
                      ))}
                    </div>
                  </td>
                </tr>
              )}

              {data.reviewWidgets && data.reviewWidgets.length > 0 && (
                <tr className="border-t border-border">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-foreground align-top w-36"
                  >
                    Reviews
                  </th>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {data.reviewWidgets.map((item) => (
                        <TechBadge key={item.name} name={item.name} />
                      ))}
                    </div>
                  </td>
                </tr>
              )}

              {data.otherTech && data.otherTech.length > 0 && (
                <tr className="border-t border-border">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-foreground align-top w-36"
                  >
                    Other
                  </th>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {data.otherTech.map((item) => (
                        <TechBadge key={item.name} name={item.name} />
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
