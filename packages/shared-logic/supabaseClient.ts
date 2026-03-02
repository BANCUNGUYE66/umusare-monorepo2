import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseUrl(): string {
  let url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  // On physical device, localhost refers to the device itself — use dev machine IP
  try {
    const { Platform } = require('react-native');
    const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
    const isLocalhost =
      url?.includes('localhost') || url?.includes('127.0.0.1');
    if (isNative && isLocalhost) {
      const devHost =
        process.env.EXPO_PUBLIC_DEV_HOST || '192.168.1.68';
      url = url!.replace(/localhost|127\.0\.0\.1/g, devHost);
    }
  } catch {
    // Not in React Native (e.g. tests)
  }
  return url!;
}

export function createSupabaseClient(storage?: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}): SupabaseClient {
  return createClient(
    getSupabaseUrl(),
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        ...(storage && { storage }),
        autoRefreshToken: true,
        persistSession: true,
      },
    }
  );
}
