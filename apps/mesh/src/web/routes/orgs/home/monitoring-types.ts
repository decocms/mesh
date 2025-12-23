export interface MonitoringStats {
  totalCalls: number;
  errorRate: number;
  avgDurationMs: number;
  errorRatePercent: string;
}

export interface MonitoringLog {
  id: string;
  connectionId: string;
  connectionTitle: string;
  toolName: string;
  isError: boolean;
  errorMessage: string | null;
  durationMs: number;
  timestamp: string;
}

export interface MonitoringLogWithGateway extends MonitoringLog {
  gatewayId?: string | null;
}

export interface MonitoringLogsResponse {
  logs: MonitoringLog[];
  total: number;
}

export interface MonitoringLogsWithGatewayResponse {
  logs: MonitoringLogWithGateway[];
  total: number;
}

export function hasMonitoringActivity(stats?: MonitoringStats | null): boolean {
  return (stats?.totalCalls ?? 0) > 0;
}
