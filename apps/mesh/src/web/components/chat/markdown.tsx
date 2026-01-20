/* eslint-disable ban-memoization/ban-memoization */
import { marked } from "marked";
import React, {
  lazy,
  memo,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Button } from "@deco/ui/components/button.tsx";
import { Check, Copy01 } from "@untitledui/icons";
// @ts-ignore - correct
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism/index.js";

interface LazyHighlighterProps {
  language: string;
  content: string;
  fillHeight?: boolean;
}

function LazyHighlighter({
  language,
  content,
  fillHeight = false,
}: LazyHighlighterProps) {
  return (
    <SyntaxHighlighter
      language={language || "text"}
      style={oneDark}
      customStyle={{
        margin: 0,
        padding: "1rem",
        fontSize: "0.8rem",
        borderRadius: "0.5rem",
        background: "#282c34",
        position: "relative",
        overflowX: "hidden",
        overflowY: "visible",
        width: "100%",
        maxWidth: "100%",
        display: "block",
        wordBreak: "break-word",
        overflowWrap: "break-word",
        height: fillHeight ? "100%" : undefined,
        minHeight: fillHeight ? "100%" : undefined,
      }}
      codeTagProps={{
        className: "font-mono",
        style: {
          wordBreak: "break-word",
          overflowWrap: "break-word",
          whiteSpace: "pre-wrap",
        },
      }}
      wrapLongLines
    >
      {content}
    </SyntaxHighlighter>
  );
}

const LazyHighlighterComponent = lazy(() =>
  Promise.resolve({ default: LazyHighlighter }),
);

// Custom hook for copy functionality - simplified version
function useCopy() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return { handleCopy, copied };
}

