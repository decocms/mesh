import { useWidget } from "./use-widget.ts";

type SparklineArgs = {
  values?: number[];
  label?: string;
};

export default function Sparkline() {
  const { args } = useWidget<SparklineArgs>();

  if (!args) return null;

  const { values = [], label = "Trend" } = args;

  const last = values.length > 0 ? values[values.length - 1] : null;

  const W = 120;
  const H = 32;
  const PAD = 2;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  let points = "";
  if (values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values, min + 1);
    const n = values.length;
    points = values
      .map((v, i) => {
        const x = PAD + (i / (n - 1)) * innerW;
        const y = PAD + (1 - (v - min) / (max - min)) * innerH;
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <div className="flex items-center gap-3 px-2 py-1 font-sans">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        {last !== null && (
          <span className="text-base font-semibold text-foreground tabular-nums">
            {last}
          </span>
        )}
      </div>
      {points && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="text-primary shrink-0"
          style={{ width: `${W}px`, height: `${H}px` }}
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
