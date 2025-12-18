export interface MonitoringStats {
  totalCalls: number;
  errorRate: number;
  avgDurationMs: number;
  errorRatePercent: string;
}

export function hasMonitoringActivity(stats?: MonitoringStats | null): boolean {
  return (stats?.totalCalls ?? 0) > 0;
}
