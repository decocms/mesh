import type { ConnectionCreateData } from "@/tools/connection/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";

interface Registry {
  id: string;
  name: string;
  icon?: string;
}

interface StoreRegistrySelectProps {
  registries: Registry[];
  value: string;
  onValueChange: (value: string) => void;
  onAddWellKnown: (registry: ConnectionCreateData) => void;
  wellKnownRegistries: ConnectionCreateData[];
  placeholder?: string;
}

export function StoreRegistrySelect({
  registries,
  value,
  onValueChange,
  onAddWellKnown,
  wellKnownRegistries,
  placeholder = "Select a registry...",
}: StoreRegistrySelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[200px] h-8!">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {registries.map((registry) => (
          <SelectItem
            className="cursor-pointer"
            key={registry.id ?? registry.name}
            value={registry.id ?? registry.name}
          >
            <div className="flex items-center gap-2">
              {registry.icon ? (
                <img
                  src={registry.icon}
                  alt={registry.name}
                  className="w-4 h-4 rounded"
                />
              ) : (
                <div className="w-4 h-4 rounded from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {registry.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span>{registry.name}</span>
            </div>
          </SelectItem>
        ))}
        {wellKnownRegistries.length > 0 && (
          <div className="border-t border-border pt-1">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Other known registries
            </p>
            {wellKnownRegistries.map((registry) => (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddWellKnown(registry);
                }}
                key={registry.id ?? registry.title}
                className="relative flex w-full cursor-pointer items-center gap-2 rounded-xl py-1.5 pr-8 pl-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
              >
                <div className="flex items-center gap-2">
                  {registry.icon ? (
                    <img
                      src={registry.icon}
                      alt={registry.title}
                      className="w-4 h-4 rounded"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                      {registry.title.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1">{registry.title}</span>
                </div>
                <span className="absolute right-2 flex size-3.5 items-center justify-center text-muted-foreground">
                  <Icon name="add" size={16} />
                </span>
              </button>
            ))}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
