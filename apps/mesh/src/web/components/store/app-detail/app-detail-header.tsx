import { Icon } from "@deco/ui/components/icon.tsx";

interface AppDetailHeaderProps {
  onBack: () => void;
}

export function AppDetailHeader({ onBack }: AppDetailHeaderProps) {
  return (
    <div className="shrink-0 bg-background border-b border-border px-4 py-3">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="arrow_back" size={20} />
          Back
        </button>
      </div>
    </div>
  );
}
