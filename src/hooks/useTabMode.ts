import { useState, useEffect } from 'react';

export const TAB_MODE_KEY = 'or_tab_mode';
export const TAB_MODE_EVENT = 'or-tab-mode-changed';

export function useTabMode(): boolean {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(TAB_MODE_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const handler = () => {
      try { setEnabled(localStorage.getItem(TAB_MODE_KEY) === 'true'); } catch {}
    };
    window.addEventListener(TAB_MODE_EVENT, handler);
    return () => window.removeEventListener(TAB_MODE_EVENT, handler);
  }, []);

  return enabled;
}
