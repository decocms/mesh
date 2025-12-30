import { useChat as useAiChat } from "@ai-sdk/react";
import { DecoChatAside } from "@deco/ui/components/deco-chat-aside.tsx";
import { DecoChatInputV2 } from "@deco/ui/components/deco-chat-input-v2.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import type { UIMessage } from "ai";
import type {
  PropsWithChildren,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import { Children, isValidElement, useRef, useState } from "react";
import { toast } from "sonner";
import { GatewaySelector } from "./gateway-selector";
import { MessageAssistant } from "./message-assistant.tsx";
import { MessageFooter, MessageList } from "./message-list.tsx";
import { MessageUser } from "./message-user.tsx";
import type {
  ModelChangePayload,
  SelectedModelState,
} from "./model-selector.tsx";
import { ModelSelector } from "./model-selector.tsx";
import { UsageStats } from "./usage-stats.tsx";
import { useFileDropUpload } from "@/web/components/file-drop-zone";
import { File06, Folder, X, Loading01 } from "@untitledui/icons";

export { useGateways } from "./gateway-selector";
export type { GatewayInfo } from "./gateway-selector";
export { useModels } from "./model-selector.tsx";
export type {
  ModelChangePayload,
  ModelInfo,
  ModelInfoWithConnection,
  SelectedModelState,
} from "./model-selector.tsx";

export type ChatMessage = UIMessage<Metadata>;

export type ChatStatus = ReturnType<
  typeof useAiChat<UIMessage<Metadata>>
>["status"];

function useChatAutoScroll({
  messageCount,
  sentinelRef,
}: {
  messageCount: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  const lastMessageCountRef = useRef(messageCount);
  const lastScrolledCountRef = useRef(0);

  if (
    messageCount > lastMessageCountRef.current &&
    lastScrolledCountRef.current !== messageCount
  ) {
    queueMicrotask(() => {
      sentinelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      lastScrolledCountRef.current = messageCount;
    });
  }

  lastMessageCountRef.current = messageCount;
}

function findChild<T>(
  children: ReactNode,
  type: (props: T) => ReactNode,
): ReactElement<T> | null {
  const arr = Children.toArray(children);
  for (const child of arr) {
    if (isValidElement(child) && child.type === type) {
      return child as ReactElement<T>;
    }
  }
  return null;
}

function filterChildren(children: ReactNode, excludedTypes: unknown[]) {
  return Children.toArray(children).filter((child) => {
    if (!isValidElement(child)) return true;
    return !excludedTypes.includes(child.type);
  });
}

function ChatRoot({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <DecoChatAside className={cn("h-full", className)}>
      {children}
    </DecoChatAside>
  );
}

function ChatHeader({ children }: PropsWithChildren) {
  const left = findChild(children, ChatHeaderLeft);
  const right = findChild(children, ChatHeaderRight);

  return (
    <DecoChatAside.Header>
      <div className="flex items-center gap-2">{left?.props.children}</div>
      <div className="flex items-center gap-1">{right?.props.children}</div>
    </DecoChatAside.Header>
  );
}

function ChatHeaderLeft({ children }: PropsWithChildren) {
  return <>{children}</>;
}

function ChatHeaderRight({ children }: PropsWithChildren) {
  return <>{children}</>;
}

function ChatMain({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <DecoChatAside.Content className={className}>
      {children}
    </DecoChatAside.Content>
  );
}

function ChatEmptyState({ children }: PropsWithChildren) {
  return (
    <div className="h-full w-full flex items-center justify-center max-w-2xl mx-auto">
      {children}
    </div>
  );
}

function ChatMessages({
  messages,
  status,
  minHeightOffset = 240,
}: {
  messages: ChatMessage[];
  status?: ChatStatus;
  minHeightOffset?: number;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useChatAutoScroll({ messageCount: messages.length, sentinelRef });

  return (
    <MessageList minHeightOffset={minHeightOffset}>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <MessageUser
            key={message.id}
            message={message as UIMessage<Metadata>}
          />
        ) : message.role === "assistant" ? (
          <MessageAssistant
            key={message.id}
            message={message as UIMessage<Metadata>}
            status={index === messages.length - 1 ? status : undefined}
          />
        ) : null,
      )}
      <MessageFooter>
        <div ref={sentinelRef} className="h-0" />
      </MessageFooter>
    </MessageList>
  );
}

function ChatFooter({ children }: PropsWithChildren) {
  return (
    <DecoChatAside.Footer className="max-w-2xl mx-auto w-full min-w-0">
      {children}
    </DecoChatAside.Footer>
  );
}

function ChatInputModelSelector(_props: {
  disabled?: boolean;
  selectedModel?: SelectedModelState;
  onModelChange: (model: ModelChangePayload) => void;
  className?: string;
}) {
  return null;
}

function ChatInputGatewaySelector(_props: {
  disabled?: boolean;
  selectedGatewayId?: string;
  onGatewayChange: (gatewayId: string) => void;
  className?: string;
}) {
  return null;
}

/** Uploaded file reference for chat context */
interface UploadedFileRef {
  id: string;
  name: string;
  path: string;
  connectionId: string;
  connectionTitle: string;
  status: "uploading" | "success" | "error";
  error?: string;
}

function ChatInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder,
  usageMessages,
  children,
}: PropsWithChildren<{
  onSubmit: (text: string) => Promise<void>;
  onStop: () => void;
  disabled: boolean;
  isStreaming: boolean;
  placeholder: string;
  usageMessages?: ChatMessage[];
}>) {
  const [input, setInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileRef[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // File storage upload hook
  const { uploadFiles, hasStorage, storageConnection } = useFileDropUpload();

  const modelSelector = findChild(children, ChatInputModelSelector);
  const gatewaySelector = findChild(children, ChatInputGatewaySelector);
  const rest = filterChildren(children, [
    ChatInputModelSelector,
    ChatInputGatewaySelector,
  ]);

  // Build message with file references
  const buildMessageWithFiles = (text: string): string => {
    if (uploadedFiles.length === 0) {
      return text;
    }

    const successfulFiles = uploadedFiles.filter((f) => f.status === "success");
    if (successfulFiles.length === 0) {
      return text;
    }

    // Add file references at the beginning of the message
    const fileRefs = successfulFiles
      .map((f) => `@file:${f.connectionTitle}:${f.path}`)
      .join(" ");

    return `${fileRefs}\n\n${text}`;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input?.trim() || isStreaming) {
      return;
    }
    const text = buildMessageWithFiles(input.trim());
    try {
      await onSubmit(text);
      setInput("");
      // Clear uploaded files after successful send
      setUploadedFiles([]);
    } catch (error) {
      console.error("Failed to send message:", error);
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      toast.error(message);
    }
  };

  // Handle file drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!hasStorage) {
      toast.error(
        "No file storage configured. Add a File Storage binding first.",
      );
      return;
    }

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;

    // Add files to state as uploading
    const newFiles: UploadedFileRef[] = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      path: f.name,
      connectionId: storageConnection?.id ?? "",
      connectionTitle: storageConnection?.title ?? "File Storage",
      status: "uploading" as const,
    }));
    setUploadedFiles((prev) => [...prev, ...newFiles]);

    // Upload each file
    for (const [i, file] of files.entries()) {
      const fileRef = newFiles[i];
      if (!fileRef) continue;

      try {
        await uploadFiles([file]);
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileRef.id ? { ...f, status: "success" as const } : f,
          ),
        );
        toast.success(`Uploaded ${file.name} to ${storageConnection?.title}`);
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileRef.id
              ? {
                  ...f,
                  status: "error" as const,
                  error:
                    error instanceof Error ? error.message : "Upload failed",
                }
              : f,
          ),
        );
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types.includes("Files") && hasStorage) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const leftActions = (
    <div className="flex items-center gap-2 min-w-0">
      {gatewaySelector ? (
        <div
          className={cn(
            "flex items-center gap-2 flex-wrap min-w-0",
            gatewaySelector.props.disabled && "pointer-events-none opacity-60",
          )}
        >
          <GatewaySelector
            selectedGatewayId={gatewaySelector.props.selectedGatewayId}
            onGatewayChange={gatewaySelector.props.onGatewayChange}
            placeholder="Gateway"
            variant="bordered"
            className={gatewaySelector.props.className}
          />
        </div>
      ) : null}

      {modelSelector ? (
        <div
          className={cn(
            "flex items-center gap-2 flex-wrap min-w-0",
            modelSelector.props.disabled && "pointer-events-none opacity-60",
          )}
        >
          <ModelSelector
            selectedModel={modelSelector.props.selectedModel}
            onModelChange={modelSelector.props.onModelChange}
            placeholder="Model"
            variant="borderless"
            className={modelSelector.props.className}
          />
        </div>
      ) : null}

      {rest}
      {usageMessages ? <UsageStats messages={usageMessages} /> : null}
    </div>
  );

  // File context content showing uploaded files
  const contextContent =
    uploadedFiles.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {uploadedFiles.map((file) => (
          <div
            key={file.id}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded-lg text-xs",
              file.status === "uploading" && "bg-muted text-muted-foreground",
              file.status === "success" && "bg-primary/10 text-primary",
              file.status === "error" && "bg-destructive/10 text-destructive",
            )}
          >
            {file.status === "uploading" ? (
              <Loading01 size={14} className="animate-spin" />
            ) : (
              <File06 size={14} />
            )}
            <span className="max-w-[150px] truncate">{file.name}</span>
            <span className="text-muted-foreground">
              @{file.connectionTitle}
            </span>
            <button
              type="button"
              onClick={() => removeFile(file.id)}
              className="hover:text-foreground transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-xl pointer-events-none">
          <div className="flex items-center gap-2 text-primary text-sm font-medium">
            <Folder size={20} />
            <span>Drop to upload to {storageConnection?.title}</span>
          </div>
        </div>
      )}

      <DecoChatInputV2
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={onStop}
        disabled={disabled}
        isStreaming={isStreaming}
        placeholder={hasStorage ? placeholder : placeholder}
        leftActions={leftActions}
        contextContent={contextContent}
      />
    </div>
  );
}

export const Chat = Object.assign(ChatRoot, {
  Header: Object.assign(ChatHeader, {
    Left: ChatHeaderLeft,
    Right: ChatHeaderRight,
  }),
  Main: ChatMain,
  Messages: ChatMessages,
  EmptyState: ChatEmptyState,
  Footer: ChatFooter,
  Input: Object.assign(ChatInput, {
    ModelSelector: ChatInputModelSelector,
    GatewaySelector: ChatInputGatewaySelector,
  }),
});
