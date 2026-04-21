import { useState } from "react";
import { Button } from "@decocms/ui/components/button.tsx";
import { Input } from "@decocms/ui/components/input.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@decocms/ui/components/card.tsx";
import { Badge } from "@decocms/ui/components/badge.tsx";
import { Label } from "@decocms/ui/components/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@decocms/ui/components/select.tsx";

type Theme = "light" | "dark" | "system";

const THEME_KEY = "playground:theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.classList.toggle("dark", resolved === "dark");
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_KEY) as Theme) || "system";
  });
  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  };
  return [theme, setTheme];
}

const COLOR_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
  "input",
  "ring",
  "destructive",
  "destructive-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "brand",
  "brand-foreground",
] as const;

const RADIUS_TOKENS = [
  "none",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "full",
] as const;

export function App() {
  const [theme, setTheme] = useTheme();

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">@decocms/ui playground</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Local validation surface for the design system. Ephemeral — use to
            catch issues before publishing.
          </p>
        </div>
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Color tokens</CardTitle>
          <CardDescription>Semantic tokens from global.css.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {COLOR_TOKENS.map((t) => (
              <div key={t} className="space-y-1">
                <div
                  className="h-12 rounded-md border border-border"
                  style={{ background: `var(--${t})` }}
                />
                <div className="text-xs font-mono text-muted-foreground">
                  --{t}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Radius scale</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {RADIUS_TOKENS.map((r) => (
              <div key={r} className="text-center space-y-1">
                <div
                  className="h-16 w-16 bg-accent border border-border"
                  style={{ borderRadius: `var(--radius-${r})` }}
                />
                <div className="text-xs font-mono text-muted-foreground">
                  {r}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-sans">
            Sans (Inter var) — The quick brown fox jumps over the lazy dog.
          </p>
          <p className="font-serif">
            Serif — The quick brown fox jumps over the lazy dog.
          </p>
          <p className="font-mono">
            Mono (CommitMono) — The quick brown fox jumps over the lazy dog.
          </p>
          <div className="flex gap-3 pt-2">
            {[300, 400, 500, 600, 650].map((w) => (
              <span key={w} style={{ fontWeight: w }}>
                {w}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Badges</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form primitives</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" type="email" placeholder="hi@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-err">Invalid state</Label>
            <Input id="p-err" aria-invalid placeholder="try focusing me" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-disabled">Disabled</Label>
            <Input id="p-disabled" disabled placeholder="disabled" />
          </div>
        </CardContent>
      </Card>

      <footer className="text-xs text-muted-foreground pt-4 pb-8">
        Active theme: <code className="font-mono">{theme}</code>. Validate:
        tokens render, fonts load, components interactive, dark mode flips.
      </footer>
    </div>
  );
}
