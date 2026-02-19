import React from "react";
import { navigate } from "astro:transitions/client";
import { Icon } from "../atoms/Icon";
import { Select } from "../atoms/Select";

interface LanguageSelectorProps {
  locale: string;
  className?: string;
  compact?: boolean;
}

export function LanguageSelector({
  locale,
  className,
  compact,
}: LanguageSelectorProps) {
  const languageOptions = compact
    ? [
        { value: "en", label: "EN" },
        { value: "pt-br", label: "PT" },
      ]
    : [
        { value: "en", label: "English" },
        { value: "pt-br", label: "Português" },
      ];

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = event.target.value;
    // Path is /{version}/{locale}/{...slug} - replace only the locale segment
    const currentPath = globalThis.location.pathname;
    const newPath = currentPath.replace(/^(\/[^/]+)\/[^/]+/, `$1/${newLocale}`);
    navigate(newPath);
  };

  if (compact) {
    return (
      <div className="relative">
        <select
          value={locale}
          onChange={handleChange}
          className="h-8 pl-2 pr-6 text-xs bg-transparent border border-border rounded-md text-muted-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {languageOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Icon
            name="ChevronDown"
            size={12}
            className="text-muted-foreground"
          />
        </div>
      </div>
    );
  }

  return (
    <Select
      options={languageOptions}
      value={locale}
      icon="Languages"
      className={className}
      selectClassName="text-muted-foreground"
      onChange={handleChange}
    />
  );
}
