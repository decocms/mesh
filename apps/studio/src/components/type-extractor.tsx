import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Sparkles, Loader2, FileCode } from "lucide-react";
import { toast } from "sonner";
import type { JSONSchema7 } from "../types/json-schema";
import { extractSchemaFromTypeScript } from "../lib/schema-extractor";

interface TypeExtractorProps {
  onSchemaGenerated: (schema: JSONSchema7, name: string) => void;
}

const EXAMPLE_CODE = `// Example: Product configuration type
export interface ProductConfig {
  /** The product title displayed to users */
  title: string;
  
  /** Product description (supports markdown) */
  description: string;
  
  /** Price in cents */
  price: number;
  
  /** Whether the product is featured */
  featured?: boolean;
  
  /** Product category */
  category: "electronics" | "clothing" | "home" | "sports";
  
  /** Product images */
  images: Array<{
    url: string;
    alt: string;
  }>;
  
  /** SEO metadata */
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
  };
}`;

export function TypeExtractor({ onSchemaGenerated }: TypeExtractorProps) {
  const [code, setCode] = useState(EXAMPLE_CODE);
  const [typeName, setTypeName] = useState("ProductConfig");
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    if (!code.trim()) {
      toast.error("Please enter some TypeScript code");
      return;
    }

    if (!typeName.trim()) {
      toast.error("Please enter a type name");
      return;
    }

    setIsExtracting(true);

    try {
      const schema = await extractSchemaFromTypeScript(code, typeName);
      onSchemaGenerated(schema, typeName);
      toast.success(`Schema generated for ${typeName}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to extract schema"
      );
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCode className="h-5 w-5" />
          Extract Types from TypeScript
        </CardTitle>
        <CardDescription>
          Paste your TypeScript types and we'll generate a JSON Schema for rich editing
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Label htmlFor="typeName">Type/Interface Name</Label>
            <Input
              id="typeName"
              placeholder="e.g., ProductConfig"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
            />
          </div>
          <Button
            onClick={handleExtract}
            disabled={isExtracting}
            className="gap-2"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Schema
              </>
            )}
          </Button>
        </div>

        <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="typescript"
            value={code}
            onChange={(value) => setCode(value ?? "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

