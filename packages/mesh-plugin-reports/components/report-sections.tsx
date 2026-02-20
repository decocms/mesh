import type {
  CriterionItem,
  MetricItem,
  RankedListRow,
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
import {
  ArrowDown,
  ArrowUp,
  CheckVerified02,
  ChevronDown,
  ChevronRight,
  File02,
  Hash02,
  Minus,
  Rows03,
} from "@untitledui/icons";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<ReportStatus, string> = {
  passing: "bg-emerald-500",
  warning: "bg-amber-500",
  failing: "bg-red-500",
  info: "bg-blue-500",
};

const CRITERIA_COLORS = ["#A595FF", "#FFC116", "#DE3A6E"];

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
}) {
  return (
    <div className="flex gap-2 items-center">
      <Icon size={16} className="opacity-75 shrink-0 text-foreground" />
      <span className="text-base text-foreground opacity-75">{title}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown Section
// ---------------------------------------------------------------------------

function MarkdownSection({ content }: { content: string }) {
  return <Markdown>{content}</Markdown>;
}

// ---------------------------------------------------------------------------
// Metrics Section
// ---------------------------------------------------------------------------

function MetricCard({ metric }: { metric: MetricItem }) {
  return (
    <div className="flex flex-col gap-3 items-start justify-end border border-border rounded-lg p-5 flex-1">
      <div className="text-2xl leading-8 text-foreground font-normal tabular-nums">
        {metric.value}
        {metric.unit && (
          <span className="text-base text-muted-foreground ml-1">
            {metric.unit}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 items-center">
        {metric.status && (
          <span
            className={cn(
              "inline-block size-2 rounded-full shrink-0",
              STATUS_DOT[metric.status],
            )}
          />
        )}
        <span className="text-sm text-foreground">{metric.label}</span>
      </div>
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
    <div className="space-y-4">
      {title && <SectionHeader icon={Rows03} title={title} />}
      <div className="flex gap-4 items-stretch">
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
    <div className="space-y-4">
      {title && <SectionHeader icon={Rows03} title={title} />}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="font-mono text-xs uppercase text-muted-foreground"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <TableCell key={cellIdx} className="text-sm">
                    {cell ?? <span className="text-muted-foreground">—</span>}
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
// Criteria Section
// ---------------------------------------------------------------------------

function CriteriaSection({
  title,
  items,
}: {
  title?: string;
  items: CriterionItem[];
}) {
  return (
    <div className="space-y-4">
      {title && <SectionHeader icon={CheckVerified02} title={title} />}
      <div className="flex flex-col">
        {items.map((item, i) => (
          <div key={`${item.label}-${i}`} className="flex gap-4 items-stretch">
            <div className="flex flex-col items-center justify-center w-4 shrink-0">
              <div className="h-full w-px bg-border" />
              <div
                className="w-2 h-4 rounded-full flex"
                style={{
                  backgroundColor: CRITERIA_COLORS[i % CRITERIA_COLORS.length],
                }}
              />
              <div
                className={cn(
                  "h-full w-px bg-border",
                  i === items.length - 1 && "invisible",
                )}
              />
            </div>
            <div className="flex flex-col gap-2 items-start py-3 pb-4 min-w-0">
              <span className="text-sm font-medium text-foreground leading-none">
                {item.label}
              </span>
              {item.description && (
                <p className="text-sm text-foreground opacity-80 leading-5">
                  {item.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Note Section
// ---------------------------------------------------------------------------

function NoteSection({ content }: { content: string }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={File02} title="Notas" />
      <p className="text-sm text-foreground opacity-80 leading-5">{content}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranked List Section
// ---------------------------------------------------------------------------

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center justify-center">
        <Minus size={16} className="text-muted-foreground" />
      </span>
    );
  }

  const isUp = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium",
        isUp ? "text-emerald-600" : "text-destructive",
      )}
    >
      {isUp ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
      {Math.abs(delta)}
    </span>
  );
}

function RankedListSection({
  title,
  columns,
  rows,
}: {
  title?: string;
  columns: string[];
  rows: RankedListRow[];
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <div className="space-y-6">
      {title && <SectionHeader icon={Rows03} title={title} />}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs uppercase text-muted-foreground w-[70px]">
                #
              </TableHead>
              <TableHead className="font-mono text-xs uppercase text-muted-foreground w-[70px]">
                DELTA
              </TableHead>
              <TableHead className="font-mono text-xs uppercase text-muted-foreground">
                PRODUTO
              </TableHead>
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="font-mono text-xs uppercase text-muted-foreground"
                >
                  {col}
                </TableHead>
              ))}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => {
              const isExpanded = expanded[rowIdx] ?? false;
              const hasNote = Boolean(row.note);
              const isHighlighted = hasNote;
              const delta =
                row.reference_position !== undefined
                  ? row.reference_position - row.position
                  : (row.delta ?? 0);

              return (
                <>
                  <TableRow
                    key={`row-${rowIdx}`}
                    className={cn(isHighlighted && "bg-muted/25")}
                  >
                    {/* Position */}
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-50">
                        <Hash02 size={16} className="text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground tabular-nums">
                          {row.position}
                        </span>
                      </div>
                    </TableCell>

                    {/* Delta */}
                    <TableCell>
                      <DeltaBadge delta={delta} />
                    </TableCell>

                    {/* Product */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {row.image && (
                          <img
                            src={row.image}
                            alt=""
                            className="h-12 w-8 object-cover rounded-sm shrink-0 bg-muted"
                          />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">
                          {row.label}
                        </span>
                      </div>
                    </TableCell>

                    {/* Values */}
                    {row.values.map((val, cellIdx) => (
                      <TableCell key={cellIdx} className="text-sm tabular-nums">
                        {val}
                      </TableCell>
                    ))}

                    {/* Expand chevron */}
                    <TableCell>
                      {hasNote && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [rowIdx]: !prev[rowIdx],
                            }))
                          }
                          className="flex items-center justify-center size-6 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>
                      )}
                      {!hasNote && (
                        <ChevronRight
                          size={16}
                          className="text-muted-foreground"
                        />
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded note row */}
                  {hasNote && isExpanded && (
                    <TableRow
                      key={`note-${rowIdx}`}
                      className={cn(isHighlighted && "bg-muted/25")}
                    >
                      <TableCell colSpan={3 + columns.length + 1}>
                        <div className="pl-8 pb-2 flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground uppercase opacity-50 tracking-wide">
                            MUDANÇA
                          </span>
                          <p className="text-sm text-foreground opacity-80 leading-5">
                            {row.note}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
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
    case "criteria":
      return <CriteriaSection title={section.title} items={section.items} />;
    case "note":
      return <NoteSection content={section.content} />;
    case "ranked-list":
      return (
        <RankedListSection
          title={section.title}
          columns={section.columns}
          rows={section.rows}
        />
      );
    default:
      return null;
  }
}
