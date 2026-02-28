import { useWidget } from "./use-widget.ts";

type AreaChartArgs = {
  data?: Array<{ label: string; value: number }>;
  title?: string;
};

export default function AreaChart() {
  const { args } = useWidget<AreaChartArgs>();

  if (!args) return null;

  const { data = [], title = "Area Chart" } = args;

  if (data.length === 0) {
    return (
      <div className="p-4 font-sans">
        {title && (
          <div className="text-sm font-semibold text-foreground mb-3">
            {title}
          </div>
        )}
        <div className="text-sm text-muted-foreground text-center py-4">
          No data
        </div>
      </div>
    );
  }

  const W = 300;
  const H = 80;
  const PAD = 4;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const n = data.length;

  const xPos = (i: number) => PAD + (i / Math.max(n - 1, 1)) * innerW;
  const yPos = (v: number) => PAD + (1 - (v - min) / (max - min)) * innerH;

  const linePoints = data
    .map((d, i) => `${xPos(i)},${yPos(d.value)}`)
    .join(" ");
  const areaPath = [
    `M ${xPos(0)},${H - PAD}`,
    ...data.map((d, i) => `L ${xPos(i)},${yPos(d.value)}`),
    `L ${xPos(n - 1)},${H - PAD}`,
    "Z",
  ].join(" ");

  return (
    <div className="p-4 font-sans">
      {title && (
        <div className="text-sm font-semibold text-foreground mb-3">
          {title}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "80px" }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#area-fill)" className="text-primary" />
        <polyline
          points={linePoints}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary"
        />
      </svg>
      {data.length > 0 && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {data[0]?.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {data[data.length - 1]?.label}
          </span>
        </div>
      )}
    </div>
  );
}
