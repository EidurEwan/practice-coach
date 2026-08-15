import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

/**
 * An account is a backup and a merge target, never a gate. If no project is
 * configured the app runs exactly as it does signed out — everything works,
 * the Settings card just says "No account yet".
 */

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseAnonKey?: string };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '';

export const isConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // There is no browser redirect to read a session out of on a phone.
        detectSessionInUrl: false,
      },
    })
  : null;

export const NOT_CONFIGURED =
  'No Supabase project is configured yet. Everything still works offline — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to turn on backup and sync.';
