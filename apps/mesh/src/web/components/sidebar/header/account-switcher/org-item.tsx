import { useState } from "react";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Settings02 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";

interface OrgItemProps {
  org: { slug: string; name: string; logo?: string | null };
  isActive?: boolean;
  onClick?: () => void;
  onSettings?: () => void;
}

export function OrgItem({ org, isActive, onClick, onSettings }: OrgItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const showSettings = isActive || isHovered;

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-center gap-2 w-full justify-start font-normal h-10 px-2 rounded-lg cursor-pointer transition-colors hover:bg-accent/50",
        isActive && "bg-accent hover:bg-accent",
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Avatar
        url={org.logo ?? undefined}
        fallback={org.name}
        size="sm"
        className="size-6 shrink-0 rounded-md"
        objectFit="cover"
      />
      <span className="flex-1 text-sm text-foreground truncate text-left min-w-0">
        {org.name}
      </span>
      {/* Settings button - always reserve space to prevent CLS */}
      {onSettings && showSettings ? (
        <button
          type="button"
          aria-label={`${org.name} settings`}
          className="size-5 shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
        >
          <Settings02 size={16} className="text-muted-foreground" />
        </button>
      ) : (
        <span className="size-5 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}
