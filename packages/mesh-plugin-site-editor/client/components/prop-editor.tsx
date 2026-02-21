import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { ChevronLeft, Link2 } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import { customWidgets } from "./rjsf/widgets";
import { customTemplates } from "./rjsf/templates";
import type { BlockInstance } from "../lib/page-api";
import type { BlockDefinition } from "@decocms/bindings";

interface PropEditorProps {
  block: BlockInstance;
  blockDef: BlockDefinition | undefined;
  onPropsChange: (props: Record<string, unknown>) => void;
  onBack: () => void;
  onBindLoader: (propName: string) => void;
}

export function PropEditor({
  block,
  blockDef,
  onPropsChange,
  onBack,
  onBindLoader,
}: PropEditorProps) {
  const schema = (blockDef?.propsSchema ?? {}) as RJSFSchema;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ChevronLeft size={14} />
        </Button>
        <span className="text-sm font-medium truncate">{block.blockType}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!blockDef ? (
          <p className="text-xs text-muted-foreground">
            Block definition not found for &quot;{block.blockType}&quot;
          </p>
        ) : (
          <Form
            schema={schema}
            validator={validator}
            formData={block.props}
            onChange={({ formData }) => {
              if (formData) onPropsChange(formData as Record<string, unknown>);
            }}
            widgets={customWidgets}
            templates={customTemplates}
            uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
          />
        )}
      </div>

      {/* Bind loader section */}
      {blockDef && (
        <div className="border-t px-3 py-2">
          <p className="text-xs text-muted-foreground mb-2">Loader binding</p>
          {block.loaderBinding ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground">
                {block.loaderBinding.loaderName} &rarr;{" "}
                {block.loaderBinding.prop}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => onBindLoader("")}
              >
                Change
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => onBindLoader("")}
            >
              <Link2 size={12} className="mr-1.5" />
              Bind loader
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
