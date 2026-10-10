import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { initReloadDetector, preventAutoReload } from './lib/reloadDebugger.ts';

// Monitor and safeguard against infinite reload loops
try {
  initReloadDetector();
  preventAutoReload();
} catch (err) {
  console.debug('Reload detector init skipped:', err);
}

// Register Service Worker for PWA installation
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
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
