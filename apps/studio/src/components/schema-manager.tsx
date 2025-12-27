import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { FileJson, Trash2, ChevronRight, Database } from "lucide-react";
import type { JSONSchema7 } from "../types/json-schema";

interface Schema {
  id: string;
  name: string;
  schema: JSONSchema7;
}

interface SchemaManagerProps {
  schemas: Schema[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SchemaManager({ schemas, onSelect, onDelete }: SchemaManagerProps) {
  if (schemas.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5" />
            Saved Schemas
          </CardTitle>
          <CardDescription>
            Your extracted schemas will appear here
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileJson className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No schemas yet</p>
            <p className="text-sm mt-1">
              Extract types from TypeScript to create your first schema
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-5 w-5" />
          Saved Schemas ({schemas.length})
        </CardTitle>
        <CardDescription>
          Click a schema to start editing content
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <div className="space-y-2">
          {schemas.map((schema) => (
            <div
              key={schema.id}
              className="group flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              <button
                onClick={() => onSelect(schema.id)}
                className="flex-1 flex items-center gap-3 text-left"
              >
                <FileJson className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{schema.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {countProperties(schema.schema)} properties
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(schema.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function countProperties(schema: JSONSchema7): number {
  if (!schema.properties) return 0;
  return Object.keys(schema.properties).length;
}

