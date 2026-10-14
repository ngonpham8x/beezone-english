import { reportError } from '../lib/diagnostics';
import { DialogFrame } from './DialogFrame';
import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, Share, PlusSquare, ArrowDownToLine, X, CheckCircle2, ShieldCheck, Sparkles, Check, Apple } from 'lucide-react';

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt?: any;
  onPromptHandled?: () => void;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt: externalPrompt,
  onPromptHandled
}) => {
  const [internalPrompt, setInternalPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');

  const deferredPrompt = externalPrompt || internalPrompt;

  useEffect(() => {
    // Detect OS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent) || (userAgent.includes('macintosh') && window.navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(userAgent);

    if (isIos) {
      setDeviceType('ios');
    } else if (isAndroid) {
      setDeviceType('android');
    } else {
      setDeviceType('desktop');
    }

    // Check if standalone
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInternalPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
        }
      } catch (err) {
        reportError('pwa.install', err);
      } finally {
        setInternalPrompt(null);
        onPromptHandled?.();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <DialogFrame label="Cài đặt ứng dụng" onClose={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="dialog-panel bg-white rounded-2xl max-h-[92vh] max-w-lg w-full overflow-y-auto p-6 shadow-2xl border border-slate-200 relative custom-scrollbar">
        {/* Top Branding Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/90 -mx-4 min-[480px]:-mx-6 -mt-6 p-5 text-white mb-5 relative border-b border-amber-500/30">
          <button aria-label="Đóng"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="BeeZone"
              className="w-12 h-12 rounded-xl object-contain bg-amber-400 p-1 shadow-md border-2 border-amber-300"
            />
            <div>
              <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs">
                <Sparkles className="w-3.5 h-3.5" /> Ứng Dụng Di Động & Máy Tính
              </div>
              <h3 className="text-base font-extrabold text-white">Cài Đặt Trung Tâm Ngoại Ngữ BeeZone</h3>
              <p className="text-[11px] text-amber-200/80">Truy cập tức thì từ Màn hình chính · Hoạt động như ứng dụng gốc</p>
            </div>
          </div>
        </div>

        {isInstalled ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-base font-bold text-slate-800">Ứng dụng đã được cài đặt!</h4>
            <p className="text-xs text-slate-600">
              Bạn có thể mở trực tiếp phần mềm từ biểu tượng BeeZone trên màn hình điện thoại hoặc máy tính của mình.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
            >
              Đóng Cửa Sổ
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Native Install Button if browser supports beforeinstallprompt */}
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-md transition-all border border-amber-400/50 active:scale-98"
              >
                <ArrowDownToLine className="w-5 h-5 text-slate-950" />
                Cài Đặt Ngay Vào Thiết Bị
              </button>
            )}

            {/* Platform Selection Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setDeviceType('ios')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                  deviceType === 'ios'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Apple className="w-3.5 h-3.5 text-amber-600" />
                <span>iPhone / iPad</span>
              </button>
              <button
                type="button"
                onClick={() => setDeviceType('android')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                  deviceType === 'android'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Android</span>
              </button>
              <button
                type="button"
                onClick={() => setDeviceType('desktop')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                  deviceType === 'desktop'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor className="w-3.5 h-3.5 text-blue-600" />
                <span>Máy tính (PC/Mac)</span>
              </button>
            </div>

            {/* Step-by-step Content */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              {deviceType === 'ios' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-200/60 pb-2 mb-2">
                    <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      <Apple className="w-4 h-4 text-amber-700" />
                      Hướng dẫn cài đặt trên iPhone & iPad (Safari)
                    </span>
                    <span className="text-[10px] text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                      iOS Safari
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Hệ điều hành iOS (Apple) không hỗ trợ nút cài đặt tự động từ trình duyệt. Bạn chỉ cần thực hiện 3 bước đơn giản sau:
                  </p>

                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="flex-1 text-slate-700">
                        Mở đường link trên trình duyệt <strong className="text-slate-900 font-bold">Safari</strong>, sau đó nhấn biểu tượng <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded font-bold text-blue-600"><Share className="w-3.5 h-3.5" /> Chia sẻ (Share)</span> ở thanh công cụ dưới đáy màn hình.
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="flex-1 text-slate-700">
                        Cuộn xuống danh sách tính năng và chọn <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded font-bold text-slate-900"><PlusSquare className="w-3.5 h-3.5 text-amber-600" /> Thêm vào MH chính (Add to Home Screen)</span>.
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="flex-1 text-slate-700">
                        Chạm vào chữ <strong className="text-amber-800 font-bold">"Thêm" (Add)</strong> ở góc trên bên phải màn hình. Biểu tượng ứng dụng <strong className="text-slate-900 font-bold">BeeZone</strong> sẽ xuất hiện ngay trên màn hình chính iPhone của bạn!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {deviceType === 'android' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2 mb-2">
                    <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      Hướng dẫn cài đặt trên Điện thoại Android
                    </span>
                    <span className="text-[10px] text-emerald-900 font-bold bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      Chrome / Cốc Cốc
                    </span>
                  </div>

                  <div className="space-y-2 text-slate-700">
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-slate-900">1.</span>
                      <span>Mở trình duyệt <strong className="text-slate-900">Chrome, Cốc Cốc hoặc Samsung Internet</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-slate-900">2.</span>
                      <span>Nhấn vào biểu tượng <strong className="text-slate-900">⋮ (Menu 3 chấm)</strong> ở góc trên bên phải màn hình.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-slate-900">3.</span>
                      <span>Chọn mục <strong className="text-amber-700 font-bold">"Cài đặt ứng dụng"</strong> hoặc <strong className="text-amber-700 font-bold">"Thêm vào màn hình chính"</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-slate-900">4.</span>
                      <span>Xác nhận <strong className="text-slate-900">Cài đặt</strong> để hoàn tất.</span>
                    </div>
                  </div>
                </div>
              )}

              {deviceType === 'desktop' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-2 mb-2">
                    <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      <Monitor className="w-4 h-4 text-blue-600" />
                      Cài đặt trên Máy tính (Windows / Mac)
                    </span>
                    <span className="text-[10px] text-blue-900 font-bold bg-blue-100 px-2 py-0.5 rounded-full border border-blue-300">
                      Chrome / Edge
                    </span>
                  </div>

                  <div className="space-y-2 text-slate-700">
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-slate-900">1.</span>
                      <span>Mở trình duyệt Google Chrome hoặc Microsoft Edge trên máy tính.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-slate-900">2.</span>
                      <span>Nhìn lên góc phải thanh địa chỉ (URL), bấm biểu tượng <strong className="text-amber-700">Cài đặt ứng dụng</strong> (hình màn hình có mũi tên xuống).</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-slate-900">3.</span>
                      <span>Hoặc bấm Menu <strong className="text-slate-900">⋮</strong> &gt; <strong className="text-slate-900">Lưu và chia sẻ</strong> &gt; <strong className="text-amber-700 font-bold">Cài đặt Trung tâm ngoại ngữ BeeZone</strong>.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 text-[11px] text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Biểu tượng BeeZone sẽ xuất hiện trên màn hình, mở toàn màn hình mượt mà không có thanh công cụ trình duyệt.</span>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors shadow-2xs"
              >
                Đã Hiểu
              </button>
            </div>
          </div>
        )}
      </div>
    </DialogFrame>
  );
};
