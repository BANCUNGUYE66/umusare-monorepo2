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
  Modal,
  Pressable,
  Keyboard,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
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
import GlassSurface from './src/components/GlassSurface';
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
  const [activeMain, setActiveMain] = useState<'dashboard' | 'wallet' | 'profile'>('dashboard');
  const [menuVisible, setMenuVisible] = useState(false);
  const [driverInActiveTrip, setDriverInActiveTrip] = useState(false);
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
    setDriverInActiveTrip(false);
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

  const openMenu = () => {
    Keyboard.dismiss();
    setMenuVisible(true);
  };

  const goDashboard = () => {
    setMenuVisible(false);
    setActiveMain('dashboard');
  };

  const goWallet = () => {
    setMenuVisible(false);
    setActiveMain('wallet');
  };

  const goProfile = () => {
    setMenuVisible(false);
    setActiveMain('profile');
  };

  const confirmSignOut = () => {
    setMenuVisible(false);
    Alert.alert('Sign out', 'You will need to sign in again to go online and accept trips.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void handleSignOut() },
    ]);
  };

  const showAuthForm =
    !isLoading && (status === 'auth' || (!session && status !== 'error'));
  const showAuthLoading = isLoading && status === 'loading';

  const showChrome = showMain && !driverInActiveTrip;

  return (
    <SafeAreaView style={showMain ? styles.mainContainer : styles.authShell}>
      {!showMain && (
        <KeyboardAvoidingView
          style={styles.authKeyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.authScroll,
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {showAuthLoading ? (
              <GlassSurface style={styles.authStateCard}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.authLoadingLabel}>Loading…</Text>
              </GlassSurface>
            ) : null}

            {showAuthForm ? (
              <GlassSurface style={styles.authCard}>
                <Text style={styles.authBrand}>Umusare Driver</Text>
                <Text style={styles.authTagline}>
                  Drive in Kigali — sign in or create a driver account
                </Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    style={styles.authInput}
                    placeholder="you@example.com"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    onChangeText={setEmail}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TextInput
                    style={styles.authInput}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    secureTextEntry
                    onChangeText={setPassword}
                  />
                </View>

                {errorMsg ? (
                  <View style={styles.authErrorBanner}>
                    <Text style={styles.authErrorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <PrimaryButton
                  label="Sign in"
                  onPress={handleSignIn}
                  style={styles.authPrimaryBtn}
                />
                <TouchableOpacity
                  style={styles.authSecondaryBtn}
                  onPress={handleSignUp}
                  activeOpacity={0.85}
                >
                  <Text style={styles.authSecondaryBtnText}>Create account</Text>
                </TouchableOpacity>
              </GlassSurface>
            ) : null}

            {!isLoading && status === 'error' ? (
              <GlassSurface style={styles.authStateCard}>
                <Text style={styles.errorStateTitle}>Something went wrong</Text>
                <Text style={styles.errorStateBody}>{errorMsg}</Text>
                {errorMsg === 'Profile Not Found' ? (
                  <PrimaryButton label="Try again" onPress={handleRetry} style={styles.authPrimaryBtn} />
                ) : null}
              </GlassSurface>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {showMain && (
        <View style={styles.mainWrapper}>
          {showChrome ? (
            <View style={styles.headerWrap}>
              <GlassSurface style={styles.topBarGlass}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={openMenu}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.hamburger}>☰</Text>
                </TouchableOpacity>
                <Text style={styles.topBarTitle}>Umusare Driver</Text>
                <View style={styles.topBarSpacer} />
              </GlassSurface>
            </View>
          ) : null}

          {activeMain === 'dashboard' ? (
            <DriverDashboard
              isOnline={canTakeTrips}
              offlineReason={offlineReason}
              onActiveTripChange={setDriverInActiveTrip}
            />
          ) : activeMain === 'wallet' ? (
            <WalletScreen onCommissionCleared={handleCommissionCleared} />
          ) : (
            <ProfileScreen
              profile={profile}
              email={session?.user?.email}
              onSignOut={handleSignOut}
            />
          )}

          {showChrome ? (
            <View style={[styles.hudContainer, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
              <GlassSurface style={styles.hudGlass}>
                <TouchableOpacity
                  style={[
                    styles.hudInner,
                    isOnline ? styles.hudInnerOnline : styles.hudInnerOffline,
                  ]}
                  onPress={() => setIsOnline((v) => !v)}
                  activeOpacity={0.9}
                >
                  <View style={styles.hudRow}>
                    <View style={[styles.hudDot, isOnline ? styles.hudDotOn : styles.hudDotOff]} />
                    <Text style={[styles.hudToggleText, !isOnline && styles.hudToggleTextMuted]}>
                      {isOnline ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                  {!canTakeTrips && isOnline ? (
                    <Text style={styles.hudSub} numberOfLines={2}>
                      Open Wallet — commission due before accepting trips
                    </Text>
                  ) : null}
                </TouchableOpacity>
              </GlassSurface>
            </View>
          ) : null}

          <Modal
            visible={menuVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setMenuVisible(false)}
          >
            <View style={styles.menuRoot}>
              <GlassSurface style={[styles.menuDrawer, { marginTop: insets.top + 12 }]}>
                <Text style={styles.menuHeader}>Menu</Text>
                <TouchableOpacity style={styles.menuRow} onPress={goDashboard}>
                  <Text style={styles.menuRowIcon}>📊</Text>
                  <Text
                    style={[
                      styles.menuRowText,
                      activeMain === 'dashboard' && styles.menuRowActive,
                    ]}
                  >
                    Dashboard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuRow} onPress={goWallet}>
                  <Text style={styles.menuRowIcon}>👛</Text>
                  <Text
                    style={[
                      styles.menuRowText,
                      activeMain === 'wallet' && styles.menuRowActive,
                    ]}
                  >
                    Wallet
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuRow} onPress={goProfile}>
                  <Text style={styles.menuRowIcon}>👤</Text>
                  <Text
                    style={[
                      styles.menuRowText,
                      activeMain === 'profile' && styles.menuRowActive,
                    ]}
                  >
                    Profile
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuRow} onPress={confirmSignOut}>
                  <Text style={styles.menuRowIcon}>⎋</Text>
                  <Text style={[styles.menuRowText, styles.menuRowDanger]}>Log out</Text>
                </TouchableOpacity>
              </GlassSurface>
              <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
            </View>
          </Modal>
        </View>
      )}

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authShell: {
    flex: 1,
    width: '100%',
    backgroundColor: '#eef1f6',
  },
  authKeyboard: {
    flex: 1,
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  authCard: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 28,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  authStateCard: {
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  authBrand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  authTagline: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  authInput: {
    backgroundColor: 'rgba(248,250,252,0.98)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0f172a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,232,240,0.95)',
  },
  authErrorBanner: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(254, 226, 226, 0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(252, 165, 165, 0.5)',
  },
  authErrorText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  authPrimaryBtn: {
    width: '100%',
    marginTop: 4,
    borderRadius: 16,
    paddingVertical: 16,
  },
  authSecondaryBtn: {
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  authSecondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563EB',
  },
  authLoadingLabel: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  errorStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorStateBody: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  mainContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#eef1f6',
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
  },
  headerWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    paddingTop: 8,
    zIndex: 30,
  },
  topBarGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.65)',
    overflow: 'hidden',
  },
  iconBtn: {
    padding: 4,
  },
  hamburger: {
    fontSize: 20,
    color: '#1e293b',
    fontWeight: '600',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  topBarSpacer: {
    width: 28,
  },
  menuRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  menuDrawer: {
    width: '78%',
    maxWidth: 300,
    marginLeft: 0,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  menuHeader: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 20,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(226,232,240,0.9)',
  },
  menuRowIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
  },
  menuRowText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
  },
  menuRowActive: {
    color: '#2563EB',
  },
  menuRowDanger: {
    color: '#b91c1c',
  },
  hudContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 25,
  },
  hudGlass: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  hudInner: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hudInnerOnline: {
    backgroundColor: 'rgba(236, 253, 245, 0.95)',
  },
  hudInnerOffline: {
    backgroundColor: 'rgba(241, 245, 249, 0.95)',
  },
  hudDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  hudDotOn: {
    backgroundColor: '#16a34a',
  },
  hudDotOff: {
    backgroundColor: '#64748b',
  },
  hudToggleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  hudToggleTextMuted: {
    color: '#475569',
  },
  hudSub: {
    marginTop: 8,
    fontSize: 12,
    color: '#b45309',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
});
