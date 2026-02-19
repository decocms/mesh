import type { SelectHTMLAttributes } from "react";
import { Icon } from "./Icon";

interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  placeholder?: string;
  icon?: string;
  className?: string;
  selectClassName?: string;
}

export function Select({
  options,
  placeholder,
  icon,
  className = "",
  selectClassName = "",
  ...props
}: SelectProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 flex items-center">
            <Icon name={icon} size={16} className="text-muted-foreground" />
          </div>
        )}
        <select
          className={`
            w-full h-10 px-3 py-2 text-sm
            bg-transparent border border-border rounded-lg
            text-foreground
            appearance-none cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
            disabled:cursor-not-allowed disabled:opacity-50
            ${icon ? "pl-10" : ""}
            pr-10
            ${selectClassName}
          `}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none flex items-center">
          <Icon
            name="ChevronDown"
            size={16}
            className="text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}
