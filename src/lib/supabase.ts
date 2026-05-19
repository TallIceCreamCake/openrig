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
