import { Button } from "@deco/ui/components/button.tsx";
import { ArrowLeft } from "@untitledui/icons";

interface MCPServerDetailHeaderProps {
  onBack: () => void;
}

export function MCPServerDetailHeader({ onBack }: MCPServerDetailHeaderProps) {
  return (
    <div className="flex items-center h-12 border-b border-border shrink-0">
      {/* Back Button */}
      <div className="flex h-full px-2 border-r items-center">
        <Button
          variant="ghost"
          size="icon"
          className="items-center size-8 text-muted-foreground"
          onClick={onBack}
          aria-label="Go back"
        >
          <ArrowLeft />
        </Button>
      </div>
    </div>
  );
}
