/**
 * Reports Content
 *
 * Root content component rendered inside the standard plugin layout.
 * Uses URL search params for reportId so report URLs are copyable.
 */

import { reportsRouter } from "../lib/router";
import ReportDetail from "./report-detail";
import ReportsList from "./reports-list";

export default function ReportsContent() {
  const { reportId } = reportsRouter.useSearch({ from: "/" });
  const navigate = reportsRouter.useNavigate();

  if (reportId) {
    return (
      <ReportDetail
        reportId={reportId}
        onBack={() => navigate({ to: "/", search: {} })}
      />
    );
  }

  return (
    <ReportsList
      onSelectReport={(id) => navigate({ to: "/", search: { reportId: id } })}
    />
  );
}
