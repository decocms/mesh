/**
 * File Storage Connection Select
 *
 * Dropdown to select which file storage connection to use.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";

interface Connection {
  id: string;
  name: string;
  icon?: string;
}

interface FileStorageConnectionSelectProps {
  connections: Connection[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function FileStorageConnectionSelect({
  connections,
  value,
  onValueChange,
  placeholder = "Select storage...",
}: FileStorageConnectionSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[200px] h-8!">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {connections.map((connection) => (
          <SelectItem
            className="cursor-pointer"
            key={connection.id}
            value={connection.id}
          >
            <div className="flex items-center gap-2">
              {connection.icon ? (
                <img
                  src={connection.icon}
                  alt={connection.name}
                  className="w-4 h-4 rounded"
                />
              ) : (
                <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center text-xs font-semibold text-blue-600">
                  📁
                </div>
              )}
              <span>{connection.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
