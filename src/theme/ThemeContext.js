import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabase';
import { DEFAULT_THEME_KEY, THEME_LIST, getTheme } from './themes';

const STORAGE_KEY = 'recipe-app.theme-key';

const ThemeContext = createContext(null);

/**
 * Wrap the app in this once, near the root. Loads the signed-in user's saved
 * color theme (`profiles.theme_key`) so it follows them across devices, but
 * shows whatever was last used on this device immediately (via AsyncStorage)
 * instead of flashing the default palette while that network call is
 * in flight.
 */
export function ThemeProvider({ session, children }) {
  const [themeKey, setThemeKeyState] = useState(DEFAULT_THEME_KEY);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && THEME_LIST.some((t) => t.key === stored)) {
        setThemeKeyState(stored);
      }
    });
  }, []);

  useEffect(() => {
    if (!session) return;

    supabase
      .from('profiles')
      .select('theme_key')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load theme preference:', error.message);
          return;
        }
        if (data?.theme_key && THEME_LIST.some((t) => t.key === data.theme_key)) {
          setThemeKeyState(data.theme_key);
          AsyncStorage.setItem(STORAGE_KEY, data.theme_key).catch(() => {});
        }
      });
  }, [session]);

  const setTheme = useCallback(
    (nextKey) => {
      if (!THEME_LIST.some((t) => t.key === nextKey)) return;

      setThemeKeyState(nextKey);
      AsyncStorage.setItem(STORAGE_KEY, nextKey).catch(() => {});

      if (session) {
        supabase
          .from('profiles')
          .update({ theme_key: nextKey })
          .eq('id', session.user.id)
          .then(({ error }) => {
            if (error) console.warn('Failed to save theme preference:', error.message);
          });
      }
    },
    [session]
  );

  const colors = getTheme(themeKey);

  const value = useMemo(
    () => ({ colors, themeKey, setTheme, themes: THEME_LIST }),
    [colors, themeKey, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return ctx;
}

/** Shorthand for the common case of just reading the active color palette. */
export function useThemeColors() {
  return useAppTheme().colors;
}
