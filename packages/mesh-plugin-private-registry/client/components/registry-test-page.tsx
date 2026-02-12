import { TestDashboard } from "./test-dashboard";
import { useState } from "react";

export default function RegistryTestPage() {
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);

  return (
    <div className="h-full overflow-auto px-4 md:px-6 py-4">
      <TestDashboard activeRunId={activeRunId} onRunChange={setActiveRunId} />
    </div>
  );
}
