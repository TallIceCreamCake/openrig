import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase';
import { getCookie, setCookie, deleteCookie } from '../utils/cookies';
import { useTranslation } from './TranslationContext';

const applyAccent = (accent?: string) => {
  if (!accent) return;
  const root = document.documentElement as HTMLElement;
  root.style.setProperty('--accent', accent);
  // derived shades rely on CSS color-mix declarations
};

type Permissions = {
  can_create_service: boolean;
  can_edit_equipment: boolean;
  can_manage_warehouses: boolean;
  can_manage_personnel: boolean;
  can_manage_clients: boolean;
  can_view_accounting: boolean;
  can_manage_maintenance: boolean;
  can_manage_notifications: boolean;
  can_edit_settings: boolean;
  superadmin: boolean;
};

type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  superadmin: boolean;
  avatar_url?: string | null;
  must_change_password: boolean;
  two_factor_email_enabled?: boolean;
  two_factor_totp_enabled?: boolean;
  permissions?: Permissions;
};

export type TwoFactorMethod = 'email' | 'totp';

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  completeTwoFactor: (challengeId: string, code: string) => Promise<AuthUser>;
  completeTwoFactorTotp: (userId: string, code: string) => Promise<AuthUser>;
  logout: () => void;
  markPasswordUpdated: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type TwoFactorChallengePayload = {
  userId: string;
  email: string;
  fullName: string;
  mustChangePassword: boolean;
  methods: TwoFactorMethod[];
  challengeId?: string | null;
  expiresAt?: string | null;
};

export class TwoFactorRequiredError extends Error {
  challengeId: string;

  userId: string;

  email: string;

  fullName: string;

  expiresAt: string | null;

  mustChangePassword: boolean;

  methods: TwoFactorMethod[];

