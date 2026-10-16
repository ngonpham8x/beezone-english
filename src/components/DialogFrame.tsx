import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useOverlay } from '../hooks/useOverlay';

// Keep popup portals in the owning dialog's focus and stacking context.
export const DialogPortalContext = createContext<HTMLElement | null>(null);

interface DialogFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  label: string;
}

export function DialogFrame({ children, onClose, label, className = '', ...props }: DialogFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const attachRef = useCallback((element: HTMLDivElement | null) => {
    ref.current = element;
    setPortalContainer(element);
  }, []);
  useOverlay(ref, true, onClose);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      ref.current?.style.setProperty('--dialog-height', `${viewport.height}px`);
      ref.current?.style.setProperty('--dialog-top', `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => { viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize); };
  }, []);
  return <DialogPortalContext.Provider value={portalContainer}>
    <div {...props} ref={attachRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`dialog-viewport ${className}`}>{children}</div>
  </DialogPortalContext.Provider>;
}
