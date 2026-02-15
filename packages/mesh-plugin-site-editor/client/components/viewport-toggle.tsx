/**
 * Viewport Toggle Component
 *
 * Switches the preview iframe between mobile (375px), tablet (768px),
 * and desktop (1440px) widths. Uses lucide-react icons for viewport indicators.
 */

import { Button } from "@deco/ui/components/button.tsx";
import { Monitor, Smartphone, Tablet } from "lucide-react";

export const VIEWPORTS = {
  mobile: { width: 375, label: "Mobile", icon: Smartphone },
  tablet: { width: 768, label: "Tablet", icon: Tablet },
  desktop: { width: 1440, label: "Desktop", icon: Monitor },
} as const;

export type ViewportKey = keyof typeof VIEWPORTS;

interface ViewportToggleProps {
  value: ViewportKey;
  onChange: (v: ViewportKey) => void;
}

export function ViewportToggle({ value, onChange }: ViewportToggleProps) {
  return (
    <div className="flex gap-1">
      {(Object.keys(VIEWPORTS) as ViewportKey[]).map((key) => {
        const { label, icon: Icon } = VIEWPORTS[key];
        return (
          <Button
            key={key}
            variant={value === key ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(key)}
            title={label}
          >
            <Icon size={14} />
            <span className="sr-only">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
