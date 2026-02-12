"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronRight, Check, Copy01 } from "@untitledui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { useCopy } from "@deco/ui/hooks/use-copy.ts";
import { formatToolMetrics } from "./utils.tsx";
import { MemoizedMarkdown } from "../../../markdown.tsx";

export interface ToolCallShellProps {
  /** Icon rendered at the left of the row (ReactNode — caller picks the icon) */
  icon: ReactNode;
  /** Primary label (tool name, question text, agent title) */
  title: string;
  /** Usage for the operation (optional). Tokens always shown when provided; cost shown when cost > 0. */
  usage?: { tokens: number; cost?: number };
  /** Latency in seconds for the operation (optional) */
  latencySeconds?: number;
  /** Second-line summary text shown in collapsed state */
  summary?: string;
  /** Derived UI state computed by caller based on their loading semantics */
  state: "loading" | "error" | "idle";
  /** Detail shown in expanded view. Rendered as markdown or plain text (copiable). Replaces children/expandedText. */
  detail?: string | null;
}

function looksLikeMarkdown(text: string): boolean {
  return text.includes("#") || text.includes("`");
}

export function ToolCallShell({
  icon,
  title,
  usage,
  latencySeconds,
  summary,
  state,
  detail,
}: ToolCallShellProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailId = useId();
  const { handleCopy, copied } = useCopy();
  const isLoading = state === "loading";
  const isError = state === "error";
  const isExpandable = !!(detail && detail.trim());
  const metricsStr = formatToolMetrics({ usage, latencySeconds });

  return (
    <div className="flex flex-col w-full min-w-0">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="border border-border/75 rounded-lg flex flex-col bg-background w-full min-w-0 overflow-hidden">
          <CollapsibleTrigger
            disabled={isLoading || !isExpandable}
            className={cn(
              "flex flex-col gap-0.5 w-full p-3 transition-colors text-left",
              !isLoading && isExpandable && "cursor-pointer hover:bg-accent/50",
              (isLoading || !isExpandable) &&
                "cursor-default pointer-events-none",
              isLoading && "shimmer",
            )}
            aria-disabled={isLoading || !isExpandable}
          >
            {/* First line: icon, title, metrics, chevron */}
            <div className="flex items-center gap-2 w-full min-w-0">
              <div
                className={cn(
                  "shrink-0 flex items-center [&>svg]:size-4",
                  isError && "[&>svg]:text-destructive",
                )}
              >
                {icon}
              </div>
              <span
                className={cn(
                  "flex-1 min-w-0 text-[15px] text-muted-foreground truncate",
                  isError && "text-destructive/90",
                )}
              >
                {title}
              </span>
              {metricsStr && (
                <span className="shrink-0 text-xs text-muted-foreground/75 tabular-nums">
                  {metricsStr}
                </span>
              )}
              {!isLoading && isExpandable && (
                <ChevronRight
                  className={cn(
                    "size-4 text-muted-foreground shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-90",
                  )}
                />
              )}
            </div>
            {/* Second line: summary */}
            {summary && (
              <div className="flex items-center min-w-0 mt-0.5">
                <span className="flex-1 min-w-0 text-xs text-muted-foreground/75 truncate">
                  {summary}
                </span>
              </div>
            )}
          </CollapsibleTrigger>

          {isExpandable && (
            <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
              <div className="border-t border-border/50 px-3 pb-3 pt-3">
                <div className="flex items-start justify-between gap-2 max-h-48 overflow-y-auto">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {looksLikeMarkdown(detail!) ? (
                      <MemoizedMarkdown
                        id={`tool-call-detail-${detailId}`}
                        text={detail!}
                      />
                    ) : (
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap wrap-break-word">
                        {detail}
                      </pre>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(detail!)}
                    className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    aria-label="Copy"
                  >
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy01 className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </CollapsibleContent>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

export type { ToolCallMetrics } from "./utils.tsx";
