import {
  memo,
  useRef,
  useId,
  useState,
  Component,
  type ReactNode,
} from "react";
import Editor, {
  loader,
  OnMount,
  type EditorProps,
} from "@monaco-editor/react";
import type { Plugin } from "prettier";
import { Spinner } from "@deco/ui/components/spinner.js";

// Error boundary to catch Monaco disposal errors and recover
class MonacoErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // Check if it's the specific Monaco disposal error
    if (error.message?.includes("InstantiationService has been disposed")) {
      return { hasError: true };
    }
    throw error;
  }

  override componentDidCatch(error: Error) {
    if (error.message?.includes("InstantiationService has been disposed")) {
      // Trigger recovery
      this.props.onError();
    }
  }

  override componentDidUpdate(prevProps: {
    children: ReactNode;
    onError: () => void;
  }) {
    // Reset error state when children change (new key)
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-[#1e1e1e] text-gray-400">
          <Spinner size="sm" />
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy load Prettier modules
let prettierCache: {
  format: (code: string, options: object) => Promise<string>;
  plugins: Plugin[];
} | null = null;

const loadPrettier = async () => {
  if (prettierCache) return prettierCache;

  const [prettierModule, tsPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/estree"),
  ]);

  prettierCache = {
    format: prettierModule.format,
    plugins: [tsPlugin.default, estreePlugin.default],
  };

  return prettierCache;
};

// Configure Monaco to load from CDN
loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs",
  },
});

// ============================================
// Static Constants (module-scoped for stability)
// ============================================

const PRETTIER_OPTIONS = {
  parser: "typescript",
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 80,
} as const;

const EDITOR_BASE_OPTIONS: EditorProps["options"] = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: "on",
  folding: true,
  bracketPairColorization: { enabled: true },
  formatOnPaste: true,
  formatOnType: true,
  suggestOnTriggerCharacters: true,
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  parameterHints: { enabled: true },
  inlineSuggest: { enabled: true },
  padding: { top: 12, bottom: 12 },
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
};

const LoadingPlaceholder = (
  <div className="flex items-center justify-center h-full w-full bg-[#1e1e1e] text-gray-400">
    <Spinner size="sm" />
  </div>
);

interface MonacoCodeEditorProps {
  code: string;
  onChange?: (value: string | undefined) => void;
  onSave?: (
    value: string,
    outputSchema: Record<string, unknown> | null,
  ) => void;
  readOnly?: boolean;
  height?: string | number;
  language?: "typescript" | "json";
}

