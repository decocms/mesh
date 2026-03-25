import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowRight, CheckCircle } from "@untitledui/icons";
import { isBrandContextDone } from "./context-ready-toast";

/**
 * Banner card shown on the home page.
 * Reads sessionStorage to know if the brand context workflow completed.
 * "loading" → animated illustration + pulsing dots
 * "done"    → green success state linking to the brand context settings page
 */
export function BrandContextBanner() {
  const { org } = useParams({ strict: false }) as { org: string };
  const [phase] = useState<"loading" | "done">(() =>
    isBrandContextDone() ? "done" : "loading",
  );
  const done = phase === "done";

  return (
    <Link
      to="/$org/settings/brand-context"
      params={{ org }}
      className="w-full relative flex items-center gap-5 px-5 py-5 rounded-lg border border-border bg-card overflow-hidden transition-colors text-left group hover:bg-accent/30"
    >
      {/* Illustration */}
      <div className="relative shrink-0 size-14 rounded-lg overflow-hidden">
        <svg
          viewBox="0 0 40 40"
          className="size-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Central node */}
          <circle
            cx="20"
            cy="20"
            r="6"
            className={cn(
              done
                ? "fill-emerald-500/10 stroke-emerald-500/40"
                : "fill-blue-500/10 stroke-blue-500/40",
            )}
            strokeWidth="1"
          />
          <text
            x="20"
            y="21.5"
            textAnchor="middle"
            className={cn(
              "text-[6px] font-bold",
              done ? "fill-emerald-500/60" : "fill-blue-500/60",
            )}
          >
            {"{}"}
          </text>

          {/* Orbiting dots */}
          {[
            { cx: 8, cy: 8 },
            { cx: 32, cy: 8 },
            { cx: 8, cy: 32 },
            { cx: 32, cy: 32 },
            { cx: 20, cy: 4 },
            { cx: 20, cy: 36 },
          ].map((node, i) => (
            <g key={i}>
              <line
                x1={node.cx}
                y1={node.cy}
                x2="20"
                y2="20"
                className={cn(
                  done ? "stroke-emerald-500/20" : "stroke-blue-500/15",
                )}
                strokeWidth="0.5"
                strokeDasharray={done ? "none" : "2 2"}
              >
                {!done && (
                  <animate
                    attributeName="stroke-dashoffset"
                    values="4;0"
                    dur="1s"
                    repeatCount="indefinite"
                    begin={`${i * 0.15}s`}
                  />
                )}
              </line>
              <circle
                cx={node.cx}
                cy={node.cy}
                r="2.5"
                className={cn(
                  done
                    ? "fill-emerald-500/8 stroke-emerald-500/20"
                    : "fill-blue-500/8 stroke-blue-500/20",
                )}
                strokeWidth="0.5"
              />
            </g>
          ))}

          {/* Pulse ring when loading */}
          {!done && (
            <circle
              cx="20"
              cy="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.3"
              className="text-blue-500/30"
            >
              <animate
                attributeName="r"
                values="8;18"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.4;0"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-none">
          {done ? "Brand context ready" : "Building your brand context..."}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {done
            ? "Your brand context is available for all agents and spaces"
            : "Analyzing your website for brand identity, tone, audience, and market data"}
        </p>
      </div>

      {done ? (
        <div className="shrink-0 flex items-center gap-2">
          <CheckCircle size={16} className="text-success" />
          <div className="bg-background flex items-center justify-center size-8 rounded-md">
            <ArrowRight
              size={16}
              className="text-foreground transition-transform group-hover:translate-x-0.5"
            />
          </div>
        </div>
      ) : (
        <div className="shrink-0 flex items-center gap-2">
          <div className="flex gap-1">
            <div
              className="size-1.5 rounded-full bg-blue-500/60 animate-pulse"
              style={{ animationDelay: "0s" }}
            />
            <div
              className="size-1.5 rounded-full bg-blue-500/60 animate-pulse"
              style={{ animationDelay: "0.3s" }}
            />
            <div
              className="size-1.5 rounded-full bg-blue-500/60 animate-pulse"
              style={{ animationDelay: "0.6s" }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}
