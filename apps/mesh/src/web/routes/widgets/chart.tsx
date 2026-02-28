import { useWidget } from "./use-widget.ts";

type ChartArgs = {
  data?: Array<{ label: string; value: number }>;
  title?: string;
};

export default function Chart() {
  const { args } = useWidget<ChartArgs>();

  if (!args) return null;

  const { data = [], title = "Chart" } = args;
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="p-4 font-sans">
      {title && (
        <div className="text-sm font-semibold text-foreground mb-3">
          {title}
        </div>
      )}
      {data.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          No data
        </div>
      ) : (
        <div className="flex items-end gap-2 h-32">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 flex-1 h-full"
            >
              <div className="flex flex-col justify-end flex-1 w-full">
                <div
                  className="w-full bg-primary rounded-sm min-h-0.5 transition-all"
                  style={{
                    height: `${Math.max((d.value / maxValue) * 100, 2)}%`,
                  }}
                />
              </div>
              <span
                className="text-xs text-muted-foreground truncate w-full text-center"
                title={d.label}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
