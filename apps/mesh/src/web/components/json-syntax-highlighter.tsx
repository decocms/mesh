import type { SyntaxHighlighterProps } from "react-syntax-highlighter";
// @ts-ignore - style module path
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism/index.js";
import { lazy, Suspense } from "react";

// ============================================================================
// Lazy Syntax Highlighter
// ============================================================================

const LazySyntaxHighlighter = lazy(() =>
  // @ts-ignore - prism-light.js has no types but is valid
  import("react-syntax-highlighter/dist/esm/prism-light.js").then(
    async (mod) => {
      // Register only JSON language (much smaller bundle)
      const json = await import(
        // @ts-ignore - language module has no types
        "react-syntax-highlighter/dist/esm/languages/prism/json.js"
      );
      mod.default.registerLanguage("json", json.default);
      return {
        default: mod.default as React.ComponentType<SyntaxHighlighterProps>,
      };
    },
  ),
);

const SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS = {
  className: "font-mono",
  style: {
    wordBreak: "break-word",
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
} as const;

// ============================================================================
// JSON Syntax Highlighter Component
// ============================================================================

interface JsonSyntaxHighlighterProps {
  jsonString: string;
  padding?: string;
  background?: string;
}

function JsonFallback({
  jsonString,
  padding = "1rem",
}: {
  jsonString: string;
  padding?: string;
}) {
  return (
    <pre
      className="font-mono text-xs whitespace-pre-wrap break-words m-0 h-full text-foreground/80 bg-transparent"
      style={{ padding }}
    >
      {jsonString}
    </pre>
  );
}

export function JsonSyntaxHighlighter({
  jsonString,
  padding = "1rem",
  background = "transparent",
}: JsonSyntaxHighlighterProps) {
  const customStyle = {
    margin: 0,
    padding,
    fontSize: "0.75rem",
    height: "100%",
    background,
  } as const;

  return (
    <Suspense
      fallback={<JsonFallback jsonString={jsonString} padding={padding} />}
    >
      <LazySyntaxHighlighter
        language="json"
        style={oneLight}
        customStyle={customStyle}
        codeTagProps={SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
        wrapLongLines
      >
        {jsonString}
      </LazySyntaxHighlighter>
    </Suspense>
  );
}
