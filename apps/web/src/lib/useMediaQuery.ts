import { useCallback, useSyncExternalStore } from 'react';

/** Tracks a CSS media query, re-rendering when it starts or stops matching. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Phone layout breakpoint, kept in sync with the `max-width: 680px` CSS rules. */
export const PHONE_QUERY = '(max-width: 680px)';
