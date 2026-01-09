import { Button } from "./button.tsx";
import { Input } from "./input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";
import { Separator } from "./separator.tsx";
import { Avatar } from "./avatar.tsx";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "../lib/utils.ts";
import { ChevronDown } from "@untitledui/icons";

export interface TopbarSwitcherEntity {
  slug: string;
  name: string;
  avatarUrl?: string | null;
}

// Context for tracking hover state (for multi-panel switchers)
interface TopbarSwitcherContextValue {
  hoveredItem: string | null;
  setHoveredItem: (slug: string | null) => void;
}

const TopbarSwitcherContext = createContext<TopbarSwitcherContextValue | null>(
  null,
);

function useTopbarSwitcherContext() {
  const context = useContext(TopbarSwitcherContext);
  if (!context) {
    throw new Error(
      "TopbarSwitcher compound components must be used within TopbarSwitcher.Root",
    );
  }
  return context;
}

// Root component - wraps everything
interface TopbarSwitcherRootProps {
  children: ReactNode;
  onItemHover?: (slug: string | null) => void;
  collapsed?: boolean;
}

function TopbarSwitcherRoot({
  children,
  onItemHover,
  collapsed = false,
}: TopbarSwitcherRootProps) {
  const [hoveredItem, setHoveredItemInternal] = React.useState<string | null>(
    null,
  );

  const setHoveredItem = (slug: string | null) => {
    setHoveredItemInternal(slug);
    onItemHover?.(slug);
  };

  return (
    <TopbarSwitcherContext.Provider value={{ hoveredItem, setHoveredItem }}>
      {collapsed ? <>{children}</> : <Popover>{children}</Popover>}
    </TopbarSwitcherContext.Provider>
  );
}

// Trigger - shows current item and expand button
interface TopbarSwitcherTriggerProps {
  children: ReactNode;
  onClick?: () => void;
  collapsed?: boolean;
}

function TopbarSwitcherTrigger({
  children,
  onClick,
  collapsed = false,
}: TopbarSwitcherTriggerProps) {
  if (collapsed) {
    return (
      <Button
        variant="link"
        className="p-0 h-auto min-w-0 flex-1"
        onClick={onClick}
        type="button"
      >
        {children}
      </Button>
    );
  }

  return (
    <PopoverTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start !pl-1 !pr-1.5 min-w-0 flex-1"
        onClick={onClick}
        type="button"
      >
        {children}
        <ChevronDown size={16} className="opacity-50 shrink-0" />
      </Button>
    </PopoverTrigger>
  );
}

// Current item display (avatar + name)
interface TopbarSwitcherCurrentItemProps<T extends TopbarSwitcherEntity> {
  item: T | undefined;
  fallback?: string;
  collapsed?: boolean;
}

function TopbarSwitcherCurrentItem<T extends TopbarSwitcherEntity>({
  item,
  fallback = "",
  collapsed = false,
}: TopbarSwitcherCurrentItemProps<T>) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Avatar
        url={item?.avatarUrl ?? ""}
        fallback={item?.name ?? fallback}
        size="sm"
        objectFit="cover"
        className="shrink-0 size-5 rounded-md"
      />
      {!collapsed && (
        <span className="truncate font-medium text-[14px]">
          {item?.name ?? fallback}
        </span>
      )}
    </div>
  );
}

// Content - popover content wrapper
interface TopbarSwitcherContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
}

function TopbarSwitcherContent({
  children,
  align = "start",
}: TopbarSwitcherContentProps) {
  // Count panels to determine width
  const panelCount = React.Children.toArray(children).filter(
    (child) =>
      React.isValidElement(child) &&
      (child.type === TopbarSwitcherPanel ||
        child.type === TopbarSwitcherPanelRoot),
  ).length;

  const width = panelCount === 1 ? "280px" : "480px";

  return (
    <PopoverContent
      align={align}
      className="p-0 flex items-start"
      style={{ width }}
    >
      {children}
    </PopoverContent>
  );
}

