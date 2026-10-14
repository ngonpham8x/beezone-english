import { ArrowLeftRight, LogOut, ShieldCheck, X } from 'lucide-react';
import React, { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { isLocalPreview } from '../../lib/supabase';
import type { UserAccount } from '../../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onLogout: () => Promise<void>;
  onSwitchRole?: (role: 'owner' | 'teacher') => void;
  onSwitchAccount?: (account: UserAccount) => void;
  onManageAccounts?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, currentUser, onLogout, onSwitchRole, onManageAccounts }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;
  return (
    <DialogFrame label="Tài khoản" onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section    className="dialog-panel relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button onClick={onClose} aria-label="Đóng" className="absolute right-3 top-3 rounded-lg p-2 text-slate-500"><X className="h-5 w-5" /></button>
        <h2 className="break-words pr-8 text-lg font-bold">{currentUser.name}</h2>
        {!currentUser.isPrivate && <p className="mt-1 break-all text-sm text-slate-500">{currentUser.email}</p>}
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-800"><ShieldCheck className="h-4 w-4" />{currentUser.role === 'owner' ? 'Chủ trung tâm' : 'Nhân viên / Giáo viên'}</p>
        {currentUser.role === 'owner' && onManageAccounts && <button onClick={() => { onClose(); onManageAccounts(); }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900"><ShieldCheck className="h-4 w-4" />Quản lý tài khoản và phân quyền</button>}
        {isLocalPreview ? (
          <button onClick={() => { onSwitchRole?.(currentUser.role === 'owner' ? 'teacher' : 'owner'); onClose(); }} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-bold"><ArrowLeftRight className="h-4 w-4" />Chuyển vai trò xem thử</button>
        ) : <p className="mt-4 text-sm leading-6 text-slate-600">Tài khoản đăng nhập bằng Google. Để đổi tài khoản, hãy đăng xuất rồi đăng nhập lại.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button disabled={isSubmitting} onClick={async () => {
          setIsSubmitting(true); setError(null);
          try { await onLogout(); } catch { setError('Không thể đăng xuất. Vui lòng thử lại.'); }
          finally { setIsSubmitting(false); }
        }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-sm font-bold text-white disabled:opacity-60"><LogOut className="h-4 w-4" />{isSubmitting ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
      </section>
    </DialogFrame>
  );
};
