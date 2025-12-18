import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deco/ui/components/chart.tsx";
import { Pie, PieChart, Cell } from "recharts";

interface HomeGaugeProps {
  value: number;
  label: string;
  color?: string;
}

export function HomeGauge({
  value,
  label,
  color = "var(--color-chart-1)",
}: HomeGaugeProps) {
  // Create data for a full ring (always 100% filled when non-empty)
  const data = [
    { name: "filled", value: value > 0 ? 100 : 0 },
    { name: "empty", value: value > 0 ? 0 : 100 },
  ];

  return (
    <div className="relative h-[180px] w-[180px] flex items-center justify-center">
      <ChartContainer
        className="h-full w-full"
        config={{
          filled: { label: "Filled", color },
          empty: { label: "Empty", color: "var(--color-muted)" },
        }}
      >
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            startAngle={90}
            endAngle={-270}
            stroke="var(--color-border)"
            strokeWidth={1}
          >
            <Cell key="filled" fill={color} />
            <Cell key="empty" fill="var(--color-muted)" />
          </Pie>
        </PieChart>
      </ChartContainer>
      {/* Centered label inside gauge */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-3xl font-semibold text-foreground">
          {value.toLocaleString()}
        </div>
        <div className="text-sm text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}
