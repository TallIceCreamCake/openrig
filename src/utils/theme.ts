export type ThemeMode = 'system' | 'light' | 'dark';
export type DensityMode = 'compact' | 'comfortable' | 'spacious';
export type NavThemePreset = 'light' | 'semi-dark' | 'dark';

export const NAV_THEME_PRESET_STORAGE_KEY = 'ui_nav_theme_preset';

export const NAV_THEME_PRESETS: Record<NavThemePreset, { label: string; colors: { sidebarBackground: string; sidebarText: string; topbarBackground: string; topbarText: string } }> = {
  light: {
    label: 'Clair',
    colors: { sidebarBackground: '#ffffff', sidebarText: '#1f2937', topbarBackground: '#ffffff', topbarText: '#1f2937' },
  },
  'semi-dark': {
    label: 'Semi sombre',
    colors: { sidebarBackground: '#1e2435', sidebarText: '#ffffff', topbarBackground: '#ffffff', topbarText: '#1f2937' },
  },
  dark: {
    label: 'Sombre',
    colors: { sidebarBackground: '#1e2435', sidebarText: '#ffffff', topbarBackground: '#1e2435', topbarText: '#ffffff' },
  },
};

export const getNavThemePreset = (): NavThemePreset => {
  try {
    const raw = localStorage.getItem(NAV_THEME_PRESET_STORAGE_KEY);
    if (raw === 'light' || raw === 'semi-dark' || raw === 'dark') return raw;
  } catch {}
  return 'light';
};

export type NavigationColorConfig = {
  sidebarBackground: string;
  sidebarText: string;
  topbarBackground: string;
  topbarText: string;
};

export const NAVIGATION_COLORS_STORAGE_KEY = 'ui_navigation_colors';

