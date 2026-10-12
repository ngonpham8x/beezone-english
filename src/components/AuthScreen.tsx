import React, { useState } from 'react';
import { LoaderCircle, ShieldCheck, AlertTriangle, ArrowRight, Lock, Mail, Eye, EyeOff, KeyRound, MapPin, Phone } from 'lucide-react';
import { Logo } from './Logo';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ADMIN_ACCOUNTS, verifyAdminPassword, findAdminAccountByEmail, DEFAULT_ADMIN_PASSWORD } from '../lib/auth';
import { UserAccount } from '../types';

interface AuthScreenProps {
  onDevLogin?: (role: 'owner' | 'teacher') => void;
  onAccountLogin?: (account: UserAccount) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onDevLogin, onAccountLogin }) => {
  const [selectedEmail, setSelectedEmail] = useState<string>(ADMIN_ACCOUNTS[0].email);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdminPasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normEmail = selectedEmail.trim().toLowerCase();
    const account = findAdminAccountByEmail(normEmail);

    if (!account) {
      setError(`Email "${selectedEmail}" không thuộc danh sách quản trị trung tâm.`);
      return;
    }

    if (!password) {
      setError('Vui lòng nhập mật khẩu. Mật khẩu mặc định là 11111111.');
      return;
    }

    if (!verifyAdminPassword(normEmail, password)) {
      setError('Mật khẩu không chính xác. Mật khẩu mặc định là 11111111 (hoặc mật khẩu mới nếu bạn đã đổi).');
      return;
    }

    if (onAccountLogin) {
      onAccountLogin(account);
    } else if (onDevLogin) {
      onDevLogin('owner');
    }
  };

  const handleFillDefaultPassword = () => {
    setPassword(DEFAULT_ADMIN_PASSWORD);
    setError(null);
  };

  const handleGoogleLogin = async () => {
    if (!supabase) return;

    setError(null);
    setIsSubmitting(true);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (oauthError) {
      setError('Không thể kết nối Google OAuth. Vui lòng kiểm tra lại cấu hình.');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-900 to-amber-950/80 grid place-items-center p-4">
      <section className="max-w-md w-full bg-white rounded-3xl border border-amber-300/30 shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-5">
          <Logo size={82} className="mx-auto mb-2.5 shadow-md" />
          <h1 className="font-extrabold text-slate-900 text-lg uppercase tracking-wide">
            Trung tâm ngoại ngữ BeeZone
          </h1>
          <p className="text-xs text-amber-600 font-bold mt-0.5 tracking-wide">BEEZONE ENGLISH LANGUAGE CENTER</p>

          <div className="mt-2.5 space-y-0.5 text-[11px] text-slate-500 bg-slate-50 border border-amber-200/60 rounded-xl p-2.5 text-left">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>111 Ngô Quyền, Long Hải, Long Hoa, Tây Ninh</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <Phone className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>Hotline: 0847563679</span>
            </div>
            <div className="flex items-start gap-1.5 font-medium text-slate-700 pt-0.5">
              <Mail className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
              <div className="truncate">
                <span className="block truncate text-slate-900 font-bold">beezone.englishcenter@gmail.com</span>
                <span className="block truncate text-slate-600">chauoaingua679@gmail.com</span>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Login Form */}
        <form onSubmit={handleAdminPasswordLogin} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Email Quản Trị Trung Tâm *
            </label>
            <div className="space-y-1.5">
              {ADMIN_ACCOUNTS.map((acc) => {
                const isChecked = selectedEmail.toLowerCase() === acc.email.toLowerCase();
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setSelectedEmail(acc.email);
                      setError(null);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left transition flex items-center justify-between text-xs ${
                      isChecked
                        ? 'border-amber-500 bg-amber-50/80 text-slate-950 font-bold shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="truncate">{acc.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono ml-3.5 truncate">{acc.email}</div>
                    </div>
                    {isChecked && <span className="text-[10px] text-amber-800 bg-amber-200/70 px-1.5 py-0.5 rounded-md font-bold shrink-0">Đã chọn</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800">
                Mật khẩu *
              </label>
              <button
                type="button"
                onClick={handleFillDefaultPassword}
                className="text-[10px] font-bold text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1"
                title="Điền mật khẩu mặc định 11111111"
              >
                <KeyRound className="w-3 h-3" /> Điền mặc định: 11111111
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Nhập mật khẩu (mặc định: 11111111)"
                className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-hidden bg-white"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Mật khẩu mặc định là <strong className="font-mono text-amber-900 font-bold bg-amber-100/80 px-1 py-0.5 rounded">11111111</strong>. Chủ trung tâm có thể đổi lại mật khẩu khi đăng nhập.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-800 text-center font-semibold">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-slate-950 py-3 text-xs font-black shadow-md shadow-amber-400/20 flex items-center justify-center gap-2 transition active:scale-[0.99] border border-amber-300/40"
          >
            <Lock className="w-4 h-4 text-slate-950" />
            Đăng Nhập Quản Trị Trung Tâm
          </button>
        </form>

        {/* Secondary login options */}
        <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
          <button
            type="button"
            onClick={() => onDevLogin?.('teacher')}
            className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 p-2.5 text-left transition flex items-center justify-between border border-slate-200 text-xs font-semibold"
          >
            <div className="flex items-center gap-2.5 truncate">
              <span className="text-base">👩‍🏫</span>
              <div className="truncate">
                <div>Đăng nhập Giáo Viên (Cô Mai Anh)</div>
                <div className="text-[10px] text-slate-500 truncate">Điểm danh & Chấm điểm lớp phụ trách</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isSupabaseConfigured && (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 py-2.5 text-xs font-bold text-white flex items-center justify-center gap-2 transition"
            >
              {isSubmitting ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.54 0 2.93.56 4.02 1.48l3.02-3.02C17.22 1.8 14.77 1 12 1 7.4 1 3.49 3.59 1.55 7.41l3.66 2.84C6.1 7.41 8.8 5 12 5z" />
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.69 2.86c2.16-2 3.73-4.94 3.73-8.68z" />
                  <path fill="#FBBC05" d="M5.21 14.75c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29L1.55 7.33C.56 9.3 0 11.51 0 13.91s.56 4.61 1.55 6.58l3.66-2.74z" />
                  <path fill="#34A853" d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.69-2.86c-1.07.72-2.44 1.16-4.24 1.16-3.2 0-5.9-2.41-6.87-5.25L1.55 16.9C3.49 20.73 7.4 23 12 23z" />
                </svg>
              )}
              Đăng nhập với Google
            </button>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Bảo mật phân quyền Chủ trung tâm & Giáo viên</span>
        </div>
      </section>
    </main>
  );
};
