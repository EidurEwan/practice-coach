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

/**
 * Read by someone trying to make an account, not by whoever deploys the build,
 * so it names what they can do rather than the environment variables they have
 * never heard of. The build that has no project configured is a build where
 * accounts were not switched on.
 */
export const NOT_CONFIGURED =
  'Accounts are turned off in this build, so there is nothing to sign in to. Everything still works — your schedule is kept on this device, and Export in Settings takes a copy.';
