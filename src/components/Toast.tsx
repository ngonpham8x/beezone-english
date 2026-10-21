import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastMessage } from '../lib/toast';
export { showToast, toast } from '../lib/toast';
export type { ToastMessage, ToastType } from '../lib/toast';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToastEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ToastMessage>;
      if (!customEvent.detail) return;
      const newToast = customEvent.detail;
      setToasts((prev) => [...prev, newToast]);

      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, newToast.duration);
      }
    };

    window.addEventListener('beezone:toast', handleToastEvent);
    return () => window.removeEventListener('beezone:toast', handleToastEvent);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Thông báo hệ thống"
      className="fixed top-4 left-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm sm:left-auto sm:w-full pointer-events-none"
    >
      {toasts.map((item) => {
        const isSuccess = item.type === 'success';
        const isError = item.type === 'error';
        const isWarning = item.type === 'warning';

        const borderColor = isSuccess
          ? 'border-emerald-300'
          : isError
          ? 'border-rose-300'
          : isWarning
          ? 'border-amber-300'
          : 'border-sky-300';

        const iconBg = isSuccess
          ? 'bg-emerald-100 text-emerald-700'
          : isError
          ? 'bg-rose-100 text-rose-700'
          : isWarning
          ? 'bg-amber-100 text-amber-700'
          : 'bg-sky-100 text-sky-700';

        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-4 bg-white/95 backdrop-blur-md rounded-2xl border shadow-xl transition-all duration-300 ${borderColor}`}
          >
            <div className={`p-2 rounded-xl shrink-0 ${iconBg}`}>
              {isSuccess && <CheckCircle2 className="w-5 h-5" />}
              {isError && <AlertCircle className="w-5 h-5" />}
              {isWarning && <AlertTriangle className="w-5 h-5" />}
              {item.type === 'info' && <Info className="w-5 h-5" />}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h5 className="text-xs font-bold text-slate-900 leading-tight">
                {item.title || (isSuccess ? 'Thành công' : isError ? 'Thông báo lỗi' : 'Thông báo')}
              </h5>
              <p className="text-xs text-slate-600 mt-1 leading-snug break-words font-medium">
                {item.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== item.id))}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition shrink-0 cursor-pointer"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

