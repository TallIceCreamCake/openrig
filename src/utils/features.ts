export const isFeatureEnabled = (
  settings: { features?: unknown } | null | undefined,
  key: string,
  fallback = true,
): boolean => {
  if (!settings?.features) return fallback;
  try {
    const raw = settings.features as any;
    const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (map && typeof map === 'object' && key in map) {
      return Boolean((map as Record<string, unknown>)[key]);
    }
  } catch (err) {
    console.warn('features parse error', err);
  }
  return fallback;
};

export const setFeatureFlag = (
  settings: { features?: unknown } | null | undefined,
  key: string,
  value: boolean,
): Record<string, unknown> => {
  let map: Record<string, unknown> = {};
  try {
    const raw = settings?.features as any;
    if (raw) {
      map = typeof raw === 'string' ? JSON.parse(raw) : { ...raw };
    }
  } catch (err) {
    console.warn('features parse error on set', err);
    map = {};
  }
  map[key] = value;
  return map;
};
