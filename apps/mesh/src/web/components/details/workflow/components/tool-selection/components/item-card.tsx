import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { ListRow } from "@/web/components/list-row.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";

export function ItemCard({
  item,
  selected,
  onClick,
  backButton = false,
}: {
  item: { icon: string | null; title: string };
  selected?: boolean;
  backButton?: boolean;
  onClick?: () => void;
}) {
  return (
    <ListRow
      className={cn("border-b border-border/50 h-12", backButton && "p-0")}
      selected={selected}
      onClick={onClick}
    >
      {backButton && (
        <div className="flex h-full px-2 border-r items-center">
          <Button
            variant="ghost"
            size="icon"
            className="items-center size-8 text-muted-foreground/50"
            onClick={onClick}
          >
            <ArrowLeft />
          </Button>
        </div>
      )}
      {item.icon !== null && (
        <ListRow.Icon>
          <IntegrationIcon
            icon={item.icon ?? null}
            name={item.title}
            size="sm"
          />
        </ListRow.Icon>
      )}
      <ListRow.Content>
        <ListRow.Title className="text-muted-foreground/70">
          {item.title}
        </ListRow.Title>
      </ListRow.Content>
    </ListRow>
  );
}
