import { useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { TestConfiguration } from "./test-configuration";
import { TestDashboard } from "./test-dashboard";
import { TestRunDetail } from "./test-run-detail";
import { TestRunHistory } from "./test-run-history";

export default function RegistryTestPage() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "history" | "config"
  >("dashboard");
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);

  return (
    <div className="h-full overflow-auto px-4 md:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Button
            size="sm"
            variant={activeTab === "dashboard" ? "default" : "outline"}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </Button>
          <Button
            size="sm"
            variant={activeTab === "history" ? "default" : "outline"}
            onClick={() => setActiveTab("history")}
          >
            Run History
          </Button>
          <Button
            size="sm"
            variant={activeTab === "config" ? "default" : "outline"}
            onClick={() => setActiveTab("config")}
          >
            Configuration
          </Button>
        </div>

        {activeTab === "dashboard" && (
          <TestDashboard
            activeRunId={activeRunId}
            onRunChange={setActiveRunId}
          />
        )}

        {activeTab === "history" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <TestRunHistory
              selectedRunId={activeRunId}
              onSelectRun={setActiveRunId}
            />
            <TestRunDetail runId={activeRunId} />
          </div>
        )}

        {activeTab === "config" && <TestConfiguration />}
      </div>
    </div>
  );
}
