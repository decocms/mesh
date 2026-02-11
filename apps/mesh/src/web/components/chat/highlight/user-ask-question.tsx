import type { UserAskInput } from "@/api/routes/decopilot/built-in-tools";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, MessageQuestionCircle } from "@untitledui/icons";
import { useState } from "react";
import { type Control, type FieldValues, useForm } from "react-hook-form";
import type { UserAskToolPart } from "../types";
import { buildCombinedSchema } from "./user-ask-schemas";

// Type for the combined form values: { [toolCallId]: { response: string } }
type CombinedFormValues = Record<string, { response: string }>;

// Shared props for all question input field components
interface FieldInputProps {
  control: Control<FieldValues>;
  name: string;
  disabled: boolean;
}

// ============================================================================
// TextInput - text field question
// ============================================================================

function TextInput({
  control,
  name,
  disabled,
  placeholder,
}: FieldInputProps & { placeholder?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <Input
              {...field}
              placeholder={placeholder || "Type your response..."}
              disabled={disabled}
              autoFocus
              aria-label="Text response input"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ============================================================================
// ChoiceInput - single-select with optional custom "Other" option
// ============================================================================

function ChoiceInput({
  control,
  name,
  disabled,
  options,
}: FieldInputProps & { options: string[] }) {
  const [showCustomChoiceInput, setShowCustomChoiceInput] = useState(false);

  if (options.length === 0) return null;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <div className="flex flex-col gap-2">
              <div
                className="flex flex-col gap-2"
                role="group"
                aria-label="Choice options"
              >
                {options.map((option, index) => (
                  <Button
                    key={`${index}-${option}`}
                    type="button"
                    onClick={() => {
                      field.onChange(option ?? "");
                      setShowCustomChoiceInput(false);
                    }}
                    variant={field.value === option ? "default" : "outline"}
                    className="justify-start"
                    disabled={disabled}
                    aria-label={`Select ${option}`}
                  >
                    {option}
                  </Button>
                ))}
                <Button
                  type="button"
                  onClick={() => {
                    const opening = !showCustomChoiceInput;
                    setShowCustomChoiceInput(opening);
                    if (opening) {
                      field.onChange("");
                    }
                  }}
                  variant={
                    showCustomChoiceInput ||
                    (field.value && !options.includes(field.value))
                      ? "default"
                      : "outline"
                  }
                  className="justify-start"
                  disabled={disabled}
                  aria-label="Enter custom option"
                >
                  Other
                </Button>
              </div>
              {showCustomChoiceInput && (
                <Input
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Type your custom option..."
                  disabled={disabled}
                  autoFocus
                  aria-label="Custom choice input"
                />
              )}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ============================================================================
// ConfirmInput - yes / no buttons
// ============================================================================

function ConfirmInput({ control, name, disabled }: FieldInputProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Confirmation options"
            >
              <Button
                type="button"
                onClick={() => field.onChange("yes")}
                variant={field.value === "yes" ? "default" : "outline"}
                size="sm"
                disabled={disabled}
                aria-label="Confirm yes"
              >
                Yes
              </Button>
              <Button
                type="button"
                onClick={() => field.onChange("no")}
                variant={field.value === "no" ? "default" : "outline"}
                size="sm"
                disabled={disabled}
                aria-label="Confirm no"
              >
                No
              </Button>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ============================================================================
// QuestionInput - delegates to the correct field component by input type
// ============================================================================

interface QuestionInputProps {
  input: UserAskInput;
  control: Control<FieldValues>;
  name: string;
  disabled: boolean;
}

function QuestionInput({ input, control, name, disabled }: QuestionInputProps) {
  switch (input.type) {
    case "text":
      return (
        <TextInput
          control={control}
          name={name}
          disabled={disabled}
          placeholder={input.default}
        />
      );
    case "choice":
      return (
        <ChoiceInput
          control={control}
          name={name}
          disabled={disabled}
          options={input.options ?? []}
        />
      );
    case "confirm":
      return <ConfirmInput control={control} name={name} disabled={disabled} />;
    default:
      return null;
  }
}

// ============================================================================
// UserAskPrompt - unified form across all pending questions
// ============================================================================

interface UserAskPromptProps {
  parts: UserAskToolPart[];
  disabled: boolean;
  onSubmit: (part: UserAskToolPart, response: string) => void;
}

function UserAskPrompt({ parts, disabled, onSubmit }: UserAskPromptProps) {
  const [activeTab, setActiveTab] = useState(parts[0]?.toolCallId ?? "");

  const schema = buildCombinedSchema(
    parts.map((p) => ({
      toolCallId: p.toolCallId,
      input: p.input as UserAskInput,
    })),
  );

  const form = useForm<CombinedFormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: Object.fromEntries(
      parts.map((p) => [p.toolCallId, { response: "" }]),
    ),
  });

  const values = form.watch();
  const allAnswered = parts.every((p) => !!values[p.toolCallId]?.response);
  const nextUnanswered =
    parts.find(
      (p) => !values[p.toolCallId]?.response && p.toolCallId !== activeTab,
    ) ?? parts.find((p) => !values[p.toolCallId]?.response);

  const showNext = parts.length > 1 && !allAnswered;
  const buttonLabel = showNext ? "Next" : "Submit";

  const handleSubmit = (data: CombinedFormValues) => {
    for (const part of parts) {
      const response = data[part.toolCallId]?.response;
      if (response) {
        onSubmit(part, response);
      }
    }
  };

  const handleButtonClick = () => {
    if (showNext && nextUnanswered) {
      setActiveTab(nextUnanswered.toolCallId);
    }
  };

  // Single question — no tabs needed
  if (parts.length === 1) {
    const part = parts[0];
    if (!part?.input) return null;

    return (
      <div className="flex flex-col gap-3 p-4 border rounded-lg bg-background">
        <div className="flex items-center gap-2">
          <MessageQuestionCircle className="size-5 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {part.input.prompt}
          </span>
        </div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col gap-3"
            autoComplete="off"
          >
            <QuestionInput
              input={part.input as UserAskInput}
              control={form.control}
              name={`${part.toolCallId}.response`}
              disabled={disabled}
            />
            <Button
              type="submit"
              size="sm"
              disabled={disabled || !allAnswered}
              className="self-end"
            >
              Submit
            </Button>
          </form>
        </Form>
      </div>
    );
  }

  // Multiple questions — tabbed layout with unified submit
  return (
    <div className="flex flex-col gap-3 p-4 border rounded-lg bg-background">
      <div className="flex items-center gap-2">
        <MessageQuestionCircle className="size-5 text-primary" />
        <span className="text-sm font-medium text-foreground">
          Multiple questions
        </span>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-3"
          autoComplete="off"
        >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              {parts.map((part, index) => (
                <TabsTrigger key={part.toolCallId} value={part.toolCallId}>
                  Question {index + 1}
                  {values[part.toolCallId]?.response && (
                    <CheckCircle className="size-3 ml-1 text-primary" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {parts.map((part) => (
              <TabsContent key={part.toolCallId} value={part.toolCallId}>
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-medium text-foreground">
                    {part.input?.prompt}
                  </div>
                  <QuestionInput
                    input={part.input as UserAskInput}
                    control={form.control}
                    name={`${part.toolCallId}.response`}
                    disabled={disabled}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <Button
            type={showNext ? "button" : "submit"}
            size="sm"
            disabled={
              disabled ||
              (showNext ? !values[activeTab]?.response : !allAnswered)
            }
            onClick={showNext ? handleButtonClick : undefined}
            className="self-end"
          >
            {buttonLabel}
          </Button>
        </form>
      </Form>
    </div>
  );
}

// ============================================================================
// Loading UI for UserAskQuestion when streaming
// ============================================================================

function UserAskLoadingUI() {
  return (
    <div className="flex items-center gap-2 p-4 border border-dashed rounded-lg bg-accent/50 w-full">
      <MessageQuestionCircle className="size-5 text-muted-foreground shimmer" />
      <span className="text-sm text-muted-foreground shimmer">
        Preparing question...
      </span>
    </div>
  );
}

// ============================================================================
// UserAskQuestionHighlight - wrapper for ChatHighlight
// ============================================================================

export function UserAskQuestionHighlight({
  userAskParts,
  disabled,
  onSubmit,
}: {
  userAskParts: UserAskToolPart[];
  disabled: boolean;
  onSubmit: (part: UserAskToolPart, response: string) => void;
}) {
  const pendingParts = userAskParts.filter(
    (p) => p.state === "input-available",
  );
  const streamingParts = userAskParts.filter(
    (p) => p.state === "input-streaming",
  );

  if (streamingParts.length > 0) {
    return <UserAskLoadingUI />;
  }

  return (
    <UserAskPrompt
      parts={pendingParts}
      disabled={disabled}
      onSubmit={onSubmit}
    />
  );
}
