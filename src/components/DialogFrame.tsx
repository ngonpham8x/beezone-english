import React, { useEffect, useRef } from 'react';
import { useOverlay } from '../hooks/useOverlay';

interface DialogFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  label: string;
}

export function DialogFrame({ children, onClose, label, className = '', ...props }: DialogFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
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
  return <div {...props} ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`dialog-viewport ${className}`}>{children}</div>;
}
