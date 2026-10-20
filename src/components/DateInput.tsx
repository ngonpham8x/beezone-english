import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateForDisplay, parseDateInput } from '../lib/dates';

export interface DateInputProps {
  label?: string;
  subLabel?: string;
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  hint?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export const DateInput: React.FC<DateInputProps> = ({
  label,
  subLabel,
  value,
  onChange,
  placeholder = 'DD/MM/YYYY (VD: 15/10/2016)',
  required = false,
  className = '',
  hint = 'Nhập tay ngày/tháng/năm sinh, VD: 15/10/2016 hoặc 15-10-2016',
  id,
  name,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const [displayValue, setDisplayValue] = useState(() => formatDateForDisplay(value));
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayValue(formatDateForDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);
    const parsed = parseDateInput(raw);
    onChange(parsed);
  };

  const handleBlur = () => {
    const parsed = parseDateInput(displayValue);
    if (parsed) {
      setDisplayValue(formatDateForDisplay(parsed));
      onChange(parsed);
    }
  };

  const handlePickCalendar = () => {
    if (hiddenDateRef.current) {
      if (typeof hiddenDateRef.current.showPicker === 'function') {
        hiddenDateRef.current.showPicker();
      } else {
        hiddenDateRef.current.focus();
        hiddenDateRef.current.click();
      }
    }
  };

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label htmlFor={id} className="block font-semibold text-slate-700 text-xs">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {subLabel && <span className="text-[11px] text-slate-400">{subLabel}</span>}
        </div>
      )}

      <div className="relative flex items-center">
        <input
          id={id}
          name={name}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-xs sm:text-sm bg-white"
        />

        {/* Hidden date picker for optional calendar picking only when the button is specifically clicked */}
        <input
          ref={hiddenDateRef}
          type="date"
          tabIndex={-1}
          value={parseDateInput(displayValue) || ''}
          onChange={(e) => {
            if (e.target.value) {
              const iso = e.target.value;
              setDisplayValue(formatDateForDisplay(iso));
              onChange(iso);
            }
          }}
          className="sr-only pointer-events-none opacity-0 absolute"
          aria-hidden="true"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={handlePickCalendar}
          title="Chọn từ lịch nếu muốn"
          className="absolute right-2.5 p-1 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
};
