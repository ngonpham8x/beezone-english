import React, { useEffect, useState } from 'react';

interface Props {
  value?: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}

const scoreText = (value?: number) => value === undefined ? '' : String(value);

/** Keeps an editable draft so clearing/retyping a controlled score never snaps to zero. */
export function GradeScoreInput({ value, onCommit, disabled, ariaLabel, className = '' }: Props) {
  const [draft, setDraft] = useState(scoreText(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(scoreText(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const normalized = draft.trim().replace(',', '.');
    if (!normalized) {
      setDraft(scoreText(value));
      setInvalid(false);
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
      setInvalid(true);
      return;
    }
    const rounded = Math.round(parsed * 10) / 10;
    setDraft(String(rounded));
    setInvalid(false);
    if (rounded !== value) onCommit(rounded);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      title={invalid ? 'Điểm phải từ 0 đến 10' : 'Nhập tay điểm từ 0 đến 10; nhấn Enter hoặc rời ô để lưu'}
      placeholder="—"
      value={draft}
      disabled={disabled}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const next = event.target.value;
        if (/^\d{0,2}([.,]\d*)?$/.test(next)) {
          setDraft(next);
          setInvalid(false);
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(scoreText(value));
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      className={`${className} aria-invalid:border-red-500 aria-invalid:bg-red-50 aria-invalid:ring-2 aria-invalid:ring-red-200`}
    />
  );
}
