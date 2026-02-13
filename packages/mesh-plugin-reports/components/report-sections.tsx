/**
 * Report Section Renderers
 *
 * Components for rendering each report section type:
 * - MarkdownSection: renders markdown content
 * - MetricsSection: renders a grid of metric cards
 * - TableSection: renders a data table
 */

import type {
  MetricItem,
  ReportSection,
  ReportStatus,
} from "@decocms/bindings";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deco/ui/components/table.tsx";
import { Markdown } from "@deco/ui/components/markdown.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowDown, ArrowUp, Minus } from "@untitledui/icons";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<ReportStatus, string> = {
  passing: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  failing: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
};

const STATUS_BG: Record<ReportStatus, string> = {
  passing: "bg-emerald-500/10 border-emerald-500/20",
  warning: "bg-amber-500/10 border-amber-500/20",
  failing: "bg-red-500/10 border-red-500/20",
  info: "bg-blue-500/10 border-blue-500/20",
};

// ---------------------------------------------------------------------------
// Markdown Section
// ---------------------------------------------------------------------------

function MarkdownSection({ content }: { content: string }) {
  return <Markdown>{content}</Markdown>;
}

// ---------------------------------------------------------------------------
// Metrics Section
// ---------------------------------------------------------------------------

function DeltaIndicator({
  current,
  previous,
}: {
  current: number | string;
  previous: number | string;
}) {
  const currentNum =
    typeof current === "number" ? current : parseFloat(current);
  const previousNum =
    typeof previous === "number" ? previous : parseFloat(previous);

  if (isNaN(currentNum) || isNaN(previousNum)) return null;

  const diff = currentNum - previousNum;
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus size={12} />
        no change
      </span>
    );
  }

  const isUp = diff > 0;
  const formatted = `${isUp ? "+" : ""}${diff.toFixed(1)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs",
        isUp ? "text-red-500" : "text-emerald-500",
      )}
    >
      {isUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {formatted}
    </span>
  );
}

function MetricCard({ metric }: { metric: MetricItem }) {
  const statusColor = metric.status
    ? STATUS_COLORS[metric.status]
    : "text-foreground";
  const statusBg = metric.status
    ? STATUS_BG[metric.status]
    : "bg-muted/50 border-border";

  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border p-4", statusBg)}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {metric.label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn("text-2xl font-semibold tabular-nums", statusColor)}
        >
          {metric.value}
        </span>
        {metric.unit && (
          <span className="text-sm text-muted-foreground">{metric.unit}</span>
        )}
      </div>
      {metric.previousValue !== undefined && (
        <DeltaIndicator
          current={metric.value}
          previous={metric.previousValue}
        />
      )}
    </div>
  );
}

function MetricsSection({
  title,
  items,
}: {
  title?: string;
  items: MetricItem[];
}) {
  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((metric, i) => (
          <MetricCard key={`${metric.label}-${i}`} metric={metric} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Section
// ---------------------------------------------------------------------------

function TableSection({
  title,
  columns,
  rows,
}: {
  title?: string;
  columns: string[];
  rows: (string | number | null)[][];
}) {
  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      )}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <TableCell key={cellIdx}>
                    {cell ?? <span className="text-muted-foreground">-</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Renderer (dispatch by type)
// ---------------------------------------------------------------------------

export function ReportSectionRenderer({ section }: { section: ReportSection }) {
  switch (section.type) {
    case "markdown":
      return <MarkdownSection content={section.content} />;
    case "metrics":
      return <MetricsSection title={section.title} items={section.items} />;
    case "table":
      return (
        <TableSection
          title={section.title}
          columns={section.columns}
          rows={section.rows}
        />
      );
    default:
      return null;
  }
}
