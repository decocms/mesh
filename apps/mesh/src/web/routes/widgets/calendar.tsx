import { cn } from "@deco/ui/lib/utils.ts";
import { useWidget } from "./use-widget.ts";

type CalendarArgs = {
  month: number;
  year: number;
  highlightedDates?: number[];
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function Calendar() {
  const { args } = useWidget<CalendarArgs>();

  if (!args) return null;

  const { month, year, highlightedDates = [] } = args;
  const highlighted = new Set(highlightedDates);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="p-3 font-sans select-none">
      <div className="text-center text-sm font-semibold text-foreground mb-3">
        {MONTH_NAMES[(month - 1) % 12]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div
            key={i}
            className={cn(
              "text-center text-sm py-1 rounded-md",
              day === null
                ? ""
                : highlighted.has(day)
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-foreground hover:bg-accent cursor-default",
            )}
          >
            {day ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}