export const DEFAULT_NAVIGATION_COLORS: NavigationColorConfig = {
  sidebarBackground: '#ffffff',
  sidebarText: '#1f2937',
  topbarBackground: '#ffffff',
  topbarText: '#1f2937',
};

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const normalizeHexColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [r, g, b] = withHash.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toLowerCase();
  }
  return fallback;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHexColor(hex, '#000000');
  const base = normalized.slice(1);
  return {
    r: parseInt(base.slice(0, 2), 16),
    g: parseInt(base.slice(2, 4), 16),
    b: parseInt(base.slice(4, 6), 16),
  };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${clampByte(r).toString(16).padStart(2, '0')}${clampByte(g).toString(16).padStart(2, '0')}${clampByte(b).toString(16).padStart(2, '0')}`;

const mixHex = (baseHex: string, targetHex: string, weight: number) => {
  const w = Math.max(0, Math.min(1, weight));
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  return rgbToHex(
    base.r + (target.r - base.r) * w,
    base.g + (target.g - base.g) * w,
    base.b + (target.b - base.b) * w,
  );
};

const luminance = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const deriveSurfaceStates = (background: string) => {
  const isDark = luminance(background) < 0.45;
  if (isDark) {
    return {
      hover: mixHex(background, '#ffffff', 0.1),
      active: mixHex(background, '#ffffff', 0.18),
      border: mixHex(background, '#ffffff', 0.24),
      inputBg: mixHex(background, '#ffffff', 0.08),
      inputBorder: mixHex(background, '#ffffff', 0.22),
      placeholder: mixHex(background, '#ffffff', 0.5),
    };
  }
  return {
    hover: mixHex(background, '#000000', 0.05),
    active: mixHex(background, '#000000', 0.1),
    border: mixHex(background, '#000000', 0.15),
    inputBg: '#ffffff',
    inputBorder: mixHex(background, '#000000', 0.16),
    placeholder: mixHex(background, '#000000', 0.45),
  };
};

export const normalizeNavigationColors = (value?: Partial<NavigationColorConfig> | null): NavigationColorConfig => ({
  sidebarBackground: normalizeHexColor(value?.sidebarBackground, DEFAULT_NAVIGATION_COLORS.sidebarBackground),
  sidebarText: normalizeHexColor(value?.sidebarText, DEFAULT_NAVIGATION_COLORS.sidebarText),
  topbarBackground: normalizeHexColor(value?.topbarBackground, DEFAULT_NAVIGATION_COLORS.topbarBackground),
  topbarText: normalizeHexColor(value?.topbarText, DEFAULT_NAVIGATION_COLORS.topbarText),
});

export const getNavigationColors = (): NavigationColorConfig => {
  if (typeof window === 'undefined') return DEFAULT_NAVIGATION_COLORS;
  try {
    const raw = window.localStorage.getItem(NAVIGATION_COLORS_STORAGE_KEY);
    if (!raw) return DEFAULT_NAVIGATION_COLORS;
    const parsed = JSON.parse(raw);
    return normalizeNavigationColors(parsed);
  } catch {
    return DEFAULT_NAVIGATION_COLORS;
  }
};

export const applyNavigationColors = (
  value?: Partial<NavigationColorConfig> | null,
  persist = true,
): NavigationColorConfig => {
  const colors = normalizeNavigationColors(value ?? getNavigationColors());
  const root = document.documentElement;

  const sidebarStates = deriveSurfaceStates(colors.sidebarBackground);
  const topbarStates = deriveSurfaceStates(colors.topbarBackground);

  root.style.setProperty('--sidebar-bg', colors.sidebarBackground);
  root.style.setProperty('--sidebar-text', colors.sidebarText);
  root.style.setProperty('--sidebar-muted-text', mixHex(colors.sidebarText, colors.sidebarBackground, 0.42));
  root.style.setProperty('--sidebar-hover-bg', sidebarStates.hover);
  root.style.setProperty('--sidebar-active-bg', sidebarStates.active);
  root.style.setProperty('--sidebar-border', sidebarStates.border);

  root.style.setProperty('--topbar-bg', colors.topbarBackground);
  root.style.setProperty('--topbar-text', colors.topbarText);
  root.style.setProperty('--topbar-muted-text', mixHex(colors.topbarText, colors.topbarBackground, 0.42));
  root.style.setProperty('--topbar-hover-bg', topbarStates.hover);
  root.style.setProperty('--topbar-active-bg', topbarStates.active);
  root.style.setProperty('--topbar-border', topbarStates.border);
  root.style.setProperty('--topbar-input-bg', topbarStates.inputBg);
  root.style.setProperty('--topbar-input-border', topbarStates.inputBorder);
  root.style.setProperty('--topbar-input-text', colors.topbarText);
  root.style.setProperty('--topbar-input-placeholder', topbarStates.placeholder);

  // Tab indicator: white on dark topbar, accent on light topbar
  const topbarIsDark = luminance(colors.topbarBackground) < 0.45;
  root.style.setProperty('--topbar-tab-indicator', topbarIsDark ? '#ffffff' : 'var(--accent, #2563eb)');
  root.style.setProperty('--topbar-tab-active-text', topbarIsDark ? '#ffffff' : 'var(--accent, #2563eb)');

  if (persist) {
    try {
      window.localStorage.setItem(NAVIGATION_COLORS_STORAGE_KEY, JSON.stringify(colors));
    } catch {
      // Ignore storage write failures and keep applying colors in-memory.
    }
  }

  return colors;
};

export const resolveTheme = (mode?: ThemeMode): 'light' | 'dark' => {
  const m = mode || (localStorage.getItem('ui_theme') as ThemeMode) || 'system';
  if (m === 'light') return 'light';
  if (m === 'dark') return 'dark';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

export const applyTheme = (mode?: ThemeMode) => {
  try {
    if (mode) localStorage.setItem('ui_theme', mode);
  } catch {}
  const effective = resolveTheme(mode);
  const root = document.documentElement;
  if (effective === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
};

export const applyDensity = (density?: DensityMode) => {
  let d = density || (localStorage.getItem('ui_density') as DensityMode) || 'comfortable';
  try { localStorage.setItem('ui_density', d); } catch {}
  const root = document.documentElement;
  root.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
  root.classList.add(`density-${d}`);
};
