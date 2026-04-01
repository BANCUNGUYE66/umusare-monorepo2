import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { supabaseClient } from './src/lib/supabaseClient';
import DriverDashboard from './src/screens/DriverDashboard';
import ProfileScreen from './src/screens/ProfileScreen';
import WalletScreen from './src/screens/WalletScreen';
import PrimaryButton from './src/PrimaryButton';
import type { Profile } from '../../packages/shared-logic/types';

export default function App() {
  return (
    <SafeAreaProvider>
      <DriverAppContent />
    </SafeAreaProvider>
  );
}

function DriverAppContent() {
  const [status, setStatus] = useState<'loading' | 'verified' | 'auth' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'wallet' | 'profile'>('dashboard');
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(true);
  const [commissionDue, setCommissionDue] = useState(0);

  useEffect(() => {
    const getSession = async () => {
      setIsLoading(true);
      const { data } = await supabaseClient.auth.getSession();
      setSession(data?.session ?? null);
      setIsLoading(false);
    };
    getSession();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session ?? null);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let timeoutId: NodeJS.Timeout;
    const initProfile = async () => {
      try {
        setIsLoading(true);
        const user = session.user;
        const { data: profiles, error: profileError } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .limit(1);
        if (profileError) throw profileError;
        if (profiles && profiles.length > 0) {
          setProfile(profiles[0]);
          setCommissionDue(Number((profiles[0] as any)?.commission_due ?? 0));
          setStatus('verified');
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };
    initProfile();
    timeoutId = setTimeout(() => {
      if (status === 'loading' && isLoading) {
        setStatus('error');
        setErrorMsg('Profile Not Found');
        setIsLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [session]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const channel = supabaseClient
      .channel(`driver-profile-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as any;
          setCommissionDue(Number(updated?.commission_due ?? 0));
          setProfile((prev) => ({ ...(prev || {}), ...updated } as Profile));
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const handleSignIn = async () => {
    setIsLoading(true);
    setStatus('loading');
    setErrorMsg('');
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setSession(data?.session ?? null);
    } catch (err: any) {
      setStatus('auth');
      setErrorMsg(err.message || 'Sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    setIsLoading(true);
    setStatus('loading');
    setErrorMsg('');
    try {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      setSession(data?.session ?? null);
    } catch (err: any) {
      setStatus('auth');
      setErrorMsg(err.message || 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    setStatus('auth');
    setErrorMsg('');
    setProfile(null);
    setEmail('');
    setPassword('');
    setSession(null);
    setIsLoading(false);
  };

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    setSession(null);
    setProfile(null);
    setStatus('auth');
  };

  const handleCommissionCleared = () => {
    setCommissionDue(0);
  };

  const canTakeTrips = isOnline && commissionDue <= 0;
  const offlineReason =
    commissionDue > 0
      ? 'Commission pending. Clear payment in Wallet before next trip.'
      : undefined;

  const showMain = !isLoading && status === 'verified' && profile;

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || !showMain) return;

    const dbOnline = isOnline && commissionDue <= 0;

    const syncPresence = async () => {
      await supabaseClient.from('profiles').update({ is_online: dbOnline }).eq('id', uid);
    };

    syncPresence();

    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    if (dbOnline) {
      (async () => {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== 'granted' || cancelled) return;

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 45,
            timeInterval: 12000,
          },
          async (loc) => {
            if (cancelled) return;
            await supabaseClient
              .from('profiles')
              .update({
                location_lat: loc.coords.latitude,
                location_lng: loc.coords.longitude,
                is_online: true,
              })
              .eq('id', uid);
          }
        );
        if (cancelled) {
          sub.remove();
          sub = null;
        }
      })();
    }

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [session?.user?.id, showMain, isOnline, commissionDue]);

  return (
    <SafeAreaView style={showMain ? styles.mainContainer : styles.container}>
      {!showMain && (
        <>
          <Text style={styles.title}>Umusare Driver</Text>
          {isLoading && (
            <View style={styles.loadingFallback}>
              <ActivityIndicator size="large" color="#F5F5F5" />
              <Text style={styles.info}>Loading...</Text>
            </View>
          )}
        </>
      )}
      {showMain && (
        <>
          <View style={[styles.tabBar, { paddingTop: Math.max(insets.top, 6) }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'dashboard' && styles.tabActive]}
              onPress={() => setActiveTab('dashboard')}
            >
              <Text
                style={[styles.tabText, activeTab === 'dashboard' && styles.tabTextActive]}
              >
                Dashboard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'wallet' && styles.tabActive]}
              onPress={() => setActiveTab('wallet')}
            >
              <Text
                style={[styles.tabText, activeTab === 'wallet' && styles.tabTextActive]}
              >
                Wallet
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
              onPress={() => setActiveTab('profile')}
            >
              <Text
                style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}
              >
                Profile
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.mainWrapper}>
            {activeTab === 'dashboard' ? (
              <DriverDashboard isOnline={canTakeTrips} offlineReason={offlineReason} />
            ) : activeTab === 'wallet' ? (
              <WalletScreen onCommissionCleared={handleCommissionCleared} />
            ) : (
              <ProfileScreen
                profile={profile}
                email={session?.user?.email}
                onSignOut={handleSignOut}
              />
            )}
          </View>

          <View style={[styles.hudContainer, { bottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[
                styles.hudToggle,
                isOnline ? styles.hudToggleOnline : styles.hudToggleOffline,
                isOnline ? styles.hudGlow : null,
              ]}
              onPress={() => setIsOnline((v) => !v)}
              activeOpacity={0.9}
            >
              <Text style={styles.hudToggleText}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {!isLoading && (status === 'auth' || !session) && (
        <View style={styles.authBox}>
          <Text style={styles.info}>Sign In / Sign Up</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            autoCapitalize="none"
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            secureTextEntry
            onChangeText={setPassword}
          />
          <View style={styles.buttonRow}>
            <PrimaryButton label="Sign In" onPress={handleSignIn} style={styles.primaryButton} />
            <PrimaryButton label="Sign Up" onPress={handleSignUp} style={styles.primaryButton} />
          </View>
          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        </View>
      )}
      {!isLoading && status === 'error' && (
        <View>
          <Text style={styles.error}>❌ Error: {errorMsg}</Text>
          {errorMsg === 'Profile Not Found' && (
            <PrimaryButton label="Retry" onPress={handleRetry} />
          )}
        </View>
      )}
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A174E',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mainContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0A174E',
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0A174E',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#0A174E',
  },
  title: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  loadingFallback: {
    alignItems: 'center',
    marginTop: 16,
  },
  info: {
    color: '#F5F5F5',
    fontSize: 16,
    marginBottom: 8,
  },
  error: {
    color: '#ff4444',
    fontSize: 16,
    marginBottom: 8,
  },
  authBox: {
    backgroundColor: '#142850',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  primaryButton: {
    flex: 1,
    marginHorizontal: 6,
  },
  hudContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  hudToggle: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  hudToggleOnline: {
    backgroundColor: '#0047AB',
  },
  hudToggleOffline: {
    backgroundColor: '#111827',
  },
  hudGlow: {
    shadowColor: '#0047AB',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  hudToggleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
