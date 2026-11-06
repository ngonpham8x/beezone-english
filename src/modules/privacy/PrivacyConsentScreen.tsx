import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { CenterSettings } from '../../types';
import { PrivacyPolicyDialog } from './PrivacyPolicyDialog';
import { PRIVACY_POLICY_VERSION } from './privacyPolicy';

interface Props {
  settings: Pick<CenterSettings, 'name' | 'address' | 'phone' | 'email'>;
  onAccept: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function PrivacyConsentScreen({ settings, onAccept, onLogout }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
    <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" />
      <h1 className="mt-3 text-center text-xl font-black text-slate-950">Xác nhận bảo vệ dữ liệu cá nhân</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Trước khi tải dữ liệu trung tâm, hãy đọc chính sách phiên bản {PRIVACY_POLICY_VERSION}. Hệ thống cần xử lý danh tính Google, quyền tài khoản, nhật ký bảo mật và dữ liệu nghiệp vụ phù hợp với vai trò của bạn.</p>
      <button type="button" onClick={() => setShowPolicy(true)} className="mt-3 min-h-11 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900">Đọc chính sách quyền riêng tư</button>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-5">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
        <span>Tôi đã đọc, hiểu và đồng ý cho phép xử lý dữ liệu cho các mục đích xác thực, vận hành trung tâm và bảo mật/nhật ký nêu trong chính sách.</span>
      </label>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={submitting} onClick={() => void onLogout()} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700">Đăng xuất</button>
        <button type="button" disabled={!accepted || submitting} onClick={async () => {
          setSubmitting(true); setError(null);
          try { await onAccept(); } catch { setError('Không thể lưu xác nhận trên máy chủ. Hãy kiểm tra kết nối và thử lại.'); setSubmitting(false); }
        }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-50">
          {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />} Xác nhận và tiếp tục
        </button>
      </div>
    </section>
    <PrivacyPolicyDialog isOpen={showPolicy} onClose={() => setShowPolicy(false)} settings={settings} />
  </main>;
}
