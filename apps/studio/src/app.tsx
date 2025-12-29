import { useState } from "react";
import { ContentEditor } from "./components/content-editor";
import { SchemaManager } from "./components/schema-manager";
import { TypeExtractor } from "./components/type-extractor";
import { JsonPreview } from "./components/json-preview";
import { Header } from "./components/header";
import { SavedLoadersPanel } from "./components/saved-loaders-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import type { JSONSchema7 } from "./types/json-schema";
import { loaderRegistry, type LoaderConfig } from "./lib/loader-registry";

export function App() {
  const [schema, setSchema] = useState<JSONSchema7 | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [savedSchemas, setSavedSchemas] = useState<
    Array<{ id: string; name: string; schema: JSONSchema7 }>
  >([]);

  const handleSchemaGenerated = (newSchema: JSONSchema7, name: string) => {
    const id = crypto.randomUUID();
    setSavedSchemas((prev) => [...prev, { id, name, schema: newSchema }]);
    setSchema(newSchema);
    setFormData({});
  };

  const handleSelectSchema = (id: string) => {
    const selected = savedSchemas.find((s) => s.id === id);
    if (selected) {
      setSchema(selected.schema);
      setFormData({});
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto py-6 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-10rem)]">
          {/* Left Panel - Schema & Editor */}
          <div className="flex flex-col gap-4 overflow-hidden">
            <Tabs defaultValue="editor" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="extract">Extract Types</TabsTrigger>
                <TabsTrigger value="loaders">Loaders</TabsTrigger>
                <TabsTrigger value="schemas">Schemas</TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="flex-1 overflow-auto mt-4">
                {schema ? (
                  <ContentEditor
                    schema={schema}
                    formData={formData}
                    onChange={setFormData}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center space-y-2">
                      <p className="text-lg font-medium">No schema selected</p>
                      <p className="text-sm">
                        Extract types from TypeScript or select a saved schema
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="extract" className="flex-1 overflow-auto mt-4">
                <TypeExtractor onSchemaGenerated={handleSchemaGenerated} />
              </TabsContent>

              <TabsContent value="loaders" className="flex-1 overflow-auto mt-4">
                <SavedLoadersPanel
                  onLoaderSelect={(loader) => {
                    // When a loader is selected, show its props schema for editing
                    const definition = loaderRegistry.getLoaderDefinition(loader.__resolveType);
                    if (definition) {
                      setSchema({
                        ...definition.schema,
                        title: loader.name,
                        description: `Configure ${loader.name} (${loader.id})`,
                      });
                      setFormData(loader.props as Record<string, unknown>);
                    }
                  }}
                />
              </TabsContent>

              <TabsContent value="schemas" className="flex-1 overflow-auto mt-4">
                <SchemaManager
                  schemas={savedSchemas}
                  onSelect={handleSelectSchema}
                  onDelete={(id) =>
                    setSavedSchemas((prev) => prev.filter((s) => s.id !== id))
                  }
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Panel - JSON Preview */}
          <div className="flex flex-col overflow-hidden">
            <JsonPreview data={formData} schema={schema} />
          </div>
        </div>
      </main>
    </div>
  );
}

