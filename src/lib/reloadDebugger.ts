/**
 * Công cụ debug và sửa lỗi auto-reload
 * Tìm và khắc phục vòng lặp vô hạn
 */
import React, { useState, useEffect, type EffectCallback, type DependencyList } from 'react';

interface ReloadTracker {
  reloadCount: number;
  lastReloadTime: number;
  timestamps: number[];
}

const RELOAD_THRESHOLD = 8; // Số lần reload trong 10 giây (nâng lên 8 để tránh false positive khi dev HMR)
const RELOAD_WINDOW = 10000; // 10 giây

// Lưu thông tin reload vào sessionStorage
export function initReloadDetector() {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;

  const tracker: ReloadTracker = {
    reloadCount: 0,
    lastReloadTime: Date.now(),
    timestamps: []
  };

  // Lấy dữ liệu cũ nếu có
  const existing = sessionStorage.getItem('_reload_tracker');
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as ReloadTracker;
      const now = Date.now();
      
      // Lọc timestamps ngoài cửa sổ 10 giây
      parsed.timestamps = (parsed.timestamps || []).filter(t => now - t < RELOAD_WINDOW);
      
      if (parsed.timestamps.length >= RELOAD_THRESHOLD) {
        // Có dấu hiệu vòng lặp reload vô hạn
        console.error('🚨 Phát hiện reload vô hạn! Ngừng xử lý để tránh crash.');
        
        // Xóa sessionStorage để reset
        sessionStorage.removeItem('_reload_tracker');
        
        // Hiển thị thông báo người dùng
        showReloadWarning();
        
        // Không throw unhandled error gây white screen ngoài ý muốn, chỉ cảnh báo
        return;
      }
      tracker.timestamps = parsed.timestamps;
      tracker.reloadCount = parsed.reloadCount || 0;
    } catch {
      console.log('Không thể parse reload tracker, reset...');
      sessionStorage.removeItem('_reload_tracker');
    }
  }

  // Ghi timestamp hiện tại
  tracker.timestamps.push(Date.now());
  tracker.reloadCount += 1;
  try {
    sessionStorage.setItem('_reload_tracker', JSON.stringify(tracker));
  } catch {
    // sessionStorage quota or security restriction
  }

  if (tracker.reloadCount > 1) {
    console.log(`📊 Lần load thứ ${tracker.reloadCount}`);
  }
}

function showReloadWarning() {
  if (typeof document === 'undefined' || document.getElementById('_reload_warning')) return;

  const warning = document.createElement('div');
  warning.id = '_reload_warning';
  warning.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: Arial, sans-serif;
  `;
  
  warning.innerHTML = `
    <div style="
      background: white;
      padding: 40px;
      border-radius: 12px;
      text-align: center;
      max-width: 500px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    ">
      <div style="font-size: 48px; margin-bottom: 20px;">🔄</div>
      <h2 style="color: #dc2626; margin: 0 0 10px 0; font-size: 24px;">
        Phát Hiện Reload Vô Hạn
      </h2>
      <p style="color: #666; margin: 0 0 30px 0; font-size: 14px;">
        Hệ thống phát hiện ứng dụng tự reload liên tục. 
        Điều này thường do:
      </p>
      <ul style="
        text-align: left;
        color: #666;
        font-size: 14px;
        margin: 0 0 30px 0;
      ">
        <li>❌ useEffect không có hoặc sai dependencies</li>
        <li>❌ Gọi window.location.reload() hoặc window.location.href = '/'</li>
        <li>❌ Vòng lặp state vô hạn (state thay đổi liên tục)</li>
        <li>❌ Infinite loop trong API call</li>
      </ul>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 30px; font-size: 12px; color: #666; font-family: monospace;">
        <p style="margin: 0; word-break: break-all;">
          Hãy kiểm tra Browser DevTools > Console để xem lỗi chi tiết
        </p>
      </div>
      
      <button onclick="window.location.href = '/'" style="
        background: #3b82f6;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
      ">
        Quay Lại Trang Chủ
      </button>
      
      <button onclick="location.reload()" style="
        background: #6b7280;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        margin-left: 10px;
      ">
        Refresh Trang
      </button>
    </div>
  `;
  
  document.body.appendChild(warning);
}

/**
 * Hook để debug useEffect
 */
export function useEffectDebug(
  effect: EffectCallback,
  deps?: DependencyList,
  label?: string
) {
  useEffect(() => {
    const start = performance.now();
    console.log(`⏱️ [${label || 'useEffect'}] started at ${new Date().toLocaleTimeString()}`);
    
    const cleanup = effect();
    
    return () => {
      const duration = (performance.now() - start).toFixed(2);
      console.log(`⏱️ [${label || 'useEffect'}] cleanup called (ran for ${duration}ms)`);
      cleanup?.();
    };
  }, deps);
}

/**
 * Phát hiện và cảnh báo state vòng lặp
 */
export function createStateDebugger<T>(initialValue: T, label: string) {
  const [value, setValue] = useState<T>(initialValue);
  const [setCount, setSetCount] = useState(0);
  
  return [
    value,
    (newValue: T | ((prev: T) => T)) => {
      setSetCount((prev: number) => {
        const next = prev + 1;
        if (next > 50) {
          console.error(`⚠️ [${label}] Cảnh báo: setState được gọi ${next} lần trong vòng render ngắn!`);
          console.error('Điều này có thể dẫn đến vòng lặp vô hạn');
        }
        return next;
      });
      console.log(`📝 [${label}] State updated, count: ${setCount + 1}`);
      setValue(newValue);
    }
  ] as const;
}

/**
 * Ngăn chặn window.location.reload() và window.location.href = '/' không kiểm soát
 */
export function preventAutoReload() {
  if (typeof window === 'undefined') return;

  // Ghi lại window.location.reload
  try {
    const originalReload = window.location.reload.bind(window.location);
    window.location.reload = function() {
      console.warn('🚫 Phát hiện gọi window.location.reload()');
      console.trace('Stack trace gọi reload');
      originalReload();
    };
  } catch (err) {
    console.debug('Không thể override window.location.reload', err);
  }

  // Ghi lại việc thay đổi window.location.href một cách an toàn
  try {
    let originalHref = window.location.href;
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      get() {
        return originalHref;
      },
      set(value: string) {
        console.warn(`🚫 Phát hiện thay đổi window.location.href = '${value}'`);
        console.trace('Stack trace gọi location.href');
        
        if (value === '/' || value.endsWith('/')) {
          console.error('Đang cố redirect về trang chủ!');
        }
        originalHref = value;
        window.location.assign(value);
      }
    });
  } catch (err) {
    // Browsers like Chrome disallow redefining location.href
    console.debug('Không thể override window.location.href', err);
  }
}

/**
 * Giám sát và log tất cả state changes
 */
export function enableStateLogging() {
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Ghi lại tất cả lỗi
  console.error = function(...args) {
    if (args.some(arg => String(arg).includes('dependency'))) {
      console.log('🔴 Phát hiện lỗi dependency:', args);
    }
    originalError.apply(console, args);
  };

  console.warn = function(...args) {
    if (args.some(arg => String(arg).includes('infinite'))) {
      console.log('🟡 Phát hiện cảnh báo infinite:', args);
    }
    originalWarn.apply(console, args);
  };
}

export default {
  initReloadDetector,
  preventAutoReload,
  enableStateLogging,
  useEffectDebug,
  createStateDebugger
};
