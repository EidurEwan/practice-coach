import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useStore } from '../store/store';
import { metaStore, SyncRunner, syncOnce } from './engine';
import { supabaseRemote } from './remote';
import { isConfigured, NOT_CONFIGURED, supabase } from './supabase';
import { syncError, SyncState } from './sync';

/** How long after an edit to sync, so rating four things in a row is one sync. */
const AFTER_EDIT_MS = 4000;

export type Auth = {
  configured: boolean;
  session: Session | null;
  email: string | null;
  signedIn: boolean;
  sync: SyncState;
  appleAvailable: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsVerification: boolean }>;
  verify: (email: string, code: string) => Promise<void>;
  resend: (email: string) => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

const extra = (Constants.expoConfig?.extra ?? {}) as {
  googleWebClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
};

const googleConfig = {
  webClientId: extra.googleWebClientId,
  iosClientId: extra.googleIosClientId,
  androidClientId: extra.googleAndroidClientId,
};

const googleConfigured = Object.values(googleConfig).some(Boolean);

/**
 * `useIdTokenAuthRequest` throws outright when no client id is configured for
 * the platform, so it is mounted only when there is one. Signed-out and
 * unconfigured are supported states, not failure states.
 */
function GoogleBridge({
  register,
  onToken,
}: {
  register: (prompt: (() => Promise<unknown>) | null) => void;
  onToken: (idToken: string) => void;
}) {
  const [, response, prompt] = Google.useIdTokenAuthRequest(googleConfig);

  useEffect(() => {
    register(prompt);
    return () => register(null);
  }, [prompt, register]);

  useEffect(() => {
    if (response?.type === 'success' && response.params?.id_token) onToken(response.params.id_token);
  }, [onToken, response]);

  return null;
}

function requireClient() {
  if (!supabase) throw new Error(NOT_CONFIGURED);
  return supabase;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [sync, setSync] = useState<SyncState>({
    status: isConfigured ? 'idle' : 'off',
    at: null,
    error: null,
  });
  const [appleAvailable, setAppleAvailable] = useState(false);
  const promptGoogle = useRef<(() => Promise<unknown>) | null>(null);

  const registerGoogle = useCallback((prompt: (() => Promise<unknown>) | null) => {
    promptGoogle.current = prompt;
  }, []);

  const onGoogleToken = useCallback((token: string) => {
    void requireClient().auth.signInWithIdToken({ provider: 'google', token });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // The store object changes on every render; sync needs the latest one
  // without restarting each time it does.
  const storeRef = useRef(store);
  storeRef.current = store;
  const runner = useRef<SyncRunner | null>(null);
  const userId = session?.user?.id ?? null;

  // One runner per signed-in account. Signing out, or into another account,
  // stops it; the next one keeps its own record of what the server holds, so
  // the same phone can sync with two accounts without either refusing it.
  useEffect(() => {
    if (!supabase || !userId || !store.ready || store.loadFailed) return;

    const remote = supabaseRemote(supabase, userId);
    const meta = metaStore(
      {
        readMeta: (k) => storeRef.current.readMeta(k),
        writeMeta: (k, v) => storeRef.current.writeMeta(k, v),
      },
      userId,
    );
    const local = {
      read: () => storeRef.current.current(),
      apply: (change: Parameters<typeof store.applyRemote>[0]) => storeRef.current.applyRemote(change),
      generation: () => storeRef.current.generation(),
    };

    const r = new SyncRunner(() => syncOnce({ local, meta, remote }), {
      onStart: () => setSync((s) => ({ ...s, status: 'syncing', error: null })),
      onSuccess: () => setSync({ status: 'idle', at: new Date().toISOString(), error: null }),
      onError: (e) => {
        const error = syncError(e, 'sync').message.replace(/^Could not sync: /, '');
        console.warn('sync failed:', error);
        setSync((s) => ({ ...s, status: 'error', error }));
      },
    });
    runner.current = r;
    r.request(0);

    return () => {
      r.stop();
      runner.current = null;
      setSync({ status: isConfigured ? 'idle' : 'off', at: null, error: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, store.ready, store.loadFailed]);

  // Shortly after the schedule changes, so a rating reaches the other device
  // without waiting for the app to be backgrounded.
  useEffect(() => {
    if (store.revision) runner.current?.request(AFTER_EDIT_MS);
  }, [store.revision]);

  // And whenever the app comes back to the front.
  useEffect(() => {
    const s = AppState.addEventListener('change', (state) => {
      if (state === 'active') runner.current?.request(0);
    });
    return () => s.remove();
  }, []);

  const value = useMemo<Auth>(
    () => ({
      configured: isConfigured,
      session,
      email: session?.user?.email ?? null,
      signedIn: !!session,
      sync,
      appleAvailable,

      async signIn(email, password) {
        const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },

      async signUp(email, password) {
        const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        return { needsVerification: !data.session };
      },

      async verify(email, code) {
        const { error } = await requireClient().auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
        if (error) throw error;
      },

      async resend(email) {
        const { error } = await requireClient().auth.resend({ type: 'signup', email: email.trim() });
        if (error) throw error;
      },

      async sendReset(email) {
        const { error } = await requireClient().auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
      },

      async signInWithApple() {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        });
        if (!credential.identityToken) throw new Error('Apple did not return an identity token');
        const { error } = await requireClient().auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) throw error;
      },

      async signInWithGoogle() {
        if (!promptGoogle.current) {
          throw new Error('No Google client id is configured yet — add one to app.json under `extra`.');
        }
        requireClient();
        await promptGoogle.current();
      },

      async signOut() {
        // The schedule stays on this phone; only the session goes.
        await supabase?.auth.signOut();
        setSession(null);
      },

      async deleteAccount() {
        const client = requireClient();
        const { error } = await client.rpc('request_account_deletion');
        if (error) throw error;
        await client.auth.signOut();
        setSession(null);
      },

      async syncNow() {
        runner.current?.request(0);
      },
    }),
    [appleAvailable, session, sync],
  );

  return (
    <AuthContext.Provider value={value}>
      {googleConfigured ? <GoogleBridge register={registerGoogle} onToken={onGoogleToken} /> : null}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Auth {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth must be used inside <AuthProvider>');
  return a;
}
