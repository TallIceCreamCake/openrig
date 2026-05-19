import { StrictMode } from 'react';
import { Buffer } from 'buffer';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyTheme, applyDensity, applyNavigationColors } from './utils/theme';

// Polyfills for libraries expecting Node globals in browser (e.g., draft-js)
declare global {
  interface Window { global: any; process: any; Buffer?: typeof Buffer }
}
if (typeof window !== 'undefined') {
  (window as any).global = window as any;
  (window as any).process = (window as any).process || { env: {} };
  (window as any).Buffer = (window as any).Buffer || Buffer;
}

// Apply theme as early as possible
try { applyTheme(); applyDensity(); applyNavigationColors(); } catch {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