  constructor(message: string, payload: TwoFactorChallengePayload) {
    super(message);
    this.name = 'TwoFactorRequiredError';
    this.challengeId = payload.challengeId ?? '';
    this.userId = payload.userId;
    this.email = payload.email;
    this.fullName = payload.fullName;
    this.expiresAt = payload.expiresAt ?? null;
    this.mustChangePassword = payload.mustChangePassword;
    this.methods = payload.methods;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLanguage: setUiLanguage } = useTranslation();
  const loadUserDetails = useCallback(async (userId: string) => {
    if (!SUPABASE_CONFIGURED) {
      return {
        profile: null,
        permissions: null,
        appearance: null,
        preferences: null,
      };
    }
    const [profileRes, permissionsRes, appearanceRes, preferencesRes] = await Promise.all([
      supabase.from('app_users').select('full_name, avatar_url, email, must_change_password, two_factor_email_enabled, two_factor_totp_enabled').eq('id', userId).maybeSingle(),
      supabase.from('app_permissions').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('app_user_appearance').select('accent').eq('user_id', userId).maybeSingle(),
      supabase.from('app_user_preferences').select('preferences').eq('user_id', userId).maybeSingle(),
    ]);
    return {
      profile: profileRes.data as any,
      permissions: permissionsRes.data as any,
      appearance: appearanceRes.data as any,
      preferences: preferencesRes.data as any,
    };
  }, []);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      setLoading(false);
      return;
    }
    const uid = getCookie('or_uid');
    const uemail = getCookie('or_email');
    const uname = getCookie('or_name');
    const usuper = getCookie('or_super');
    const umust = getCookie('or_must_change');
    if (uid && uemail) {
      const cached: AuthUser = {
        id: uid,
        email: uemail,
        full_name: uname || '',
        superadmin: usuper === '1',
        must_change_password: umust === '1',
      };
      setUser(cached);
      // Fetch profile + permissions lazily
      loadUserDetails(uid)
        .then(({ profile, permissions, appearance, preferences }) => {
          setUser((prev) => (prev ? {
            ...prev,
            full_name: (profile?.full_name ?? prev.full_name) as string,
            email: (profile?.email ?? prev.email) as string,
            avatar_url: profile?.avatar_url ?? prev.avatar_url,
            must_change_password: typeof profile?.must_change_password === 'boolean'
              ? profile.must_change_password
              : prev.must_change_password,
            two_factor_email_enabled: typeof profile?.two_factor_email_enabled === 'boolean'
              ? profile.two_factor_email_enabled
              : prev.two_factor_email_enabled,
            two_factor_totp_enabled: typeof profile?.two_factor_totp_enabled === 'boolean'
              ? profile.two_factor_totp_enabled
              : prev.two_factor_totp_enabled,
            permissions: permissions ?? prev.permissions,
          } : prev));
          if (profile?.full_name) setCookie('or_name', profile.full_name, 7);
          if (profile?.email) setCookie('or_email', profile.email, 7);
          if (typeof profile?.must_change_password === 'boolean') {
            setCookie('or_must_change', profile.must_change_password ? '1' : '0', 7);
          }
          if (appearance?.accent) {
            applyAccent(appearance.accent);
            setCookie('or_accent', appearance.accent, 30);
          }
          const prefs: any = preferences?.preferences;
          if (prefs?.language && (prefs.language === 'en' || prefs.language === 'fr')) {
            setUiLanguage(prefs.language);
            setCookie('or_lang', prefs.language, 30);
          }
        })
        .catch((err) => {
          console.error('[auth] preload error', err);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [loadUserDetails]);

  const login = useCallback(async (email: string, password: string) => {
    if (!SUPABASE_CONFIGURED) {
      throw new Error('Supabase non configuré');
    }
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Identifiants invalides');
    }
    const row = payload?.user;
    if (!row?.user_id) {
      throw new Error('Identifiants invalides');
    }
    const availableMethods: TwoFactorMethod[] = [];
    if (row.two_factor_email_enabled) availableMethods.push('email');
    if (row.two_factor_totp_enabled) availableMethods.push('totp');

    if (row.two_factor_required && availableMethods.length > 0) {
      let challengeId: string | null = null;
      let expiresAt: string | null = null;
      if (availableMethods.length === 1 && availableMethods[0] === 'email') {
        const response = await fetch('/api/auth/request-two-factor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: row.user_id }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Impossible de déclencher la vérification 2FA');
        }
        challengeId = payload?.challenge_id ?? null;
        expiresAt = payload?.expires_at ?? null;
      }
      const message = availableMethods.length === 1 && availableMethods[0] === 'totp'
        ? 'Entrez le code généré par votre application d’authentification.'
        : 'Authentification à deux facteurs requise.';
      throw new TwoFactorRequiredError(message, {
        challengeId,
        userId: row.user_id,
        email: row.email,
        fullName: row.full_name,
        expiresAt,
        mustChangePassword: !!row.must_change_password,
        methods: availableMethods,
      });
    }
    const authUser: AuthUser = {
      id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      superadmin: !!row.superadmin,
      must_change_password: !!row.must_change_password,
      two_factor_email_enabled: !!row.two_factor_email_enabled,
      two_factor_totp_enabled: !!row.two_factor_totp_enabled,
    };
    const { profile, permissions, appearance, preferences } = await loadUserDetails(authUser.id);
    if (profile) {
      authUser.full_name = profile.full_name || authUser.full_name;
      authUser.email = profile.email || authUser.email;
      authUser.avatar_url = profile.avatar_url || null;
      if (typeof profile.must_change_password === 'boolean') {
        authUser.must_change_password = profile.must_change_password;
      }
      if (typeof profile.two_factor_email_enabled === 'boolean') {
        authUser.two_factor_email_enabled = profile.two_factor_email_enabled;
      }
      if (typeof profile.two_factor_totp_enabled === 'boolean') {
        authUser.two_factor_totp_enabled = profile.two_factor_totp_enabled;
      }
    }
    if (permissions) authUser.permissions = permissions as any;
    if (appearance?.accent) {
      applyAccent(appearance.accent);
      setCookie('or_accent', appearance.accent, 30);
    }
    const prefs: any = preferences?.preferences;
    if (prefs?.language && (prefs.language === 'en' || prefs.language === 'fr')) {
      setUiLanguage(prefs.language);
      setCookie('or_lang', prefs.language, 30);
    }
    setUser(authUser);
    setCookie('or_uid', authUser.id, 7);
    setCookie('or_email', authUser.email, 7);
    setCookie('or_name', authUser.full_name || '', 7);
    setCookie('or_super', authUser.superadmin ? '1' : '0', 7);
    setCookie('or_must_change', authUser.must_change_password ? '1' : '0', 7);
    return authUser;
  }, [loadUserDetails, setUiLanguage]);

  const completeTwoFactorTotp = useCallback(async (userId: string, code: string) => {
    if (!SUPABASE_CONFIGURED) {
      throw new Error('Supabase non configuré');
    }
    const response = await fetch('/api/auth/confirm-two-factor-totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, code }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Impossible de vérifier le code TOTP');
    }
    const row = payload?.user;
    if (!row?.user_id) {
      throw new Error('Utilisateur introuvable');
    }
    const authUser: AuthUser = {
      id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      superadmin: !!row.superadmin,
      must_change_password: !!row.must_change_password,
      two_factor_email_enabled: !!row.two_factor_email_enabled,
      two_factor_totp_enabled: !!row.two_factor_totp_enabled,
    };
    const { profile, permissions, appearance, preferences } = await loadUserDetails(authUser.id);
    if (profile) {
      authUser.full_name = profile.full_name || authUser.full_name;
      authUser.email = profile.email || authUser.email;
      authUser.avatar_url = profile.avatar_url || null;
      if (typeof profile.must_change_password === 'boolean') {
        authUser.must_change_password = profile.must_change_password;
      }
      if (typeof profile.two_factor_email_enabled === 'boolean') {
        authUser.two_factor_email_enabled = profile.two_factor_email_enabled;
      }
      if (typeof profile.two_factor_totp_enabled === 'boolean') {
        authUser.two_factor_totp_enabled = profile.two_factor_totp_enabled;
      }
    }
    if (permissions) authUser.permissions = permissions as any;
    if (appearance?.accent) {
      applyAccent(appearance.accent);
      setCookie('or_accent', appearance.accent, 30);
    }
    const prefs: any = preferences?.preferences;
    if (prefs?.language && (prefs.language === 'en' || prefs.language === 'fr')) {
      setUiLanguage(prefs.language);
      setCookie('or_lang', prefs.language, 30);
    }
    setUser(authUser);
    setCookie('or_uid', authUser.id, 7);
    setCookie('or_email', authUser.email, 7);
    setCookie('or_name', authUser.full_name || '', 7);
    setCookie('or_super', authUser.superadmin ? '1' : '0', 7);
    setCookie('or_must_change', authUser.must_change_password ? '1' : '0', 7);
    return authUser;
  }, [loadUserDetails, setUiLanguage]);

  const completeTwoFactor = useCallback(async (challengeId: string, code: string) => {
    if (!SUPABASE_CONFIGURED) {
      throw new Error('Supabase non configuré');
    }
    const response = await fetch('/api/auth/confirm-two-factor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Code invalide ou expiré');
    }
    const row = payload?.user ?? null;
    if (!row?.user_id) {
      throw new Error('Code invalide ou expiré');
    }
    const authUser: AuthUser = {
      id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      superadmin: !!row.superadmin,
      must_change_password: !!row.must_change_password,
      two_factor_email_enabled: !!row.two_factor_email_enabled,
      two_factor_totp_enabled: !!row.two_factor_totp_enabled,
    };
    const { profile, permissions, appearance, preferences } = await loadUserDetails(authUser.id);
    if (profile) {
      authUser.full_name = profile.full_name || authUser.full_name;
      authUser.email = profile.email || authUser.email;
      authUser.avatar_url = profile.avatar_url || null;
      if (typeof profile.must_change_password === 'boolean') {
        authUser.must_change_password = profile.must_change_password;
      }
      if (typeof profile.two_factor_email_enabled === 'boolean') {
        authUser.two_factor_email_enabled = profile.two_factor_email_enabled;
      }
      if (typeof profile.two_factor_totp_enabled === 'boolean') {
        authUser.two_factor_totp_enabled = profile.two_factor_totp_enabled;
      }
    }
    if (permissions) authUser.permissions = permissions as any;
    if (appearance?.accent) {
      applyAccent(appearance.accent);
      setCookie('or_accent', appearance.accent, 30);
    }
    const prefs: any = preferences?.preferences;
    if (prefs?.language && (prefs.language === 'en' || prefs.language === 'fr')) {
      setUiLanguage(prefs.language);
      setCookie('or_lang', prefs.language, 30);
    }
    setUser(authUser);
    setCookie('or_uid', authUser.id, 7);
    setCookie('or_email', authUser.email, 7);
    setCookie('or_name', authUser.full_name || '', 7);
    setCookie('or_super', authUser.superadmin ? '1' : '0', 7);
    setCookie('or_must_change', authUser.must_change_password ? '1' : '0', 7);
    return authUser;
  }, [loadUserDetails, setUiLanguage]);

  const logout = useCallback(() => {
    deleteCookie('or_uid');
    deleteCookie('or_email');
    deleteCookie('or_name');
    deleteCookie('or_super');
    deleteCookie('or_must_change');
    setUiLanguage('fr');
    setUser(null);
  }, [setUiLanguage]);

  const markPasswordUpdated = useCallback(() => {
    setUser(prev => prev ? { ...prev, must_change_password: false } : prev);
    setCookie('or_must_change', '0', 7);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, completeTwoFactor, completeTwoFactorTotp, logout, markPasswordUpdated }),
    [user, loading, login, completeTwoFactor, completeTwoFactorTotp, logout, markPasswordUpdated]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
