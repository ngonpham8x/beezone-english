import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { initReloadDetector, preventAutoReload } from './lib/reloadDebugger.ts';

if (import.meta.env.DEV) {
  try {
    initReloadDetector();
    preventAutoReload();
  } catch (e) {
    console.error('Lỗi khởi tạo reload debugger:', e);
  }
}

// Register Service Worker for PWA installation
if ('serviceWorker' in navigator && (import.meta.env.PROD || process.env.NODE_ENV === 'production')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((err) => {
      console.log('SW registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);

