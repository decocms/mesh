import { JsonSyntaxHighlighter } from "@/web/components/json-syntax-highlighter.tsx";

interface ToolOutputRendererProps {
  output: unknown;
}

export function ToolOutputRenderer({ output }: ToolOutputRendererProps) {
  const stringifiedOutput = JSON.stringify(output, null, 2);
  const isLargeOutput = stringifiedOutput.length > 2000;
  const outputContent = isLargeOutput
    ? stringifiedOutput.slice(0, 2000) + "...[TRUNCATED]"
    : stringifiedOutput;

  return <JsonSyntaxHighlighter jsonString={outputContent} padding="0" />;
}
