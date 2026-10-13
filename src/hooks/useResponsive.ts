import { useEffect, useState } from 'react';

export const DRAWER_QUERY = '(max-width: 1023px)';
export const COMPACT_QUERY = '(max-width: 767px)';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

// Reflow on rotation/resizing until the user explicitly chooses a view.
export function useResponsiveView<T extends string>(compactView: T, wideView: T) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const [choice, setChoice] = useState<T | null>(null);
  return [choice ?? (compact ? compactView : wideView), setChoice] as const;
}
