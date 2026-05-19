import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translations, SupportedLanguage } from '../i18n/translations';

type TranslationContextValue = {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const TranslationContext = createContext<TranslationContextValue | undefined>(undefined);

const FALLBACK_LANGUAGE: SupportedLanguage = 'fr';
const STORAGE_KEY = 'or_lang';

const replaceVariables = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{([^}]+)\}/g, (match, token) => {
    const value = vars[token];
    return value !== undefined ? String(value) : match;
  });
};

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored === 'en' || stored === 'fr') return stored;
    return FALLBACK_LANGUAGE;
  });

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const langMap = translations[language] || translations[FALLBACK_LANGUAGE];
    const fallbackMap = translations[FALLBACK_LANGUAGE];
    const value = langMap[key] ?? fallbackMap[key] ?? key;
    return replaceVariables(value, vars);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
  }), [language, setLanguage, t]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
};

export const useTranslation = () => {
  const ctx = useContext(TranslationContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within TranslationProvider');
  }
  return ctx;
};