// Panel - a section of the popover (left/right)
interface TopbarSwitcherPanelProps {
  children: ReactNode;
  className?: string;
}

function TopbarSwitcherPanelRoot({
  children,
  className,
}: TopbarSwitcherPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col border-border w-[240px] border-r last:border-r-0 last:w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

// For backward compatibility
const TopbarSwitcherPanel = TopbarSwitcherPanelRoot;

// Search input
interface TopbarSwitcherSearchProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

function TopbarSwitcherSearch({
  placeholder = "Search...",
  value,
  onChange,
}: TopbarSwitcherSearchProps) {
  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-none border-t-0 border-x-0 focus-visible:border-border focus-visible:ring-0"
    />
  );
}

// Items container - scrollable list
interface TopbarSwitcherItemsProps {
  children: ReactNode;
  emptyMessage?: string;
}

function TopbarSwitcherItems({
  children,
  emptyMessage = "No items found.",
}: TopbarSwitcherItemsProps) {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div className="flex flex-col gap-0.5 p-1 max-h-44 overflow-y-auto">
      {!hasChildren && (
        <div className="text-muted-foreground text-sm px-1 py-8 text-center">
          {emptyMessage}
        </div>
      )}
      {children}
    </div>
  );
}

// Individual item
interface TopbarSwitcherItemProps<T extends TopbarSwitcherEntity> {
  item: T;
  onClick: (item: T) => void;
  onHover?: (item: T) => void;
  children?: ReactNode;
}

function TopbarSwitcherItem<T extends TopbarSwitcherEntity>({
  item,
  onClick,
  onHover,
  children,
}: TopbarSwitcherItemProps<T>) {
  const context = useTopbarSwitcherContext();

  const handleMouseEnter = () => {
    context.setHoveredItem(item.slug);
    onHover?.(item);
  };

  return (
    <Button
      onClick={() => onClick(item)}
      onMouseEnter={handleMouseEnter}
      variant="ghost"
      size="sm"
      className="w-full justify-start font-normal"
    >
      {children || (
        <>
          <Avatar
            url={item.avatarUrl ?? ""}
            fallback={item.name}
            size="xs"
            className="w-[22px]! h-[22px]!"
            objectFit="contain"
          />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {item.name}
          </span>
        </>
      )}
    </Button>
  );
}

// Actions section - bottom part with create/see all buttons
interface TopbarSwitcherActionsProps {
  children: ReactNode;
}

function TopbarSwitcherActions({ children }: TopbarSwitcherActionsProps) {
  return <div className="px-1 pb-1 pt-0.5">{children}</div>;
}

// Action button
interface TopbarSwitcherActionProps {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
  variant?: "default" | "muted";
}

function TopbarSwitcherAction({
  onClick,
  icon,
  children,
  variant = "default",
}: TopbarSwitcherActionProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start font-normal",
        variant === "muted" && "text-muted-foreground",
      )}
      onClick={onClick}
    >
      {icon && <span className="[&>svg]:size-4">{icon}</span>}
      <span>{children}</span>
    </Button>
  );
}

// Separator
function TopbarSwitcherSeparator() {
  return <Separator />;
}

// Skeleton
function TopbarSwitcherSkeleton() {
  return <div className="h-4 w-16 bg-accent rounded-full animate-pulse" />;
}

// Add React import at the top
import * as React from "react";

// Export compound component
export const TopbarSwitcher = Object.assign(TopbarSwitcherRoot, {
  Trigger: TopbarSwitcherTrigger,
  CurrentItem: TopbarSwitcherCurrentItem,
  Content: TopbarSwitcherContent,
  Panel: TopbarSwitcherPanel,
  Search: TopbarSwitcherSearch,
  Items: TopbarSwitcherItems,
  Item: TopbarSwitcherItem,
  Actions: TopbarSwitcherActions,
  Action: TopbarSwitcherAction,
  Separator: TopbarSwitcherSeparator,
  Skeleton: TopbarSwitcherSkeleton,
});