export const MonacoCodeEditor = memo(function MonacoCodeEditor({
  code,
  onChange,
  onSave,
  readOnly = false,
  height = 300,
  language = "typescript",
}: MonacoCodeEditorProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const lastSavedVersionIdRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const monacoRef = useRef(null);

  // Store language in ref to avoid stale closures in editor callbacks
  const languageRef = useRef(language);
  languageRef.current = language;

  // Unique path so Monaco treats this as a TypeScript file
  const uniqueId = useId();
  const filePath =
    language === "typescript"
      ? `file:///workflow-${uniqueId.replace(/:/g, "-")}-${mountKey}.tsx`
      : undefined;

  // Handle Monaco error recovery by incrementing mount key
  const handleMonacoError = () => {
    editorRef.current = null;
    setMountKey((k) => k + 1);
  };

  // Compute options with readOnly merged in
  const editorOptions = readOnly
    ? { ...EDITOR_BASE_OPTIONS, readOnly: true }
    : EDITOR_BASE_OPTIONS;

  // Format function that uses refs to avoid stale closures
  const formatWithPrettier = async (editorInstance: Parameters<OnMount>[0]) => {
    const model = editorInstance.getModel();
    if (!model) {
      console.warn("No model found");
      return;
    }

    const currentCode = model.getValue();
    const currentLanguage = languageRef.current;

    // For JSON, use native JSON formatting
    if (currentLanguage === "json") {
      try {
        const parsed = JSON.parse(currentCode);
        const formatted = JSON.stringify(parsed, null, 2);
        if (formatted !== currentCode) {
          const fullRange = model.getFullModelRange();
          editorInstance.executeEdits("json-format", [
            { range: fullRange, text: formatted },
          ]);
        }
      } catch (err) {
        console.error("JSON formatting failed:", err);
      }
      return;
    }

    // For TypeScript, use Prettier
    try {
      const { format, plugins } = await loadPrettier();

      const formatted = await format(currentCode, {
        ...PRETTIER_OPTIONS,
        plugins,
      });

      // Only update if the formatted code is different
      if (formatted !== currentCode) {
        const fullRange = model.getFullModelRange();
        editorInstance.executeEdits("prettier", [
          { range: fullRange, text: formatted },
        ]);
      }
    } catch (err) {
      console.error("Prettier formatting failed:", err);
    }
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Configure TypeScript AFTER mount (beforeMount was causing value not to display)
    if (language === "typescript") {
      monacoRef.current = monaco;
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution:
          monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        allowJs: true,
        strict: false, // Less strict for workflow code
        noEmit: true,
        esModuleInterop: true,
        jsx: monaco.languages.typescript.JsxEmit.React,
        allowSyntheticDefaultImports: true,
      });

      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
    }

    const model = editor.getModel();
    if (model) {
      // Initialize lastSavedVersionId
      lastSavedVersionIdRef.current = model.getAlternativeVersionId();

      model.onDidChangeContent(() => {
        // Compute dirty state by comparing version IDs
        const currentVersionId = model.getAlternativeVersionId();
        setIsDirty(lastSavedVersionIdRef.current !== currentVersionId);
      });
    }

    // Add Ctrl+S / Cmd+S keybinding to format and save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      // Format the document first
      await formatWithPrettier(editor);
      const returnType = await getReturnType();

      // Then call onSave with the formatted value
      const value = editor.getValue();

      onSaveRef.current?.(value, returnType as Record<string, unknown> | null);

      // Record the saved version ID
      const model = editor.getModel();
      if (model) {
        lastSavedVersionIdRef.current = model.getAlternativeVersionId();
      }
      setIsDirty(false);
    });
  };

  const handleFormat = async () => {
    if (editorRef.current) {
      await formatWithPrettier(editorRef.current);
    }
  };

  const handleSave = async () => {
    if (editorRef.current) {
      await formatWithPrettier(editorRef.current);
      const value = editorRef.current.getValue();
      const returnType = await getReturnType();
      onSaveRef.current?.(value, returnType as Record<string, unknown> | null);

      // Record the saved version ID
      const model = editorRef.current.getModel();
      if (model) {
        lastSavedVersionIdRef.current = model.getAlternativeVersionId();
      }
      setIsDirty(false);
    }
  };

  // Convert TypeScript type string to JSON Schema
  function tsTypeToJsonSchema(typeStr: string): object {
    typeStr = typeStr.trim();

    // Handle primitives
    if (typeStr === "string") return { type: "string" };
    if (typeStr === "number") return { type: "number" };
    if (typeStr === "boolean") return { type: "boolean" };
    if (typeStr === "null") return { type: "null" };
    if (typeStr === "undefined") return { type: "null" };
    if (typeStr === "unknown" || typeStr === "any") return {};
    if (typeStr === "never") return { not: {} };

    // Handle arrays: T[] or Array<T>
    if (typeStr.endsWith("[]")) {
      const itemType = typeStr.slice(0, -2);
      return { type: "array", items: tsTypeToJsonSchema(itemType) };
    }
    const arrayMatch = typeStr.match(/^Array<(.+)>$/);
    if (arrayMatch && arrayMatch[1]) {
      return { type: "array", items: tsTypeToJsonSchema(arrayMatch[1]) };
    }

    // Handle Record<K, V>
    const recordMatch = typeStr.match(/^Record<(.+),\s*(.+)>$/);
    if (recordMatch && recordMatch[2]) {
      return {
        type: "object",
        additionalProperties: tsTypeToJsonSchema(recordMatch[2].trim()),
      };
    }

    // Handle union types: A | B | C
    if (typeStr.includes("|") && !typeStr.startsWith("{")) {
      const parts = splitUnion(typeStr);
      // Check if it's a string literal union
      const allStringLiterals = parts.every((p) => /^["']/.test(p.trim()));
      if (allStringLiterals) {
        return {
          type: "string",
          enum: parts.map((p) => p.trim().replace(/^["']|["']$/g, "")),
        };
      }
      return { anyOf: parts.map((p) => tsTypeToJsonSchema(p.trim())) };
    }

    // Handle string/number literals
    if (/^["'].*["']$/.test(typeStr)) {
      return { type: "string", const: typeStr.slice(1, -1) };
    }
    if (/^-?\d+(\.\d+)?$/.test(typeStr)) {
      return { type: "number", const: parseFloat(typeStr) };
    }

    // Handle object types: { prop: type; ... }
    if (typeStr.startsWith("{") && typeStr.endsWith("}")) {
      return parseObjectType(typeStr);
    }

    // Fallback for complex types
    return { description: `TypeScript type: ${typeStr}` };
  }

  // Split union types while respecting nested braces
  function splitUnion(typeStr: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";

    for (let i = 0; i < typeStr.length; i++) {
      const char = typeStr[i];
      if (char === "{" || char === "<" || char === "(") depth++;
      else if (char === "}" || char === ">" || char === ")") depth--;
      else if (char === "|" && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  // Parse object type: { prop: type; prop2?: type2; ... }
  function parseObjectType(typeStr: string): object {
    // Remove outer braces
    const inner = typeStr.slice(1, -1).trim();
    if (!inner) return { type: "object", properties: {} };

    const properties: Record<string, object> = {};
    const required: string[] = [];

    // Parse properties - handle nested objects by tracking brace depth
    let depth = 0;
    let currentProp = "";

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];
      if (char === "{" || char === "<" || char === "(" || char === "[") depth++;
      else if (char === "}" || char === ">" || char === ")" || char === "]")
        depth--;
      else if (char === ";" && depth === 0) {
        if (currentProp.trim()) {
          parseSingleProperty(currentProp.trim(), properties, required);
        }
        currentProp = "";
        continue;
      }
      currentProp += char;
    }
    // Handle last property (may not end with ;)
    if (currentProp.trim()) {
      parseSingleProperty(currentProp.trim(), properties, required);
    }

    const schema: Record<string, unknown> = {
      type: "object",
      properties,
    };
    if (required.length > 0) {
      schema.required = required;
    }
    return schema;
  }

  function parseSingleProperty(
    propStr: string,
    properties: Record<string, object>,
    required: string[],
  ) {
    // Match: propName?: type or propName: type
    const match = propStr.match(/^(\w+)(\?)?:\s*(.+)$/s);
    if (match) {
      const propName = match[1];
      const optional = match[2];
      const propType = match[3];
      if (propName && propType) {
        properties[propName] = tsTypeToJsonSchema(propType.trim());
        if (!optional) {
          required.push(propName);
        }
      }
    }
  }

  async function getReturnType() {
    if (!editorRef.current) return;

    const model = editorRef.current.getModel();
    const monaco = monacoRef.current;

    if (!model) {
      return null;
    }

    // Strategy: Append a helper type to the code and query its expanded type
    const originalCode = model.getValue();

    // Use a recursive Expand utility type to force TypeScript to inline all type references
    const helperCode = `
type __ExpandRecursively<T> = T extends (...args: infer A) => infer R
  ? (...args: __ExpandRecursively<A>) => __ExpandRecursively<R>
  : T extends object
  ? T extends infer O ? { [K in keyof O]: __ExpandRecursively<O[K]> } : never
  : T;
type __InferredOutput = __ExpandRecursively<Awaited<ReturnType<typeof __default>>>;
declare const __outputValue: __InferredOutput;
`;

    // Replace "export default" with a named function temporarily
    const modifiedCode =
      originalCode.replace(
        /export default (async )?function/,
        "export default $1function __default",
      ) + helperCode;

    // Set the modified code temporarily
    model.setValue(modifiedCode);

    // Find the __outputValue declaration to get its type
    const matches = model.findMatches(
      "__outputValue",
      false,
      false,
      false,
      null,
      false,
    );

    if (!matches || matches.length === 0) {
      model.setValue(originalCode);
      return null;
    }

    const match = matches[0];
    if (!match) {
      model.setValue(originalCode);
      return null;
    }

    const position = {
      lineNumber: match.range.startLineNumber,
      column: match.range.startColumn + 1,
    };

    try {
      const worker = await (
        monaco as any
      )?.languages?.typescript?.getTypeScriptWorker();
      if (!worker) {
        model.setValue(originalCode);
        return null;
      }
      const client = await worker(model.uri);

      // Wait for TypeScript to process the modified code
      await new Promise((resolve) => setTimeout(resolve, 100));

      const offset = model.getOffsetAt(position);
      const quickInfo = await client.getQuickInfoAtPosition(
        model.uri.toString(),
        offset,
      );

      // Restore original code
      model.setValue(originalCode);

      if (quickInfo) {
        const displayString = quickInfo.displayParts
          .map((part: { text: string }) => part.text)
          .join("");

        // Clean up the display string - remove "const __outputValue: " prefix
        const typeOnly = displayString.replace(/^const __outputValue:\s*/, "");

        // Convert to JSON Schema
        const jsonSchema = tsTypeToJsonSchema(typeOnly);

        return jsonSchema;
      } else {
        return null;
      }
    } catch (error) {
      model.setValue(originalCode);
      console.error("Error getting return type:", error);
      return null;
    }
  }

  return (
    <div className="rounded-lg border border-base-border h-full">
      <div className="flex justify-end gap-2 p-4 bg-[#1e1e1e] border-b border-[#3c3c3c]">
        <button
          onClick={handleFormat}
          disabled={!isDirty}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Format
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save (⌘S)
        </button>
      </div>
      <MonacoErrorBoundary onError={handleMonacoError}>
        <Editor
          key={mountKey}
          height={height}
          language={language}
          value={code}
          path={filePath}
          theme="vs-dark"
          onChange={onChange}
          onMount={handleEditorDidMount}
          loading={LoadingPlaceholder}
          options={editorOptions}
        />
      </MonacoErrorBoundary>
    </div>
  );
});
