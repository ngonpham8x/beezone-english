import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

// Native scrollbars may be hidden by the OS. Keep an independent control
// above wide tables so reaching the final columns does not require scrolling down.
export const HorizontalScroll = forwardRef<HTMLDivElement, HorizontalScrollProps>(function HorizontalScroll(
  { children, label = 'Bảng dữ liệu', className = '', onScroll, onKeyDown, ...props }, forwardedRef,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ max: 0, position: 0 });
  useImperativeHandle(forwardedRef, () => viewportRef.current!, []);

  const measure = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const position = Math.max(0, Math.min(max, viewport.scrollLeft));
    setScroll(previous => previous.max === max && previous.position === position ? previous : { max, position });
  };
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    Array.from(viewport.children).forEach(child => observer?.observe(child));
    measure();
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [children]);

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const left = Math.max(0, Math.min(max, viewport.scrollLeft + direction * Math.max(200, viewport.clientWidth * 0.75)));
    viewport.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return <div className="min-w-0">
    {scroll.max > 1 && <div role="group" aria-label={`${label}: điều khiển cuộn ngang`} className="horizontal-scroll-controls print:hidden">
      <button type="button" onClick={() => move(-1)} disabled={scroll.position <= 1} aria-label={`${label}: cuộn trái`}><ChevronLeft className="h-4 w-4" /></button>
      <input type="range" min={0} max={scroll.max} step={1} value={scroll.position} aria-label={`${label}: vị trí cuộn ngang`} onChange={event => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.scrollLeft = Number(event.target.value);
        measure();
      }} />
      <button type="button" onClick={() => move(1)} disabled={scroll.position >= scroll.max - 1} aria-label={`${label}: cuộn phải`}><ChevronRight className="h-4 w-4" /></button>
    </div>}
    <div {...props} ref={viewportRef} role="region" aria-label={label} tabIndex={scroll.max > 1 ? 0 : undefined} className={`horizontal-scroll-viewport overflow-x-auto custom-scrollbar ${className}`} onScroll={event => { measure(); onScroll?.(event); }} onKeyDown={event => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.target !== event.currentTarget) return;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const left = event.key === 'Home' ? 0 : event.key === 'End' ? max : event.key === 'ArrowLeft' ? viewport.scrollLeft - 80 : event.key === 'ArrowRight' ? viewport.scrollLeft + 80 : null;
      if (left === null) return;
      event.preventDefault();
      viewport.scrollLeft = Math.max(0, Math.min(max, left));
      measure();
    }}>{children}</div>
  </div>;
});
