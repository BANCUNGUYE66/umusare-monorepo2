import { Platform } from 'react-native';
import { createSupabaseClient } from '../../../../packages/shared-logic/supabaseClient';

function getStorage() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return {
      getItem: (key: string) => Promise.resolve(window.localStorage.getItem(key)),
      setItem: (key: string, value: string) => {
        window.localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        window.localStorage.removeItem(key);
        return Promise.resolve();
      },
    };
  }
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return undefined;
  }
}

export const supabaseClient = createSupabaseClient(getStorage());
