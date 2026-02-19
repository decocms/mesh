import React from "react";
import { navigate } from "astro:transitions/client";
import { Icon } from "../atoms/Icon";
import { Select } from "../atoms/Select";

interface LanguageSelectorProps {
  locale: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function LanguageSelector({
  locale,
  className,
  compact,
  disabled,
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
    if (disabled) return;
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
          value={disabled ? "en" : locale}
          onChange={handleChange}
          disabled={disabled}
          className={`h-8 pl-2 pr-6 text-xs bg-transparent border border-border rounded-md appearance-none focus:outline-none focus:ring-1 focus:ring-ring ${
            disabled
              ? "text-muted opacity-50 cursor-not-allowed"
              : "text-muted-foreground cursor-pointer"
          }`}
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
            className={
              disabled ? "text-muted opacity-50" : "text-muted-foreground"
            }
          />
        </div>
      </div>
    );
  }

  return (
    <Select
      options={languageOptions}
      value={disabled ? "en" : locale}
      icon="Languages"
      className={className}
      selectClassName={
        disabled
          ? "text-muted opacity-50 cursor-not-allowed"
          : "text-muted-foreground"
      }
      onChange={handleChange}
      disabled={disabled}
    />
  );
}
