import { cn } from "@deco/ui/lib/utils.ts";
import { Input } from "@deco/ui/components/input.tsx";
import { SearchMd, Loading01 } from "@untitledui/icons";

interface CollectionSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  isSearching?: boolean;
}

export function CollectionSearch({
  value,
  onChange,
  placeholder = "Search...",
  onKeyDown,
  className,
  isSearching,
}: CollectionSearchProps) {
  return (
    <div
      className={cn("shrink-0 w-full border-b border-border h-12", className)}
    >
      <label className="flex items-center gap-2.5 h-12 px-4 cursor-text">
        {isSearching ? (
          <Loading01
            size={16}
            className="animate-spin text-muted-foreground shrink-0"
          />
        ) : (
          <SearchMd size={16} className="text-muted-foreground shrink-0" />
        )}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1 border-0 shadow-none focus-visible:ring-0 px-0 h-full text-sm placeholder:text-muted-foreground/50 bg-transparent"
        />
      </label>
    </div>
  );
}
