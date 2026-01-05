import { createContext, useState, type PropsWithChildren } from "react";

export interface ChatInputContextValue {
  inputValue: string;
  setInputValue: (value: string) => void;
}

export const ChatInputContext = createContext<ChatInputContextValue | null>(
  null,
);

export function ChatInputProvider({ children }: PropsWithChildren) {
  const [inputValue, setInputValue] = useState("");

  return (
    <ChatInputContext value={{ inputValue, setInputValue }}>
      {children}
    </ChatInputContext>
  );
}
