import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

// Match sidebar menu button styling exactly
// Sidebar uses: text-sm, font-[450], gap-2, px-2
const menuItemStyles =
  "w-full h-8 justify-start gap-2 px-2 text-sm font-[450] text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent active:bg-sidebar-accent/75 [&>svg]:size-[18px] [&>svg]:text-muted-foreground hover:[&>svg]:text-sidebar-foreground";

export function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(menuItemStyles, className)}
      {...props}
    />
  );
}
