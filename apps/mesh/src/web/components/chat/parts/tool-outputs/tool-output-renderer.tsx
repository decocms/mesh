import { MonacoCodeEditor } from "@/web/components/details/workflow/components/monaco-editor";

interface ToolOutputRendererProps {
  output: unknown;
}

export function ToolOutputRenderer({ output }: ToolOutputRendererProps) {
  const stringifiedOutput = JSON.stringify(output, null, 2);
  const isLargeOutput = stringifiedOutput.length > 2000;
  const outputContent = isLargeOutput
    ? stringifiedOutput.slice(0, 2000) + "...[TRUNCATED]"
    : stringifiedOutput;

  return (
    <div className="h-full">
      <MonacoCodeEditor
        code={outputContent}
        language="json"
        height="100%"
        readOnly={true}
      />
    </div>
  );
}
