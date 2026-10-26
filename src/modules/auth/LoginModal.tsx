import { ArrowLeftRight, LogOut, ShieldCheck, X } from 'lucide-react';
import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { DialogFrame } from '../../components/DialogFrame';
import { isLocalPreview } from '../../lib/supabase';
import { accountRoleLabel } from '../../lib/accountRoles';
import type { UserAccount } from '../../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  authenticatedUser?: Pick<User, 'id' | 'email' | 'user_metadata'> | null;
  onLogout: () => Promise<void>;
  onSwitchRole?: (role: 'owner' | 'teacher') => void;
  onSwitchAccount?: (account: UserAccount) => void;
  onManageAccounts?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, currentUser, authenticatedUser, onLogout, onSwitchRole, onManageAccounts }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;
  const ownIdentity = authenticatedUser?.id === currentUser.id ? authenticatedUser : null;
  const googleName = [ownIdentity?.user_metadata?.full_name, ownIdentity?.user_metadata?.name]
    .find(value => typeof value === 'string' && value.trim());
  const displayEmail = ownIdentity?.email || currentUser.email;
  const displayName = currentUser.isPrivate && ownIdentity
    ? (typeof googleName === 'string' ? googleName.trim().slice(0, 120) : displayEmail.split('@')[0]) || currentUser.name
    : currentUser.name;
  return (
    <DialogFrame label="Tài khoản" onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section    className="dialog-panel relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button onClick={onClose} aria-label="Đóng" className="absolute right-3 top-3 rounded-lg p-2 text-slate-500"><X className="h-5 w-5" /></button>
        <h2 className="break-words pr-8 text-lg font-bold">{displayName}</h2>
        {displayEmail && <p className="mt-1 break-all text-sm text-slate-500">{displayEmail}</p>}
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-800"><ShieldCheck className="h-4 w-4" />{accountRoleLabel(currentUser.role)}</p>
        {['owner', 'admin'].includes(currentUser.role) && onManageAccounts && <button onClick={() => { onClose(); onManageAccounts(); }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900"><ShieldCheck className="h-4 w-4" />Quản lý tài khoản và phân quyền</button>}
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
