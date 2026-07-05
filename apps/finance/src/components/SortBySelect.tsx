type SortOption<T extends string> = {
  id: T;
  label: string;
};

export function SortBySelect<T extends string>({
  label = "排序",
  value,
  onChange,
  options,
  className,
  compact = false,
}: {
  label?: string;
  value: T;
  onChange: (next: T) => void;
  options: SortOption<T>[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={["field", "sort-select", compact ? "compact" : "", className].filter(Boolean).join(" ")}>
      {!compact && <label>{label}</label>}
      <select
        className="input"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
