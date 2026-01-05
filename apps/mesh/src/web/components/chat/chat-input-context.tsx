import { CornerUpLeft, X } from "@untitledui/icons";
import { createContext, use, type PropsWithChildren } from "react";
import {
  useInputValue,
  type InputController,
  type BranchContext,
} from "../../hooks/use-persisted-chat";

interface ChatInputContextValue {
  inputController: InputController;
  branchContext: BranchContext | null;
  clearBranchContext: () => void;
  onGoToOriginalMessage: () => void;
}

const ChatInputContext = createContext<ChatInputContextValue | null>(null);

export function useChatInputContext() {
  const ctx = use(ChatInputContext);
  if (!ctx) {
    throw new Error(
      "useChatInputContext must be used within ChatInputProvider",
    );
  }
  return ctx;
}

export function ChatInputProvider({
  children,
  inputController,
  branchContext,
  clearBranchContext,
  onGoToOriginalMessage,
}: PropsWithChildren<ChatInputContextValue>) {
  return (
    <ChatInputContext
      value={{
        inputController,
        branchContext,
        clearBranchContext,
        onGoToOriginalMessage,
      }}
    >
      {children}
    </ChatInputContext>
  );
}

/**
 * Branch preview banner - shows when editing a message from a branch.
 * Uses context internally, no props needed.
 */
export function BranchPreview() {
  const {
    branchContext,
    clearBranchContext,
    onGoToOriginalMessage,
    inputController,
  } = useChatInputContext();

  if (!branchContext) return null;

  return (
    <button
      type="button"
      onClick={onGoToOriginalMessage}
      className="flex items-start gap-2 px-2 py-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/50 text-sm hover:bg-muted transition-colors cursor-pointer text-left w-full"
      title="Click to view original message"
    >
      <CornerUpLeft
        size={14}
        className="text-muted-foreground mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">
          Editing message (click to view original):
        </div>
        <div className="text-muted-foreground/70 line-clamp-2">
          {branchContext.originalMessageText}
        </div>
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          clearBranchContext();
          inputController.setValue("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            clearBranchContext();
            inputController.setValue("");
          }
        }}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Cancel editing"
      >
        <X size={14} />
      </span>
    </button>
  );
}

/**
 * Hook to get controlled input value and handlers from context.
 * Only the component using this hook re-renders on keystroke.
 */
export function useChatInputState() {
  const { inputController, branchContext, clearBranchContext } =
    useChatInputContext();
  const [inputValue, setInputValue] = useInputValue(inputController);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleSubmit = async (
    text: string,
    onSubmit: (text: string) => Promise<void>,
  ) => {
    setInputValue("");
    await onSubmit(text);
  };

  return {
    inputValue,
    setInputValue,
    handleInputChange,
    handleSubmit,
    branchContext,
    clearBranchContext,
  };
}
