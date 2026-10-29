import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value?: number;
  onCommit: (value: number | undefined) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}

const scoreText = (value?: number) => (value === undefined || value === null ? '' : String(value));

/** Keeps an editable draft so clearing/retyping a controlled score never snaps to zero. */
export function GradeScoreInput({ value, onCommit, disabled, ariaLabel, className = '' }: Props) {
  const [draft, setDraft] = useState(scoreText(value));
  const [invalid, setInvalid] = useState(false);
  const pointerFocusRef = useRef(false);
  const replaceOnNextKeyRef = useRef(false);

  useEffect(() => {
    setDraft(scoreText(value));
    setInvalid(false);
  }, [value]);

  const scoreKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    if (/^[0-9]$/.test(event.key)) return event.key;
    if (event.key === '.' || event.key === ',') return event.key;
    const numpadDigit = /^Numpad([0-9])$/.exec(event.code);
    if (numpadDigit) return numpadDigit[1];
    if (event.code === 'NumpadDecimal') return '.';
    return null;
  };

  const commit = () => {
    const normalized = draft.trim().replace(',', '.');
    if (!normalized) {
      setDraft('');
      setInvalid(false);
      if (value !== undefined) onCommit(undefined);
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
      title={invalid ? 'Điểm phải từ 0 đến 10' : 'Nhập tay điểm từ 0 đến 10; xóa trắng để hủy điểm; nhấn Enter hoặc rời ô để lưu'}
      placeholder="—"
      value={draft}
      disabled={disabled}
      onPointerDown={() => {
        pointerFocusRef.current = true;
        replaceOnNextKeyRef.current = false;
      }}
      onPointerUp={() => {
        pointerFocusRef.current = false;
      }}
      onPointerCancel={() => {
        pointerFocusRef.current = false;
      }}
      onFocus={(event) => {
        if (pointerFocusRef.current) return;
        event.currentTarget.select();
        replaceOnNextKeyRef.current = true;
      }}
      onChange={(event) => {
        // Keep manual typing unrestricted until commit. This lets a touch user
        // replace an initial 0 with 10 even if the browser reports "010".
        setDraft(event.target.value.slice(0, 8));
        setInvalid(false);
        replaceOnNextKeyRef.current = false;
      }}
      onBlur={() => {
        pointerFocusRef.current = false;
        replaceOnNextKeyRef.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        const nextScoreKey = scoreKey(event);
        if (replaceOnNextKeyRef.current && nextScoreKey !== null) {
          event.preventDefault();
          replaceOnNextKeyRef.current = false;
          setDraft(nextScoreKey);
          setInvalid(false);
          return;
        }
        if (replaceOnNextKeyRef.current && (event.key === 'Backspace' || event.key === 'Delete')) {
          event.preventDefault();
          replaceOnNextKeyRef.current = false;
          setDraft('');
          setInvalid(false);
          return;
        }
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(scoreText(value));
          setInvalid(false);
          replaceOnNextKeyRef.current = false;
          event.currentTarget.blur();
        }
      }}
      className={`${className} aria-invalid:border-red-500 aria-invalid:bg-red-50 aria-invalid:ring-2 aria-invalid:ring-red-200`}
    />
  );
}
