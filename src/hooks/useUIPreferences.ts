import { useState, useEffect } from 'react';

export const useUIPreferences = <T>(key: string, defaultValue: T) => {
  const [preference, setPreference] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(`ui_pref_${key}`);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
      console.error('Error loading UI preference:', error);
      return defaultValue;
    }
  });

  const updatePreference = (newValue: T) => {
    try {
      setPreference(newValue);
      localStorage.setItem(`ui_pref_${key}`, JSON.stringify(newValue));
    } catch (error) {
      console.error('Error saving UI preference:', error);
    }
  };

  return [preference, updatePreference] as const;
};