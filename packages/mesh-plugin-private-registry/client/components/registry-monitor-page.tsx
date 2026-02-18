import { MonitorDashboard } from "./monitor-dashboard";
import { MonitorRunDetail } from "./monitor-run-detail";
import { MonitorRunHistory } from "./monitor-run-history";
import { useState } from "react";

export default function RegistryMonitorPage() {
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);

  return (
    <div className="h-full overflow-auto px-4 md:px-6 py-4 space-y-6">
      <MonitorDashboard
        activeRunId={activeRunId}
        onRunChange={setActiveRunId}
      />

      {activeRunId && <MonitorRunDetail runId={activeRunId} />}

      <MonitorRunHistory
        selectedRunId={activeRunId}
        onSelectRun={setActiveRunId}
      />
    </div>
  );
}
