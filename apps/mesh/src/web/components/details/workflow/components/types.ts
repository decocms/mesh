import {
  CodeAction,
  Step,
  ToolCallAction,
  WaitForSignalAction,
} from "@decocms/bindings/workflow";

export type ToolStep = Step & { action: ToolCallAction };
export type CodeStep = Step & { action: CodeAction };
export type StepWithAction = Step & {
  action: ToolCallAction | CodeAction | WaitForSignalAction;
};

export type ExecutionStatus = "success" | "running" | "error" | "enqueued";
