import type { ReactNode, SyntheticEvent } from "react";
import { formatDateLocalized } from "../format";
import { useLocale } from "../i18n/context";

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  suffix,
  placeholder,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="field-affix">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
        {suffix && (
          <span className="field-affix__suffix">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/** 百分比输入：内部用小数 (0.06)，显示百分比 (6)。 */
export function PercentField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="field-affix">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step={0.1}
          value={Number.isFinite(value) ? +(value * 100).toFixed(2) : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? 0 : Number(e.target.value) / 100)
          }
        />
        <span className="field-affix__suffix">
          %
        </span>
      </div>
    </div>
  );
}

/** 可拖动滑块：右上角显示当前值，轨道按比例填充。 */
export function SliderField({
  label,
  value,
  onChange,
  onCommit,
  min = 0,
  max,
  step = 25,
  format,
  hint,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  /** 拖动结束（松手 / 键盘抬起）时触发，用于把代价较高的写入推迟到最终值。 */
  onCommit?: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  const clamped = Math.min(max, Math.max(min, safe));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const commit = onCommit
    ? (e: SyntheticEvent<HTMLInputElement>) =>
        onCommit(Number((e.target as HTMLInputElement).value))
    : undefined;
  return (
    <div className="field slider-field">
      {label && (
        <label className="slider-label">
          <span>{label}</span>
          <span className="slider-value">{format ? format(safe) : safe}</span>
        </label>
      )}
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onTouchEnd={commit}
      />
      {hint && <span className="slider-hint">{hint}</span>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <input
        className="input"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label?: string;
  value?: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  const { t, intlLocale } = useLocale();
  // input[type=date] 需要 "YYYY-MM-DD"；裁掉可能带的时间部分。
  const dateOnly = value ? value.slice(0, 10) : "";
  const displayLocalized = formatDateLocalized(dateOnly);
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className={`date-field-wrap${dateOnly ? "" : " is-empty"}`}>
        <input
          className="input"
          type="date"
          lang={intlLocale}
          value={dateOnly}
          min={min}
          onChange={(e) => onChange(e.target.value)}
        />
        {!dateOnly && <span className="date-field-placeholder">{t("common.datePlaceholder")}</span>}
      </div>
      {displayLocalized && <span className="muted-note date-field-zh">{displayLocalized}</span>}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Card({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card">
      {(title || action) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
