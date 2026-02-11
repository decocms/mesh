import type { UserAskInput } from "@/api/routes/decopilot/built-in-tools";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Tabs, TabsContent } from "@deco/ui/components/tabs.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Edit02,
  MessageQuestionCircle,
  XClose,
} from "@untitledui/icons";
import { useEffect, useRef, useState } from "react";
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
// TextInput - text field question (styled like the choice rows)
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
            <div className="px-2">
              <div className="flex items-center gap-3 px-2 py-3 rounded-lg bg-accent/50">
                <span className="flex items-center justify-center size-6 rounded-md bg-muted shrink-0">
                  <Edit02 size={16} className="text-muted-foreground" />
                </span>
                <input
                  {...field}
                  type="text"
                  placeholder={placeholder || "Type your response..."}
                  disabled={disabled}
                  autoFocus
                  aria-label="Text response input"
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-foreground/25 text-foreground min-w-0"
                />
              </div>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ============================================================================
// ChoiceInput - numbered options with inline "Something else..." input
// ============================================================================

function ChoiceInput({
  control,
  name,
  disabled,
  options,
}: FieldInputProps & { options: string[] }) {
  const [isCustom, setIsCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<{ onChange: (v: string) => void } | null>(null);

  // Global keyboard shortcut: press 1-9 to select option
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (disabled) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      // Skip if user is typing in any input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= options.length && fieldRef.current) {
        e.preventDefault();
        fieldRef.current.onChange(options[num - 1]);
        setIsCustom(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [disabled, options]);

  if (options.length === 0) return null;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        fieldRef.current = field;
        const isCustomValue =
          isCustom || (!!field.value && !options.includes(field.value));

        return (
          <FormItem>
            <FormControl>
              <div
                className="flex flex-col px-2"
                role="group"
                aria-label="Choice options"
              >
                {options.map((option, index) => {
                  const isSelected = field.value === option;
                  return (
                    <button
                      key={`${index}-${option}`}
                      type="button"
                      onClick={() => {
                        field.onChange(option ?? "");
                        setIsCustom(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 px-2 py-3 rounded-lg text-left transition-colors w-full",
                        isSelected && "bg-accent/50",
                        !disabled && !isSelected && "hover:bg-accent/30",
                        disabled && "opacity-50 cursor-not-allowed",
                      )}
                      disabled={disabled}
                      aria-label={`Select ${option}`}
                    >
                      <span
                        className={cn(
                          "flex items-center justify-center size-6 rounded-md text-sm shrink-0",
                          isSelected
                            ? "bg-chart-1 text-white"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="text-sm text-foreground truncate">
                        {option}
                      </span>
                    </button>
                  );
                })}

                {/* "Something else..." — this IS the input */}
                <div
                  className={cn(
                    "flex items-center gap-3 px-2 py-3 rounded-lg transition-colors w-full cursor-text",
                    isCustomValue && "bg-accent/50",
                    !disabled && !isCustomValue && "hover:bg-accent/30",
                    disabled && "opacity-50 cursor-not-allowed",
                  )}
                  onClick={() => {
                    if (disabled) return;
                    setIsCustom(true);
                    // Clear value if it was a predefined option
                    if (options.includes(field.value)) {
                      field.onChange("");
                    }
                    // Focus the hidden input
                    setTimeout(() => customInputRef.current?.focus(), 0);
                  }}
                >
                  <span className="flex items-center justify-center size-6 rounded-md bg-muted shrink-0">
                    <Edit02 size={16} className="text-muted-foreground" />
                  </span>
                  {isCustomValue ? (
                    <input
                      ref={customInputRef}
                      type="text"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="Something else..."
                      disabled={disabled}
                      autoFocus
                      aria-label="Custom choice input"
                      className="flex-1 text-sm bg-transparent outline-none placeholder:text-foreground/25 text-foreground min-w-0"
                    />
                  ) : (
                    <span className="text-sm text-foreground/25">
                      Something else...
                    </span>
                  )}
                </div>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

// ============================================================================
// ConfirmInput - yes / no buttons
// ============================================================================

function ConfirmInput({ control, name, disabled }: FieldInputProps) {
  const confirmOptions = ["yes", "no"] as const;
  const fieldRef = useRef<{ onChange: (v: string) => void } | null>(null);

  // Global keyboard shortcut: 1=yes, 2=no
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (disabled) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1" && fieldRef.current) {
        e.preventDefault();
        fieldRef.current.onChange("yes");
      } else if (e.key === "2" && fieldRef.current) {
        e.preventDefault();
        fieldRef.current.onChange("no");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [disabled]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        fieldRef.current = field;

        return (
          <FormItem>
            <FormControl>
              <div
                className="flex gap-2 px-2"
                role="group"
                aria-label="Confirmation options"
              >
                {confirmOptions.map((value) => {
                  const isSelected = field.value === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => field.onChange(value)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors flex-1",
                        isSelected && "bg-accent/50",
                        !disabled && !isSelected && "hover:bg-accent/30",
                        disabled && "opacity-50 cursor-not-allowed",
                      )}
                      disabled={disabled}
                      aria-label={`Confirm ${value}`}
                    >
                      <span
                        className={cn(
                          "flex items-center justify-center size-6 rounded-md text-sm shrink-0",
                          isSelected
                            ? "bg-chart-1 text-white"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {value === "yes" ? 1 : 2}
                      </span>
                      <span className="text-sm text-foreground capitalize">
                        {value}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
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
// Pagination - "← 1 of 4 →" control
// ============================================================================

interface PaginationProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

function Pagination({
  current,
  total,
  onPrev,
  onNext,
  disabled,
}: PaginationProps) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled || current === 0}
        className={cn(
          "p-0.5 rounded transition-colors",
          current === 0 || disabled
            ? "opacity-30 cursor-not-allowed"
            : "hover:text-foreground cursor-pointer",
        )}
        aria-label="Previous question"
      >
        <ArrowLeft size={14} />
      </button>
      <span className="tabular-nums text-xs">
        {current + 1} of {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled || current === total - 1}
        className={cn(
          "p-0.5 rounded transition-colors",
          current === total - 1 || disabled
            ? "opacity-30 cursor-not-allowed"
            : "hover:text-foreground cursor-pointer",
        )}
        aria-label="Next question"
      >
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ============================================================================
// UserAskCard - the card chrome wrapping question content
// ============================================================================

interface UserAskCardProps {
  title: string;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight: React.ReactNode;
}

function UserAskCard({
  title,
  children,
  footerLeft,
  footerRight,
}: UserAskCardProps) {
  return (
    <div className="flex flex-col rounded-xl bg-background border border-border shadow-md w-[calc(100%-16px)] max-w-[584px] mx-auto mb-[-16px]">
      {/* Header */}
      <div className="flex items-center gap-2 p-4">
        <p className="flex-1 text-base font-medium text-foreground min-w-0">
          {title}
        </p>
        <button
          type="button"
          className="opacity-50 hover:opacity-100 transition-opacity shrink-0"
          aria-label="Dismiss"
        >
          <XClose size={16} />
        </button>
      </div>

      {/* Options / Content */}
      <div className="overflow-clip pb-4">{children}</div>

      {/* Footer with border-t */}
      <div className="border-t border-border px-3 py-3 pb-6">
        <div className="flex items-center justify-between">
          <div>{footerLeft}</div>
          <div className="flex items-center gap-2">{footerRight}</div>
        </div>
      </div>
    </div>
  );
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
  const currentAnswered = !!values[activeTab]?.response;
  const nextUnanswered =
    parts.find(
      (p) => !values[p.toolCallId]?.response && p.toolCallId !== activeTab,
    ) ?? parts.find((p) => !values[p.toolCallId]?.response);

  const showNext = parts.length > 1 && !allAnswered;
  const buttonLabel = showNext ? "Next" : "Submit";
  const currentIndex = parts.findIndex((p) => p.toolCallId === activeTab);

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

  const goToPrev = () => {
    if (currentIndex > 0) {
      setActiveTab(parts[currentIndex - 1].toolCallId);
    }
  };

  const goToNext = () => {
    if (currentIndex < parts.length - 1) {
      setActiveTab(parts[currentIndex + 1].toolCallId);
    }
  };

  const footerButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className="h-7"
      >
        Skip
      </Button>
      <Button
        type={showNext ? "button" : "submit"}
        size="sm"
        disabled={disabled || (showNext ? !currentAnswered : !allAnswered)}
        onClick={showNext ? handleButtonClick : undefined}
        className={cn(
          "h-7",
          disabled || (showNext ? !currentAnswered : !allAnswered)
            ? "opacity-50"
            : "",
        )}
      >
        {buttonLabel}
      </Button>
    </>
  );

  const pagination = (
    <Pagination
      current={currentIndex}
      total={parts.length}
      onPrev={goToPrev}
      onNext={goToNext}
      disabled={disabled}
    />
  );

  // Single question — no tabs needed
  if (parts.length === 1) {
    const part = parts[0];
    if (!part?.input) return null;

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} autoComplete="off">
          <UserAskCard title={part.input.prompt} footerRight={footerButtons}>
            <QuestionInput
              input={part.input as UserAskInput}
              control={form.control}
              name={`${part.toolCallId}.response`}
              disabled={disabled}
            />
          </UserAskCard>
        </form>
      </Form>
    );
  }

  // Multiple questions — tabbed layout with unified submit
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} autoComplete="off">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {parts.map((part) => (
            <TabsContent
              key={part.toolCallId}
              value={part.toolCallId}
              className="mt-0"
            >
              <UserAskCard
                title={part.input?.prompt ?? "Question"}
                footerLeft={pagination}
                footerRight={footerButtons}
              >
                <QuestionInput
                  input={part.input as UserAskInput}
                  control={form.control}
                  name={`${part.toolCallId}.response`}
                  disabled={disabled}
                />
              </UserAskCard>
            </TabsContent>
          ))}
        </Tabs>
      </form>
    </Form>
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
