import { TestDashboard } from "./test-dashboard";
import { TestRunDetail } from "./test-run-detail";
import { TestRunHistory } from "./test-run-history";
import { useState } from "react";

export default function RegistryTestPage() {
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);

  return (
    <div className="h-full overflow-auto px-4 md:px-6 py-4 space-y-6">
      <TestDashboard activeRunId={activeRunId} onRunChange={setActiveRunId} />

      {activeRunId && <TestRunDetail runId={activeRunId} />}

      <TestRunHistory
        selectedRunId={activeRunId}
        onSelectRun={setActiveRunId}
      />
    </div>
  );
}
