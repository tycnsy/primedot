import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { App as CapacitorApp, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isNativePlatform = Capacitor.isNativePlatform();
  const nativeAuthRedirectUrl =
    import.meta.env.VITE_MOBILE_AUTH_REDIRECT_URL ?? 'com.prime.app://auth/callback';
  const authRedirectUrl = isNativePlatform
    ? nativeAuthRedirectUrl
    : `${window.location.origin}/login`;

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isNativePlatform) return;

    const canHandleRedirect = (incomingUrl: string) => {
      try {
        const incoming = new URL(incomingUrl);
        const expected = new URL(nativeAuthRedirectUrl);
        return (
          incoming.protocol === expected.protocol &&
          incoming.host === expected.host &&
          incoming.pathname.startsWith(expected.pathname)
        );
      } catch {
        return false;
      }
    };

    const getHashParam = (url: URL, key: string) =>
      new URLSearchParams(url.hash.replace(/^#/, '')).get(key);

    const handleAuthCallback = async ({ url }: URLOpenListenerEvent) => {
      if (!url || !canHandleRedirect(url)) return;

      try {
        const parsedUrl = new URL(url);
        const code = parsedUrl.searchParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const accessToken =
            parsedUrl.searchParams.get('access_token') ??
            getHashParam(parsedUrl, 'access_token');
          const refreshToken =
            parsedUrl.searchParams.get('refresh_token') ??
            getHashParam(parsedUrl, 'refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
          }
        }
      } catch (error) {
        console.error('Failed to complete native OAuth callback', error);
      } finally {
        await Browser.close().catch(() => undefined);
      }
    };

    let listener: PluginListenerHandle | undefined;

    CapacitorApp.addListener('appUrlOpen', handleAuthCallback)
      .then((handle) => {
        listener = handle;
      })
      .catch((error) => {
        console.error('Failed to register appUrlOpen listener', error);
      });

    return () => {
      listener?.remove().catch(() => undefined);
    };
  }, [isNativePlatform, nativeAuthRedirectUrl]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signInWithGoogle: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: authRedirectUrl,
            skipBrowserRedirect: isNativePlatform,
          },
        });
        if (error) throw error;

        if (isNativePlatform) {
          const oauthUrl = data?.url;
          if (!oauthUrl) throw new Error('Missing OAuth URL for native sign in');
          await Browser.open({ url: oauthUrl });
        }
      },
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      },
      signUpWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirectUrl,
          },
        });
        if (error) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [authRedirectUrl, isNativePlatform, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
