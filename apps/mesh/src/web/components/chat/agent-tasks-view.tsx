/**
 * AgentTasksView
 *
 * Shown in the chat panel when agents are hired and no specific task thread is open.
 * Displays active agent tasks as clickable cards — click to open the task thread.
 */

import { AlertCircle, BarChart10, File06, Loading01 } from "@untitledui/icons";
import { Badge } from "@deco/ui/components/badge.tsx";

interface TaskCardConfig {
  icon: React.ReactNode;
  iconBg: string;
  agentName: string;
  taskTitle: string;
  status: "in_progress" | "requires_action";
}

const BLOG_TASK_CONFIG: TaskCardConfig = {
  icon: <File06 size={15} />,
  iconBg: "bg-violet-100 text-violet-600",
  agentName: "Blog Post Generator",
  taskTitle: 'Write: "Best smart home accessories under $50"',
  status: "requires_action",
};

const PERFORMANCE_TASK_CONFIG: TaskCardConfig = {
  icon: <BarChart10 size={15} />,
  iconBg: "bg-orange-100 text-orange-600",
  agentName: "Performance Monitor",
  taskTitle: "Performance review of farmrio.com.br",
  status: "in_progress",
};

function TaskStatusBadge({ status }: { status: TaskCardConfig["status"] }) {
  if (status === "in_progress") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] h-5">
        <Loading01 size={9} className="animate-spin" />
        Running
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 text-[10px] h-5 text-blue-600 border-blue-600/40"
    >
      <AlertCircle size={9} />
      Waiting for input
    </Badge>
  );
}

function TaskCard({
  config,
  onClick,
}: {
  config: TaskCardConfig;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left hover:bg-muted/30 transition-colors"
    >
      <div
        className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${config.iconBg}`}
      >
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground">{config.agentName}</p>
        <p className="text-sm font-medium text-foreground mt-0.5 leading-snug line-clamp-2">
          {config.taskTitle}
        </p>
        <div className="mt-1.5">
          <TaskStatusBadge status={config.status} />
        </div>
      </div>
    </button>
  );
}

export function AgentTasksView({
  blogHired,
  performanceHired,
  onBlogClick,
  onPerformanceClick,
}: {
  blogHired: boolean;
  performanceHired: boolean;
  onBlogClick: () => void;
  onPerformanceClick: () => void;
}) {
  const tasks: { config: TaskCardConfig; onClick: () => void }[] = [
    ...(blogHired ? [{ config: BLOG_TASK_CONFIG, onClick: onBlogClick }] : []),
    ...(performanceHired
      ? [{ config: PERFORMANCE_TASK_CONFIG, onClick: onPerformanceClick }]
      : []),
  ];

  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 py-6 px-4 w-full">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Agent Activity
      </p>
      <div className="flex flex-col gap-2">
        {tasks.map(({ config, onClick }, i) => (
          <TaskCard key={i} config={config} onClick={onClick} />
        ))}
      </div>
    </div>
  );
}