function LazyHighlighterFallback() {
  const lines = [85, 70];

  return (
    <div
      className="p-4 font-mono text-sm"
      style={{
        background: "#2d2d2d",
        borderRadius: "0 0 0.5rem 0.5rem",
        overflow: "auto",
        minHeight: "4rem",
      }}
    >
      {lines.map((width, i) => (
        <div key={i} className="flex gap-2 items-center my-1">
          {i > 2 && i < 7 && (
            <div
              className="w-4 h-4 rounded-sm opacity-40 animate-pulse"
              style={{
                background: "rgba(128, 128, 128, 0.3)",
                animationDelay: `${i * 0.1}s`,
              }}
            />
          )}

          {i % 4 === 0 && (
            <div
              className="h-4 rounded animate-pulse"
              style={{
                width: "3rem",
                background: "rgba(128, 128, 128, 0.3)",
                animationDelay: `${i * 0.12}s`,
              }}
            />
          )}

          {i % 3 === 1 && (
            <div
              className="h-4 rounded animate-pulse"
              style={{
                width: "2.5rem",
                background: "rgba(128, 128, 128, 0.3)",
                animationDelay: `${i * 0.14}s`,
              }}
            />
          )}

          <div
            className="h-4 rounded animate-pulse"
            style={{
              width: `${width}%`,
              background: "rgba(255, 255, 255, 0.1)",
              animationDelay: `${i * 0.1}s`,
            }}
          />

          {i % 5 === 2 && (
            <div
              className="h-4 rounded animate-pulse"
              style={{
                width: "4rem",
                background: "rgba(128, 128, 128, 0.3)",
                animationDelay: `${i * 0.16}s`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Table(props: React.HTMLAttributes<HTMLTableElement>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const { handleCopy, copied } = useCopy();

  const tableToCsv = useCallback((table: HTMLTableElement | null): string => {
    if (!table) return "";
    const rows = Array.from(table.querySelectorAll("tr"));
    return rows
      .map((row) =>
        Array.from(row.querySelectorAll("th,td"))
          .map((cell) => {
            let text = cell.textContent || "";
            text = text.replace(/"/g, '""');
            if (text.search(/([",\n])/g) >= 0) {
              text = `"${text}"`;
            }
            return text;
          })
          .join(","),
      )
      .join("\n");
  }, []);

  const handleCopyCsv = useCallback(async () => {
    const csv = tableToCsv(tableRef.current);
    await handleCopy(csv);
  }, [tableToCsv, handleCopy]);

  return (
    <>
      <div className="flex justify-end items-center">
        <Button
          variant="ghost"
          onClick={handleCopyCsv}
          aria-label="Copy as CSV"
          className="text-muted-foreground hover:text-foreground h-6 text-[10px]"
          type="button"
        >
          Copy as CSV
          {copied ? <Check size={12} /> : <Copy01 size={12} />}
        </Button>
      </div>
      <div className="overflow-x-auto mb-4 rounded-lg border border-border">
        <table
          ref={tableRef}
          {...props}
          className="min-w-full border-collapse text-sm"
        >
          {props.children}
        </table>
      </div>
    </>
  );
}

// Memoize the plugins arrays to prevent re-creating them on every render
const remarkPluginsMemo = [remarkGfm];
const rehypePluginsMemo = [rehypeRaw];

// Memoize the components object to prevent re-creating it on every render
const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} className="leading-relaxed text-[15px] mb-2 last:mb-0" />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong {...props} className="font-bold" />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em {...props} className="italic" />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-dark hover:underline break-all font-medium"
    />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} className="list-disc ml-6 my-4 space-y-2" />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol {...props} className="list-decimal ml-6 my-4 space-y-2" />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li {...props} className="leading-relaxed text-[15px]" />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      {...props}
      className="px-1 py-0.5 bg-muted rounded text-[15px] font-mono break-all"
    />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      {...props}
      className="flex w-full min-w-0 my-4 bg-muted rounded overflow-hidden"
    >
      <code className="flex-1 min-w-0 p-4 text-[15px] font-mono whitespace-pre overflow-x-auto">
        {props.children}
      </code>
    </pre>
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <Table {...props} />
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead {...props} className="bg-muted">
      {props.children}
    </thead>
  ),
  tr: (props: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr
      {...props}
      className="even:bg-muted/50 border-b border-border last:border-0"
    />
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      {...props}
      className="px-4 py-2 text-left font-semibold text-muted-foreground border-b border-border"
    />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td {...props} className="px-4 py-2 border-b border-border" />
  ),
};

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => {
    return (
      <ReactMarkdown
        remarkPlugins={remarkPluginsMemo}
        rehypePlugins={rehypePluginsMemo}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => prevProps.content === nextProps.content,
);

function CodeBlock({
  language,
  content,
}: {
  language: string;
  content: string;
}) {
  const { handleCopy, copied } = useCopy();

  return (
    <div className="my-4 rounded-lg bg-muted overflow-hidden border border-border grid min-w-0">
      <div className="flex items-center justify-between p-1 pl-4 bg-muted border-b border-border">
        <span className="text-xs font-mono uppercase text-muted-foreground tracking-widest select-none">
          {language ? language : "text"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => handleCopy(content)}
          aria-label="Copy code"
          className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
        >
          {copied ? <Check size={14} /> : <Copy01 size={14} />}
        </Button>
      </div>

      <Suspense fallback={<LazyHighlighterFallback />}>
        <LazyHighlighterComponent language={language} content={content} />
      </Suspense>
    </div>
  );
}

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

interface MemoizedMarkdownProps {
  id: string;
  text: string;
}

export const MemoizedMarkdown = ({ id, text }: MemoizedMarkdownProps) => {
  const blocks = useMemo(() => marked.lexer(text), [text]);

  return blocks.map((block, index) => {
    if (block.type === "code") {
      return (
        <CodeBlock
          language={block.lang}
          content={block.text}
          key={`${id}-block_${index}`}
        />
      );
    }

    return (
      <MemoizedMarkdownBlock content={block.raw} key={`${id}-block_${index}`} />
    );
  });
};

MemoizedMarkdown.displayName = "MemoizedMarkdown";
