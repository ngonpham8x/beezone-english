import React from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';
import { DialogFrame } from './DialogFrame';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Xác nhận xóa',
  cancelText = 'Hủy bỏ',
  variant = 'danger',
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const iconBg = {
    danger: 'bg-rose-100 text-rose-600',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-sky-100 text-sky-700',
  }[variant];

  const confirmBtnClass = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200',
    info: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-200',
  }[variant];

  return (
    <DialogFrame
      label={title}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="dialog-panel relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${iconBg} shadow-sm`}>
          {variant === 'danger' ? (
            <Trash2 className="h-7 w-7" />
          ) : variant === 'warning' ? (
            <AlertTriangle className="h-7 w-7" />
          ) : (
            <Info className="h-7 w-7" />
          )}
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
        <div className="text-sm text-slate-600 mb-6 leading-relaxed">{message}</div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-5 py-2.5 text-xs font-bold rounded-xl transition shadow-sm ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}

export interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  buttonText?: string;
  onClose: () => void;
}

export function AlertModal({
  isOpen,
  title = 'Thông báo',
  message,
  buttonText = 'Đã hiểu',
  onClose,
}: AlertModalProps) {
  if (!isOpen) return null;

  return (
    <DialogFrame
      label={title}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="dialog-panel relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
        <div className="text-sm text-slate-600 mb-6 leading-relaxed">{message}</div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-sm"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}

