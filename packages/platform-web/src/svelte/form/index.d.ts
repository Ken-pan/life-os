import type { Component } from 'svelte'

interface FieldBaseProps {
  label?: string
  hint?: string
  /** Shown instead of hint, in `--critical`, with role="alert"; also sets aria-invalid. */
  error?: string
  disabled?: boolean
  /** Extra classes on the control element (e.g. finance's `input`). */
  inputClass?: string
}

export interface TextFieldProps extends FieldBaseProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'url' | 'search'
}

export interface NumberFieldProps extends FieldBaseProps {
  value: number
  /** Empty input reports 0 (matches finance behaviour). */
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  /** Inline suffix rendered inside the control (kg / % / 円…). */
  suffix?: string
  placeholder?: string
}

export interface SelectFieldProps extends FieldBaseProps {
  value: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  onChange: (value: string) => void
}

export interface TextareaFieldProps extends FieldBaseProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

export interface DateFieldProps extends FieldBaseProps {
  /** "YYYY-MM-DD"; longer ISO strings are truncated to the date part. */
  value: string
  onChange: (value: string) => void
  min?: string
  lang?: string
  /** Overlay text while empty (native date skeleton is hidden). */
  placeholder?: string
  /** Localized echo line under the control (e.g. finance's zh date). */
  note?: string
}

export interface DateTriggerFieldProps {
  id?: string
  value?: string | null
  /** Formatted label for the trigger button — apps own formatting/i18n. */
  display: string
  compact?: boolean
  lang?: string
  /** Style the display label as placeholder (no value chosen). */
  placeholder?: boolean
  onchange?: (value: string | null) => void
}

export interface CheckboxFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** Secondary line under the label. */
  description?: string
  disabled?: boolean
}

export interface RadioGroupFieldProps {
  /** Group legend (styled like a field label). */
  label?: string
  value: string
  options: Array<{
    value: string
    label: string
    description?: string
    disabled?: boolean
  }>
  onChange: (value: string) => void
  /** Disables the whole group. */
  disabled?: boolean
}

export interface SliderFieldProps {
  label?: string
  value: number
  /** Fires on every input (drag). */
  onChange: (value: number) => void
  /** Fires once on release / key-up — for persistence. */
  onCommit?: (value: number) => void
  min?: number
  max: number
  step?: number
  /** Formats the value shown next to the label. */
  format?: (value: number) => string
  hint?: string
  disabled?: boolean
}

export interface SearchFieldProps {
  value: string
  /** Fires on every input; '' when the clear button is pressed. */
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  /** aria-label of the clear button. */
  clearLabel?: string
}

export interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** aria-label of the group. */
  label?: string
  format?: (value: number) => string
  disabled?: boolean
  decrementLabel?: string
  incrementLabel?: string
}

export declare const TextField: Component<TextFieldProps>
export declare const NumberField: Component<NumberFieldProps>
export declare const SelectField: Component<SelectFieldProps>
export declare const TextareaField: Component<TextareaFieldProps>
export declare const DateField: Component<DateFieldProps>
export declare const DateTriggerField: Component<DateTriggerFieldProps>
export declare const CheckboxField: Component<CheckboxFieldProps>
export declare const RadioGroupField: Component<RadioGroupFieldProps>
export declare const SliderField: Component<SliderFieldProps>
export declare const SearchField: Component<SearchFieldProps>
export declare const QuantityStepper: Component<QuantityStepperProps>
