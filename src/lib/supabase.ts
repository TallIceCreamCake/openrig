import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const resolveSupabaseUrl = (url?: string) => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (typeof window !== 'undefined') {
      const currentHost = window.location.hostname;
      const currentOrigin = window.location.origin;
      const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
      const isLocalSupabase = localHosts.has(parsed.hostname);
      const isLocalApp = localHosts.has(currentHost);
      if (isLocalSupabase && !isLocalApp && currentHost) {
        return `${currentOrigin}/supabase`;
      }
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
};

export const SUPABASE_URL = resolveSupabaseUrl(RAW_SUPABASE_URL);

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && supabaseAnonKey);

const FALLBACK_URL = 'https://placeholder.supabase.co';
const FALLBACK_KEY = 'public-anon-key';

export const supabase = createClient<Database>(
  SUPABASE_CONFIGURED ? SUPABASE_URL : FALLBACK_URL,
  SUPABASE_CONFIGURED ? supabaseAnonKey : FALLBACK_KEY,
);

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

/**
 * Storage public URLs built on a local Supabase (or on the current origin via
 * the /supabase proxy) only work from one machine. Store/display them as a
 * relative "/supabase/..." path instead so they load from any device.
 * Non-local URLs (e.g. Supabase cloud) are returned untouched.
 */
export const toProxiedStorageUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
    const isLocalHost = LOCAL_HOSTNAMES.has(parsed.hostname);
    const isSameOrigin = typeof window !== 'undefined' && parsed.origin === window.location.origin;
    if (!isLocalHost && !isSameOrigin) return url;
    const pathname = parsed.pathname.startsWith('/supabase/')
      ? parsed.pathname
      : `/supabase${parsed.pathname}`;
    if (!pathname.startsWith('/supabase/storage/v1/')) return url;
    return `${pathname}${parsed.search}`;
  } catch {
    return url;
  }
};
