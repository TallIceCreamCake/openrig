export type InterfaceMode = 'classic' | 'depot';

const INTERFACE_MODE_STORAGE_KEY = 'or_interface_mode';

export const isInterfaceMode = (value: string | null | undefined): value is InterfaceMode =>
  value === 'classic' || value === 'depot';

export const getPreferredInterfaceMode = (): InterfaceMode => {
  if (typeof window === 'undefined') return 'classic';
  try {
    const saved = window.localStorage.getItem(INTERFACE_MODE_STORAGE_KEY);
    if (isInterfaceMode(saved)) return saved;
  } catch (error) {
    console.error('interface mode read error', error);
  }
  return 'classic';
};

export const setPreferredInterfaceMode = (mode: InterfaceMode) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INTERFACE_MODE_STORAGE_KEY, mode);
  } catch (error) {
    console.error('interface mode write error', error);
  }
};

export const shouldUseMobileInterface = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
  const isSmallScreen = window.matchMedia?.('(max-width: 900px)')?.matches ?? window.innerWidth <= 900;
  return isMobileUa && isSmallScreen;
};

export const resolvePostLoginPath = (
  mustChangePassword: boolean,
  preferredMode: InterfaceMode,
) => {
  if (mustChangePassword) return '/first-login';
  if (preferredMode === 'depot') return '/depot';
  return shouldUseMobileInterface() ? '/m' : '/';
};

