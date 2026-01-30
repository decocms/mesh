import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";

export function useDecoChatOpen() {
  const [open, setOpenStorage] = useLocalStorage<boolean>(
    LOCALSTORAGE_KEYS.decoChatOpen(),
    (existing) => Boolean(existing ?? true),
  );

  return [open, setOpenStorage] as const;
}
