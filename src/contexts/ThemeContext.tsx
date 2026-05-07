import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'warm' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'theme';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'warm' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    /* localStorage unavailable */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyResolved(theme: Theme, resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('theme-warm', theme === 'warm');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolvedTheme, setResolved] = useState<ResolvedTheme>(() =>
    readStoredTheme() === 'dark' ||
    (readStoredTheme() === 'system' && systemPrefersDark())
      ? 'dark'
      : 'light',
  );

  // Apply class + listen for system changes when in 'system' mode.
  useEffect(() => {
    const next: ResolvedTheme =
      theme === 'dark' || (theme === 'system' && systemPrefersDark())
        ? 'dark'
        : 'light';
    setResolved(next);
    applyResolved(theme, next);

    if (theme !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      const r: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(r);
      applyResolved('system', r);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable */
    }
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
