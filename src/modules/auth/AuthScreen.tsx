import { LoaderCircle, MapPin, Phone, ShieldCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Logo } from '../../components/Logo';
import { localAuthAppUrl } from '../../lib/appUrl';
import { isGoogleSignInEnabled, isLocalPreview, supabase } from '../../lib/supabase';
import type { UserAccount } from '../../types';

interface AuthScreenProps {
  onDevLogin?: (role: 'owner' | 'teacher') => void;
  onAccountLogin?: (account: UserAccount) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onDevLogin }) => {
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash,
      );
      const desc = searchParams.get('error_description') || hashParams.get('error_description');
      const err = searchParams.get('error') || hashParams.get('error');
      if (desc) return decodeURIComponent(desc.replace(/\+/g, ' '));
      if (err) return `Lỗi đăng nhập: ${err}`;
    } catch {
      // ignore
    }
    return null;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const localEntryUrl = supabase && import.meta.env.DEV
    ? localAuthAppUrl(window.location.href, import.meta.env.VITE_LOCAL_AUTH_ORIGIN, import.meta.env.MODE)
    : null;
  // Only the signed-out screen moves origins. An active workspace keeps its edits/session.
  useEffect(() => {
    if (localEntryUrl) window.location.replace(localEntryUrl);
  }, [localEntryUrl]);
  const handleGoogleLogin = async () => {
    if (!supabase || isSubmitting) return;
    if (localEntryUrl) {
      window.location.replace(localEntryUrl);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (!await isGoogleSignInEnabled()) {
        setError('Đăng nhập Google chưa được bật. Vui lòng liên hệ quản trị viên để hoàn tất cấu hình.');
        setIsSubmitting(false);
        return;
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (oauthError) throw oauthError;
    } catch {
      setError('Không thể kết nối Google. Kiểm tra kết nối và thử lại.');
      setIsSubmitting(false);
    }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-zinc-900 to-amber-950 p-4">
      <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-4 flex justify-center">
          <Logo size={82} />
        </div>
        <h1 className="text-center text-xl font-extrabold text-slate-900">Trung tâm ngoại ngữ BeeZone</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Quản lý học viên, học vụ và học phí</p>
        <div className="my-6 space-y-2 rounded-xl bg-amber-50 p-4 text-xs text-slate-700">
          <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0" />111 Ngô Quyền, Long Hải, Long Hoa, Tây Ninh</p>
          <p className="flex gap-2"><Phone className="h-4 w-4" />Hotline: 0847563679</p>
        </div>
        {supabase ? (
          <>
            <button onClick={() => void handleGoogleLogin()} disabled={isSubmitting || !!localEntryUrl} aria-busy={isSubmitting || !!localEntryUrl} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {(isSubmitting || localEntryUrl) && <LoaderCircle className="h-4 w-4 animate-spin" />}{localEntryUrl ? 'Đang mở đăng nhập trên máy này…' : isSubmitting ? 'Đang mở Google…' : 'Đăng nhập với Google'}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">Dùng tài khoản Google đã được Chủ trung tâm cấp quyền.</p>
          </>
        ) : isLocalPreview ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Bản xem thử trên máy này. Các thay đổi chỉ lưu trong trình duyệt.</p>
            <button onClick={() => onDevLogin?.('owner')} className="min-h-11 w-full rounded-xl bg-amber-500 p-3 text-sm font-bold">Xem thử vai trò Chủ trung tâm</button>
            <button onClick={() => onDevLogin?.('teacher')} className="min-h-11 w-full rounded-xl bg-slate-100 p-3 text-sm font-bold">Xem thử vai trò Giáo viên</button>
          </div>
        ) : (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">Hệ thống chưa được cấu hình đăng nhập. Vui lòng liên hệ quản trị viên để hoàn tất kết nối Supabase.</p>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Phân quyền theo tài khoản</p>
      </section>
    </main>
  );
};
