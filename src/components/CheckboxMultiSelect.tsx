import React from 'react';

interface Props {
  label: string;
  options: { value: string; label: string }[];
  values: string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
}
/** Native disclosure keeps the checkbox list usable with touch and keyboard. */
export function CheckboxMultiSelect({ label, options, values, disabled, onChange }: Props) {
  return <details className="rounded-xl border border-slate-300 bg-white text-xs">
    <summary tabIndex={0} aria-label={label} className="cursor-pointer rounded-xl p-3 font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-amber-500">
      {label} · {values.length} đã chọn
    </summary>
    <div className="max-h-56 space-y-1 overflow-y-auto border-t border-slate-200 p-2">
      {options.length === 0 && <p className="p-2 text-slate-500">Chưa có lớp. Có thể tạo hồ sơ trước rồi phân công sau.</p>}
      {options.map(option => <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-amber-50">
        <input type="checkbox" aria-label={option.label} disabled={disabled} checked={values.includes(option.value)}
          onChange={event => onChange(event.target.checked ? [...new Set([...values, option.value])] : values.filter(value => value !== option.value))}
          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600" />
        <span className="min-w-0 break-words">{option.label}</span>
      </label>)}
    </div>
  </details>;
}
