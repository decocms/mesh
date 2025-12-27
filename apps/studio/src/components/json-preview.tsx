import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Copy, Check, Code, FileJson } from "lucide-react";
import { toast } from "sonner";
import type { JSONSchema7 } from "../types/json-schema";

interface JsonPreviewProps {
  data: Record<string, unknown>;
  schema: JSONSchema7 | null;
}

export function JsonPreview({ data, schema }: JsonPreviewProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);
  const schemaString = schema ? JSON.stringify(schema, null, 2) : "";

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Output Preview
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <Tabs defaultValue="json" className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <TabsList>
              <TabsTrigger value="json" className="gap-2">
                <FileJson className="h-4 w-4" />
                Content JSON
              </TabsTrigger>
              <TabsTrigger value="schema" className="gap-2">
                <Code className="h-4 w-4" />
                Schema
              </TabsTrigger>
            </TabsList>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(jsonString)}
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <TabsContent value="json" className="flex-1 min-h-0 mt-0">
            <div className="h-full rounded-md border border-border overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="json"
                value={jsonString}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  tabSize: 2,
                  automaticLayout: true,
                  folding: true,
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="schema" className="flex-1 min-h-0 mt-0">
            <div className="h-full rounded-md border border-border overflow-hidden">
              {schema ? (
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  value={schemaString}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    tabSize: 2,
                    automaticLayout: true,
                    folding: true,
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No schema selected
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

