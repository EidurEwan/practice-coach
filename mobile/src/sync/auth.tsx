import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Doc } from '../engine/types';
import { useStore } from '../store/store';
import { isConfigured, NOT_CONFIGURED, supabase } from './supabase';
import { reassignIds } from './reassign';
import { isOwnershipError, syncError, syncNow, SyncState } from './sync';

/** Which account this phone last uploaded to. Device metadata, not user data. */
const SYNCED_USER = 'interval:synced-user';

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
  const busy = useRef(false);
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

  const run = useCallback(async () => {
    const userId = session?.user?.id;
    if (!supabase || !userId || busy.current || !store.ready) return;
    busy.current = true;
    setSync((s) => ({ ...s, status: 'syncing', error: null }));
    try {
      // Signing into a different account on this phone: the local rows were
      // uploaded under the previous account and cannot be written to this one,
      // so they become this account's own copies before the first push.
      const previous = await AsyncStorage.getItem(SYNCED_USER);
      let local = store.doc;
      if (previous && previous !== userId) {
        local = reassignIds(local);
        await store.replaceDoc(local, { fromSync: true });
      }
      await AsyncStorage.setItem(SYNCED_USER, userId);

      let merged: Doc;
      try {
        merged = await syncNow(local, userId);
      } catch (e) {
        // The server says these rows are somebody else's — which happens when
        // this phone synced under another account before there was anything
        // recording that. Take the same repair and try once more, so a phone
        // in that state is not stuck failing forever.
        if (!isOwnershipError(e)) throw e;
        local = reassignIds(local);
        await store.replaceDoc(local, { fromSync: true });
        merged = await syncNow(local, userId);
      }
      await store.replaceDoc(merged, { fromSync: true });
      setSync({ status: 'idle', at: new Date().toISOString(), error: null });
    } catch (e) {
      const error = syncError(e, 'sync').message.replace(/^Could not sync: /, '');
      console.warn('sync failed:', error);
      setSync((s) => ({ ...s, status: 'error', error }));
    } finally {
      busy.current = false;
    }
  }, [session, store]);

  // Sync when the session appears and whenever the app comes back to the front.
  useEffect(() => {
    if (session) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, store.ready]);

  // And shortly after the schedule changes, so a rating reaches the other
  // device without waiting for the app to be backgrounded. Debounced, because
  // rating four things in a row is one change as far as the server cares.
  useEffect(() => {
    if (!session || !store.revision) return;
    const id = setTimeout(() => void run(), 4000);
    return () => clearTimeout(id);
  }, [run, session, store.revision]);

  useEffect(() => {
    const s = AppState.addEventListener('change', (state) => {
      if (state === 'active' && session) void run();
    });
    return () => s.remove();
  }, [run, session]);

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

      syncNow: run,
    }),
    [appleAvailable, run, session, sync],
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
