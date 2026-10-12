import React, { useState } from 'react';
import { LogOut, ShieldCheck, X, ArrowLeftRight, Key, CheckCircle, AlertCircle, Eye, EyeOff, Lock, UserCheck } from 'lucide-react';
import { UserAccount } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import { getAdminPassword, setAdminPassword, verifyAdminPassword, ADMIN_ACCOUNTS } from '../lib/auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onLogout: () => Promise<void>;
  onSwitchRole?: (role: 'owner' | 'teacher') => void;
  onSwitchAccount?: (account: UserAccount) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  onSwitchRole,
  onSwitchAccount,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogout = async () => {
    setIsSubmitting(true);
    await onLogout();
    setIsSubmitting(false);
  };

  const isOwner = currentUser.role === 'owner';

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }

    if (!verifyAdminPassword(currentUser.email, currentPassword)) {
      setPasswordError('Mật khẩu hiện tại không chính xác. Mật khẩu mặc định là 11111111.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setAdminPassword(currentUser.email, newPassword);
    setPasswordSuccess(`Đổi mật khẩu thành công cho ${currentUser.email}! Vui lòng ghi nhớ mật khẩu mới này.`);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => {
      setPasswordSuccess(null);
      setIsChangingPassword(false);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Tài khoản"
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl custom-scrollbar"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Đóng"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 pr-8">
          {currentUser.avatar ? (
            <img
              src={currentUser.avatar}
              alt=""
              className="h-12 w-12 rounded-full border border-slate-200 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-lg font-bold text-amber-900">
              {currentUser.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="font-extrabold text-slate-900">{currentUser.name}</h2>
            <p className="text-xs text-slate-500">{currentUser.email || 'Tài khoản BeeZone'}</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
              <ShieldCheck className="h-3 w-3" />{' '}
              {currentUser.role === 'owner' ? 'Chủ trung tâm (Toàn quyền)' : 'Giáo viên phụ trách lớp'}
            </span>
          </div>
        </div>

        {/* Change Password Section for Owner */}
        {isOwner && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Key className="w-4 h-4 text-amber-600" />
                Mật khẩu quản trị
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsChangingPassword(!isChangingPassword);
                  setPasswordError(null);
                  setPasswordSuccess(null);
                }}
                className="text-xs font-bold text-amber-700 hover:underline"
              >
                {isChangingPassword ? 'Đóng form' : 'Đổi mật khẩu'}
              </button>
            </div>

            {isChangingPassword ? (
              <form onSubmit={handleChangePassword} className="mt-3 space-y-2.5 pt-2 border-t border-slate-200 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Mật khẩu hiện tại *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Mặc định là 11111111"
                      className="w-full px-3 py-2 pr-9 bg-white border border-slate-300 rounded-lg text-xs"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Mật khẩu mới *</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Nhập lại mật khẩu mới *</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Xác nhận mật khẩu mới"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                    required
                  />
                </div>

                {passwordError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center gap-1.5 font-bold">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsChangingPassword(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 font-semibold"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg font-bold flex items-center gap-1 shadow-xs transition"
                  >
                    <Lock className="w-3.5 h-3.5" /> Lưu mật khẩu mới
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                Mật khẩu mặc định là <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-900 font-mono font-bold">11111111</code>. Bấm "Đổi mật khẩu" ở trên để đổi sang mật khẩu riêng của bạn.
              </p>
            )}
          </div>
        )}

        {/* Switch Between 2 Admin Accounts or Teacher */}
        {!isSupabaseConfigured && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-600 mb-2">Chuyển đổi tài khoản quản trị:</div>
            <div className="space-y-1.5">
              {ADMIN_ACCOUNTS.map((acc) => {
                const isCurrent = currentUser.email.toLowerCase() === acc.email.toLowerCase();
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      if (onSwitchAccount) {
                        onSwitchAccount(acc);
                        onClose();
                      }
                    }}
                    className={`w-full py-2 px-3 rounded-lg border text-left text-xs font-semibold flex items-center justify-between transition ${
                      isCurrent
                        ? 'border-amber-400 bg-amber-50 text-slate-950 font-bold'
                        : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="truncate">
                      <div className="truncate">{acc.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{acc.email}</div>
                    </div>
                    {isCurrent ? (
                      <span className="shrink-0 text-[10px] text-amber-950 bg-amber-200 px-1.5 py-0.5 rounded-full border border-amber-300 font-bold">Đang dùng</span>
                    ) : (
                      <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}

              {onSwitchRole && (
                <button
                  type="button"
                  onClick={() => {
                    const nextRole = currentUser.role === 'owner' ? 'teacher' : 'owner';
                    onSwitchRole(nextRole);
                    onClose();
                  }}
                  className="w-full mt-2 py-2 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                  {currentUser.role === 'owner' ? 'Chuyển sang Giáo viên (Cô Mai Anh)' : 'Chuyển sang Chủ Trung Tâm'}
                </button>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          disabled={isSubmitting}
          className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2 transition"
        >
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </section>
    </div>
  );
};
