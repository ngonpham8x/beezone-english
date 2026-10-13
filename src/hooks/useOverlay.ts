import { RefObject, useEffect, useRef } from 'react';

const overlays: HTMLElement[] = [];
let savedOverflow = '';
let savedPadding = '';

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
    .filter(element => {
      if (element.matches(':disabled, [tabindex="-1"], input[type="hidden"]')) return false;
      for (let node: HTMLElement | null = element; node && node !== root.parentElement; node = node.parentElement) {
        if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    });
}

// The topmost overlay owns focus. A shared lock also covers nested dialogs.
export function useOverlay(ref: RefObject<HTMLElement | null>, active: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (overlays.length === 0) {
      savedOverflow = document.body.style.overflow;
      savedPadding = document.body.style.paddingRight;
      const gutter = document.documentElement.clientWidth ? window.innerWidth - document.documentElement.clientWidth : 0;
      document.body.style.overflow = 'hidden';
      if (gutter > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`;
    }
    overlays.push(root);
    if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });
    const topmost = () => overlays.at(-1) === root;
    const keydown = (event: KeyboardEvent) => {
      if (!topmost()) return;
      if (event.key === 'Escape' && !event.isComposing && closeRef.current) {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements(root);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (topmost() && !root.contains(event.target as Node)) root.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', containFocus);
      const wasTopmost = topmost();
      const index = overlays.indexOf(root);
      if (index >= 0) overlays.splice(index, 1);
      if (overlays.length === 0) {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPadding;
      }
      if (wasTopmost) {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        else overlays.at(-1)?.focus({ preventScroll: true });
      }
    };
  }, [active, ref]);
}
