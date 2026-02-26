import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

type CronFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "custom";

interface CronScheduleSelectorProps {
  value: string;
  onChange: (cronExpression: string) => void;
  disabled?: boolean;
}

const WEEK_DAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

function parseCronExpression(value: string): {
  frequency: CronFrequency;
  minute: number;
  hour: number;
  weekDay: number;
  dayOfMonth: number;
} {
  const normalized = value.trim();
  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) {
    return {
      frequency: "custom",
      minute: 0,
      hour: 9,
      weekDay: 1,
      dayOfMonth: 1,
    };
  }

  const [minutePart, hourPart, dayOfMonthPart, _monthPart, dayOfWeekPart] =
    parts;
  const minute = Number(minutePart);
  const hour = Number(hourPart);
  const dayOfMonth = Number(dayOfMonthPart);
  const weekDay = Number(dayOfWeekPart);
  const validTime =
    Number.isInteger(minute) &&
    Number.isInteger(hour) &&
    minute >= 0 &&
    minute <= 59 &&
    hour >= 0 &&
    hour <= 23;

  if (!validTime) {
    return {
      frequency: "custom",
      minute: 0,
      hour: 9,
      weekDay: 1,
      dayOfMonth: 1,
    };
  }

  if (dayOfMonthPart === "*" && dayOfWeekPart === "*") {
    return {
      frequency: "daily",
      minute,
      hour,
      weekDay: 1,
      dayOfMonth: 1,
    };
  }

  if (dayOfMonthPart === "*/14" && dayOfWeekPart === "*") {
    return {
      frequency: "biweekly",
      minute,
      hour,
      weekDay: 1,
      dayOfMonth: 1,
    };
  }

  if (
    dayOfMonthPart === "*" &&
    Number.isInteger(weekDay) &&
    weekDay >= 0 &&
    weekDay <= 6
  ) {
    return {
      frequency: "weekly",
      minute,
      hour,
      weekDay,
      dayOfMonth: 1,
    };
  }

  if (
    dayOfWeekPart === "*" &&
    Number.isInteger(dayOfMonth) &&
    dayOfMonth >= 1 &&
    dayOfMonth <= 31
  ) {
    return {
      frequency: "monthly",
      minute,
      hour,
      weekDay: 1,
      dayOfMonth,
    };
  }

  return {
    frequency: "custom",
    minute,
    hour,
    weekDay: 1,
    dayOfMonth: 1,
  };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildCron(args: {
  frequency: CronFrequency;
  hour: number;
  minute: number;
  weekDay: number;
  dayOfMonth: number;
  currentValue: string;
}): string {
  if (args.frequency === "daily") {
    return `${args.minute} ${args.hour} * * *`;
  }
  if (args.frequency === "weekly") {
    return `${args.minute} ${args.hour} * * ${args.weekDay}`;
  }
  if (args.frequency === "biweekly") {
    // Standard cron has no native "every other Tuesday", so we use every 14 days.
    return `${args.minute} ${args.hour} */14 * *`;
  }
  if (args.frequency === "monthly") {
    return `${args.minute} ${args.hour} ${args.dayOfMonth} * *`;
  }
  return args.currentValue;
}

export function CronScheduleSelector({
  value,
  onChange,
  disabled = false,
}: CronScheduleSelectorProps) {
  const parsed = parseCronExpression(value);

  const updateFrequency = (frequency: CronFrequency) => {
    if (frequency === "custom") {
      onChange(value);
      return;
    }
    onChange(
      buildCron({
        frequency,
        hour: parsed.hour,
        minute: parsed.minute,
        weekDay: parsed.weekDay,
        dayOfMonth: parsed.dayOfMonth,
        currentValue: value,
      }),
    );
  };

  const updateTime = (time: string) => {
    const [hourText, minuteText] = time.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;
    onChange(
      buildCron({
        frequency: parsed.frequency,
        hour,
        minute,
        weekDay: parsed.weekDay,
        dayOfMonth: parsed.dayOfMonth,
        currentValue: value,
      }),
    );
  };

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2",
        parsed.frequency === "daily" || parsed.frequency === "biweekly"
          ? "md:grid-cols-2"
          : "md:grid-cols-3",
      )}
    >
      <div className="space-y-1">
        <Label>Frequency</Label>
        <Select
          value={parsed.frequency}
          onValueChange={(v) => updateFrequency(v as CronFrequency)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Every 2 weeks</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {parsed.frequency !== "custom" && (
        <div className="space-y-1">
          <Label>Time</Label>
          <Input
            type="time"
            value={formatTime(parsed.hour, parsed.minute)}
            onChange={(event) => updateTime(event.target.value)}
            disabled={disabled}
          />
        </div>
      )}

      {parsed.frequency === "weekly" ? (
        <div className="space-y-1">
          <Label>Day of week</Label>
          <Select
            value={String(parsed.weekDay)}
            onValueChange={(v) =>
              onChange(
                buildCron({
                  frequency: "weekly",
                  hour: parsed.hour,
                  minute: parsed.minute,
                  weekDay: Number(v),
                  dayOfMonth: parsed.dayOfMonth,
                  currentValue: value,
                }),
              )
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_DAYS.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : parsed.frequency === "monthly" ? (
        <div className="space-y-1">
          <Label>Day of month</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={parsed.dayOfMonth}
            onChange={(event) => {
              const nextDay = Number(event.target.value);
              if (!Number.isInteger(nextDay) || nextDay < 1 || nextDay > 31) {
                return;
              }
              onChange(
                buildCron({
                  frequency: "monthly",
                  hour: parsed.hour,
                  minute: parsed.minute,
                  weekDay: parsed.weekDay,
                  dayOfMonth: nextDay,
                  currentValue: value,
                }),
              );
            }}
            disabled={disabled}
          />
        </div>
      ) : parsed.frequency === "custom" ? (
        <div className="space-y-1 md:col-span-2">
          <Label>Cron expression</Label>
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            placeholder="*/15 * * * *"
            className="font-mono text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}
