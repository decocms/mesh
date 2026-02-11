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
import { MessageQuestionCircle } from "@untitledui/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { UserAskInput } from "@/api/routes/decopilot/built-in-tools";
import type { ChatStatus, UserAskToolPart } from "../types";
import { getUserAskSchema } from "./user-ask-schemas";
import type { UserAskResponse } from "./user-ask-schemas";

// ============================================================================
// UserAskQuestionPart - placeholder or loading for assistant message
// ============================================================================

export function UserAskQuestionPart({ part }: { part: UserAskToolPart }) {
  if (part.state === "input-streaming") {
    return (
      <div className="flex items-center gap-2 p-3 border border-dashed rounded-lg bg-accent/50 text-sm text-muted-foreground">
        <MessageQuestionCircle className="size-4 shimmer" />
        <span className="shimmer">Preparing question...</span>
      </div>
    );
  }
  if (part.state === "input-available") {
    return (
      <div className="flex items-center gap-2 p-3 border border-dashed rounded-lg bg-accent/10 text-sm text-muted-foreground">
        <MessageQuestionCircle className="size-4" />
        <span>Answer below in the input area</span>
      </div>
    );
  }
  return null;
}

// ============================================================================
// SingleQuestionForm - form per question with react-hook-form
// ============================================================================

interface SingleQuestionFormProps {
  part: UserAskToolPart;
  disabled: boolean;
  onSubmit: (part: UserAskToolPart, response: string) => void;
}

function SingleQuestionForm({
  part,
  disabled,
  onSubmit,
}: SingleQuestionFormProps) {
  const { input } = part;
  const [showCustomChoiceInput, setShowCustomChoiceInput] = useState(false);

  if (!input?.prompt || !input?.type) return null;

  const schema = getUserAskSchema(input as UserAskInput);
  const form = useForm<UserAskResponse>({
    resolver: zodResolver(schema),
    defaultValues: { response: "" },
  });

  const handleSubmit = (data: UserAskResponse) => {
    onSubmit(part, data.response);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-3"
        autoComplete="off"
      >
        {input.type === "text" && (
          <FormField
            control={form.control}
            name="response"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={input.default || "Type your response..."}
                    disabled={disabled}
                    autoFocus
                    aria-label="Text response input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {input.type === "choice" &&
          (() => {
            const options = input.options ?? [];
            if (options.length === 0) return null;
            return (
              <FormField
                control={form.control}
                name="response"
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
                              variant={
                                field.value === option ? "default" : "outline"
                              }
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
                              setShowCustomChoiceInput(!showCustomChoiceInput);
                              if (!showCustomChoiceInput && field.value) {
                                field.onChange(field.value);
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
          })()}

        {input.type === "confirm" && (
          <FormField
            control={form.control}
            name="response"
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
        )}

        <Button
          type="submit"
          size="sm"
          disabled={disabled || !form.watch("response")}
          className="self-end"
        >
          Submit
        </Button>
      </form>
    </Form>
  );
}

// ============================================================================
// UserAskPrompt - full prompt UI
// ============================================================================

interface UserAskPromptProps {
  parts: UserAskToolPart[];
  status: ChatStatus;
  onSubmit: (part: UserAskToolPart, response: string) => void;
}

function UserAskPrompt({ parts, status, onSubmit }: UserAskPromptProps) {
  const [activeTab, setActiveTab] = useState(parts[0]?.toolCallId ?? "");
  const isDisabled = status === "streaming" || status === "submitted";

  if (parts.length === 1) {
    const part = parts[0];
    if (!part) return null;
    const { state, input, output } = part;

    if (state === "input-streaming") {
      return (
        <div className="flex items-center gap-2 p-4 border rounded-lg bg-accent/50">
          <MessageQuestionCircle className="size-5 text-muted-foreground shimmer" />
          <span className="text-sm text-muted-foreground shimmer">
            Preparing question...
          </span>
        </div>
      );
    }

    if (state === "output-available" && output) {
      return (
        <div className="flex flex-col gap-2 p-4 border rounded-lg bg-accent/10">
          <div className="flex items-center gap-2">
            <MessageQuestionCircle className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {input?.prompt}
            </span>
          </div>
          <div className="pl-7 text-sm text-muted-foreground">
            Response: <span className="font-medium">{output.response}</span>
          </div>
        </div>
      );
    }

    if (!input) return null;

    return (
      <div className="flex flex-col gap-3 p-4 border rounded-lg bg-background">
        <div className="flex items-center gap-2">
          <MessageQuestionCircle className="size-5 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {input.prompt}
          </span>
        </div>
        <SingleQuestionForm
          part={part}
          disabled={isDisabled}
          onSubmit={onSubmit}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 border rounded-lg bg-background">
      <div className="flex items-center gap-2">
        <MessageQuestionCircle className="size-5 text-primary" />
        <span className="text-sm font-medium text-foreground">
          Multiple questions
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {parts.map((part, index) => (
            <TabsTrigger key={part.toolCallId} value={part.toolCallId}>
              Question {index + 1}
            </TabsTrigger>
          ))}
        </TabsList>

        {parts.map((part) => (
          <TabsContent key={part.toolCallId} value={part.toolCallId}>
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium text-foreground">
                {part.input?.prompt}
              </div>
              <SingleQuestionForm
                part={part}
                disabled={isDisabled}
                onSubmit={onSubmit}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
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
  status,
  onSubmit,
}: {
  userAskParts: UserAskToolPart[];
  status: ChatStatus;
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
    <UserAskPrompt parts={pendingParts} status={status} onSubmit={onSubmit} />
  );
}
