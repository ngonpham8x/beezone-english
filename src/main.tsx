import { reportError } from './lib/diagnostics';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationDialogs } from './components/NotificationDialogs';

// Register Service Worker for PWA installation
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((err) => {
      reportError('pwa.register', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ErrorBoundary><App /><NotificationDialogs /></ErrorBoundary>
    </LanguageProvider>
  </StrictMode>,
);

