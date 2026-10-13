import { useEffect, useState } from 'react';
import { isLocalPreview } from '../../lib/supabase';

const DATA_SCHEMA_VERSION = 'beezone-receipt-table-v5';
const PREFIX = 'PHUC_PHUC_THINH_';

export function loadStored<T>(key: string, fallback: T): T {
  try {
    // Preserve browser data across schema updates; never erase it on launch.
    if (localStorage.getItem(PREFIX + 'DATA_VERSION') !== DATA_SCHEMA_VERSION)
      localStorage.setItem(PREFIX + 'DATA_VERSION', DATA_SCHEMA_VERSION);
    if (!isLocalPreview) return (Array.isArray(fallback) ? [] : fallback) as T;
    const stored = localStorage.getItem(PREFIX + key);
    const parsed = stored ? JSON.parse(stored) : fallback;
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function saveStored<T>(key: string, value: T, onError: (message: string) => void) {
  if (!isLocalPreview) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (error) {
    console.error(error);
    onError('Không thể lưu trên trình duyệt. Hãy xuất bản sao lưu trước khi đóng trang.');
  }
}

export function usePreviewState<T>(
  key: string,
  fallback: T,
  onError: (message: string) => void,
  normalize?: (value: T) => T,
) {
  const [value, setValue] = useState<T>(() => {
    const stored = loadStored(key, fallback);
    return normalize ? normalize(stored) : stored;
  });
  useEffect(() => saveStored(key, value, onError), [key, value, onError]);
  return [value, setValue] as const;
}
