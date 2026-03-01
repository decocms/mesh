import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deco/ui/components/chart.tsx";
import { Bar, BarChart, XAxis } from "recharts";

const PLACEHOLDER_DATA = [
  { label: "Feb 16", calls: 28 },
  { label: "17", calls: 40 },
  { label: "18", calls: 22 },
  { label: "19", calls: 55 },
  { label: "20", calls: 18 },
  { label: "21", calls: 48 },
  { label: "22", calls: 35 },
  { label: "23", calls: 62 },
  { label: "24", calls: 44 },
  { label: "25", calls: 58 },
  { label: "26", calls: 36 },
  { label: "27", calls: 68 },
  { label: "28", calls: 52 },
  { label: "Mar 1", calls: 42 },
];

const CHART_CONFIG = {
  calls: { label: "Tool calls" },
};

interface ConnectionActivityProps {
  data?: Array<{ label: string; calls: number }>;
  isPlaceholder?: boolean;
}

export function ConnectionActivity({
  data = PLACEHOLDER_DATA,
  isPlaceholder = true,
}: ConnectionActivityProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Activity</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tool calls per day, last 14 days
          </p>
        </div>
        {isPlaceholder && (
          <span className="text-xs text-muted-foreground/60 italic">
            Sample data
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        <ChartContainer config={CHART_CONFIG} className="h-24 w-full">
          <BarChart data={data} barCategoryGap="25%">
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <ChartTooltip
              content={<ChartTooltipContent />}
              cursor={{ fill: "var(--muted)" }}
            />
            <Bar
              dataKey="calls"
              fill="var(--foreground)"
              radius={[2, 2, 0, 0]}
              opacity={0.85}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
