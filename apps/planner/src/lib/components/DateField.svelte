<script>
  // 薄封装：共享 DateTriggerField（@life-os/platform-web/svelte/form）+
  // planner 的日期文案格式化（今天前缀 / compact 简写）。
  import { t, localeTag } from '$lib/i18n/index.js';
  import { formatDateDisplay, formatDateCompact } from '$lib/domain/dateFormat.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { DateTriggerField } from '@life-os/platform-web/svelte/form';

  /** @type {{
    id?: string,
    value?: string | null,
    placeholder?: string,
    compact?: boolean,
    onchange?: (value: string | null) => void
  }} */
  let { id, value = null, placeholder = '', compact = false, onchange } = $props();

  const displayLabel = $derived.by(() => {
    if (!value) return placeholder || t('task.pickDate');
    if (!compact) return formatDateDisplay(value);
    const datePart = formatDateCompact(value);
    if (value === todayKey()) return `${t('nav.today')} ${datePart}`;
    return datePart;
  });
</script>

<DateTriggerField
  {id}
  {value}
  display={displayLabel}
  {compact}
  lang={localeTag()}
  placeholder={!value}
  {onchange}
/>
