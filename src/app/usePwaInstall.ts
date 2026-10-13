import { useEffect, useState } from 'react';
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export function usePwaInstall() {
  const [isPwaModalOpen, setIsPwaModalOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPrompt | null>(null);

  // Global listener for PWA install prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleTriggerPwaInstall = async () => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      (ua.includes('macintosh') && window.navigator.maxTouchPoints > 1);

    // Riêng iPhone/iPad: hiển thị ngay hướng dẫn cài đặt cho iPhone
    if (isIos) {
      setIsPwaModalOpen(true);
      return;
    }

    // Android & máy tính (Chrome, Edge): nếu trình duyệt sẵn sàng thì tự cài luôn
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.error('PWA install error:', err);
        setIsPwaModalOpen(true);
      }
      return;
    }

    // Nếu không có native prompt (đã cài hoặc cần thao tác tay), mở hướng dẫn chi tiết
    setIsPwaModalOpen(true);
  };

  return {
    isPwaModalOpen,
    setIsPwaModalOpen,
    deferredPrompt,
    setDeferredPrompt,
    handleTriggerPwaInstall,
  };
}
export type PwaInstall = ReturnType<typeof usePwaInstall>;
