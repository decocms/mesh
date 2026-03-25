import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";

export function useDecoMainOpen() {
  const [open, setOpenStorage] = useLocalStorage<boolean>(
    LOCALSTORAGE_KEYS.decoMainOpen(),
    (existing) => Boolean(existing ?? true),
  );

  return [open, setOpenStorage] as const;
}
