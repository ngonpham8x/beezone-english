export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export function showToast(message: string, type: ToastType = 'success', title?: string, duration = 4000) {
  if (typeof window === 'undefined') return;
  const detail: ToastMessage = {
    id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    title,
    message,
    duration,
  };
  window.dispatchEvent(new CustomEvent('beezone:toast', { detail }));
}

export const toast = {
  success: (message: string, title = 'Thành công') => showToast(message, 'success', title),
  error: (message: string, title = 'Thông báo lỗi') => showToast(message, 'error', title),
  warning: (message: string, title = 'Lưu ý') => showToast(message, 'warning', title),
  info: (message: string, title = 'Thông tin') => showToast(message, 'info', title),
};

