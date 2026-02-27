import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@deco/ui/components/chart.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Coins01, Plus } from "@untitledui/icons";

// -- Types --

interface KeyUsage {
  total: number;
  daily: number;
  weekly: number;
  monthly: number;
}

interface BillingInfo {
  credit: number;
  usage: KeyUsage;
}

interface UsageDataPoint {
  date: string;
  amount: number;
}

// -- Mock data --

const MOCK_BILLING: BillingInfo = {
  credit: 357.7,
  usage: {
    total: 892.3,
    daily: 12.4,
    weekly: 48.7,
    monthly: 142.3,
  },
};

function generateMockChartData(period: ChartPeriod): UsageDataPoint[] {
  const data: UsageDataPoint[] = [];
  const now = new Date();

  if (period === "day") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      data.push({
        date: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        amount: +(Math.random() * 15 + 2).toFixed(2),
      });
    }
  } else if (period === "week") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      data.push({
        date: `W${52 - i}`,
        amount: +(Math.random() * 80 + 20).toFixed(2),
      });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      data.push({
        date: d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        amount: +(Math.random() * 200 + 50).toFixed(2),
      });
    }
  }

  return data;
}

// -- Helpers --

function formatUSD(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// -- Components --

function CreditCard({
  credit,
  onAddCredit,
}: {
  credit: number;
  onAddCredit: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/30 p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
            Available Credit
          </p>
          <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">
            {formatUSD(credit)}
          </p>
        </div>
        <Button onClick={onAddCredit} className="gap-2 px-5">
          <Plus size={16} />
          Add Credit
        </Button>
      </div>
    </div>
  );
}

type ChartPeriod = "day" | "week" | "month";

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

const PERIOD_USAGE_KEY: Record<ChartPeriod, keyof KeyUsage> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
};

const chartConfig = {
  amount: {
    label: "Spend",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function UsageSection({ usage }: { usage: KeyUsage }) {
  const [period, setPeriod] = useState<ChartPeriod>("day");
  const data = generateMockChartData(period);
  const periodTotal = usage[PERIOD_USAGE_KEY[period]];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
            Usage
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums text-foreground tracking-tight">
              {formatUSD(periodTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {period === "day"
                ? "today"
                : period === "week"
                  ? "this week"
                  : "this month"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatUSD(usage.total)} all-time
          </p>
        </div>
        <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5">
          {(Object.keys(PERIOD_LABELS) as ChartPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-sm transition-colors",
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="fillAmount" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-amount)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="var(--color-amount)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            fontSize={11}
            tickFormatter={(v: number) => `$${v}`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatUSD(value as number)}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="var(--color-amount)"
            fill="url(#fillAmount)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

// -- Empty / Loading states --

function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64 mt-1.5" />
      </div>
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-[260px] rounded-lg" />
    </div>
  );
}

function BillingEmpty() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Billing</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor usage and manage credits for your organization.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-lg border border-dashed border-border">
        <div className="flex items-center justify-center size-10 rounded-full bg-muted">
          <Coins01 size={20} className="text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            No AI Gateway configured
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[300px]">
            Connect an OpenRouter API key to start tracking usage and managing
            credits.
          </p>
        </div>
      </div>
    </div>
  );
}

// -- Main Page --

export function OrgBillingPage() {
  // TODO: Replace with real API call
  const isLoading = false;
  const billing: BillingInfo | null = MOCK_BILLING;

  if (isLoading) return <BillingSkeleton />;
  if (!billing) return <BillingEmpty />;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Billing</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor usage and manage credits for your organization.
        </p>
      </div>

      {/* Credit balance */}
      <CreditCard
        credit={billing.credit}
        onAddCredit={() => {
          // TODO: open add credit flow
          console.log("Add credit");
        }}
      />

      {/* Usage + chart */}
      <UsageSection usage={billing.usage} />
    </div>
  );
}
