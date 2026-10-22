
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeChoice = 'System' | 'Light' | 'Dark';

export const THEME_STORAGE_KEY = 'app-settings-theme';

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  secondaryText: string;
  border: string;
  primary: string;
};

const lightColors: ThemeColors = {
  background: '#F5F8F7',
  surface: '#FFFFFF',
  text: '#172F2B',
  secondaryText: '#71827D',
  border: '#E1EBE7',
  primary: '#16866B',
};

const darkColors: ThemeColors = {
  background: '#101916',
  surface: '#1B2521',
  text: '#F0F7F3',
  secondaryText: '#A0B3AA',
  border: '#34423B',
  primary: '#65D6B0',
};

type AppThemeContextValue = {
  theme: ThemeChoice;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeChoice) => Promise<void>;
};

const AppThemeContext =
  createContext<AppThemeContextValue | undefined>(undefined);

export function AppThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const systemScheme = useColorScheme();

  const [theme, setThemeState] = useState<ThemeChoice>('System');
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);

  // Load the saved theme when the app starts.
  useEffect(() => {
    let mounted = true;

    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(
          THEME_STORAGE_KEY
        );

        if (
          mounted &&
          (savedTheme === 'System' ||
            savedTheme === 'Light' ||
            savedTheme === 'Dark')
        ) {
          setThemeState(savedTheme);
        }
      } catch (error) {
        console.warn('Could not load saved theme:', error);
      } finally {
        if (mounted) {
          setIsThemeLoaded(true);
        }
      }
    };

    void loadTheme();

    return () => {
      mounted = false;
    };
  }, []);

  // Save the theme and update the app immediately.
  const setTheme = useCallback(
    async (nextTheme: ThemeChoice) => {
      await AsyncStorage.setItem(
        THEME_STORAGE_KEY,
        nextTheme
      );

      setThemeState(nextTheme);
    },
    []
  );

  const isDark =
    theme === 'Dark' ||
    (theme === 'System' && systemScheme === 'dark');

  const colors = isDark ? darkColors : lightColors;

  const value = useMemo<AppThemeContextValue>(
    () => ({
      theme,
      isDark,
      colors,
      setTheme,
    }),
    [theme, isDark, colors, setTheme]
  );

  // Render children normally; the default System theme applies
  // until the saved preference has finished loading.
  void isThemeLoaded;

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const context = useContext(AppThemeContext);

  if (context === undefined) {
    throw new Error(
      'useAppTheme must be used inside AppThemeProvider. ' +
        'Wrap your app with AppThemeProvider in app/_layout.tsx.'
    );
  }

  return context;
}
