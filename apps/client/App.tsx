import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  FlatList,
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
import MapScreen from './src/screens/MapScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PrimaryButton from './src/PrimaryButton';
import GlassSurface from './src/components/GlassSurface';
import type { Profile } from '../../packages/shared-logic/types';

export default function App() {
  return (
    <SafeAreaProvider>
      <ClientAppContent />
    </SafeAreaProvider>
  );
}

function ClientAppContent() {
  const [status, setStatus] = useState<'loading' | 'verified' | 'auth' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeMain, setActiveMain] = useState<'map' | 'profile'>('map');
  const [menuVisible, setMenuVisible] = useState(false);
  const [tripsModalVisible, setTripsModalVisible] = useState(false);
  const [tripRows, setTripRows] = useState<
    { id: string; status: string; base_fee: number; created_at?: string }[]
  >([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const insets = useSafeAreaInsets();

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
        console.log('Current User:', user);
        const { data: profiles, error: profileError } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .limit(1);
        console.log('Profile Data:', profiles);
        if (profileError) throw profileError;
        if (profiles && profiles.length > 0) {
          setProfile(profiles[0]);
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
    if (!tripsModalVisible) return;
    let cancelled = false;
    (async () => {
      setTripsLoading(true);
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid || cancelled) {
        setTripsLoading(false);
        return;
      }
      const { data, error } = await supabaseClient
        .from('trips')
        .select('id, status, base_fee, created_at')
        .eq('client_id', uid)
        .order('created_at', { ascending: false })
        .limit(40);
      if (!cancelled && !error && data) {
        setTripRows(data as typeof tripRows);
      }
      if (!cancelled) setTripsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripsModalVisible]);

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

  const showMain = !isLoading && status === 'verified' && profile;

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    setSession(null);
    setProfile(null);
    setStatus('auth');
  };

  const openMenu = () => {
    Keyboard.dismiss();
    setMenuVisible(true);
  };

  const goMap = () => {
    setMenuVisible(false);
    setActiveMain('map');
  };

  const goProfile = () => {
    setMenuVisible(false);
    setActiveMain('profile');
  };

  const openTrips = () => {
    setMenuVisible(false);
    setTripsModalVisible(true);
  };

  const confirmSignOut = () => {
    setMenuVisible(false);
    Alert.alert('Sign out', 'You will need to sign in again to book a ride.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void handleSignOut() },
    ]);
  };

  const showAuthForm =
    !isLoading && (status === 'auth' || (!session && status !== 'error'));
  const showAuthLoading = isLoading && status === 'loading';

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
                  <Text style={styles.authBrand}>Umusare</Text>
                  <Text style={styles.authTagline}>
                    Rides in Kigali — sign in or create an account
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
            <View style={styles.headerWrap}>
              <GlassSurface style={styles.topBarGlass}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={openMenu}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.hamburger}>☰</Text>
                </TouchableOpacity>
                <Text style={styles.topBarTitle}>Umusare</Text>
                <View style={styles.topBarSpacer} />
              </GlassSurface>
            </View>

            {activeMain === 'map' ? (
              <MapScreen />
            ) : (
              <ProfileScreen
                profile={profile}
                email={session?.user?.email}
                onSignOut={handleSignOut}
              />
            )}

            <Modal
              visible={menuVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setMenuVisible(false)}
            >
              <View style={styles.menuRoot}>
                <GlassSurface style={[styles.menuDrawer, { marginTop: insets.top + 12 }]}>
                  <Text style={styles.menuHeader}>Menu</Text>
                  <TouchableOpacity style={styles.menuRow} onPress={goMap}>
                    <Text style={styles.menuRowIcon}>🗺</Text>
                    <Text
                      style={[
                        styles.menuRowText,
                        activeMain === 'map' && styles.menuRowActive,
                      ]}
                    >
                      Map
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
                  <TouchableOpacity style={styles.menuRow} onPress={openTrips}>
                    <Text style={styles.menuRowIcon}>📋</Text>
                    <Text style={styles.menuRowText}>My trips</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuRow} onPress={confirmSignOut}>
                    <Text style={styles.menuRowIcon}>⎋</Text>
                    <Text style={[styles.menuRowText, styles.menuRowDanger]}>Log out</Text>
                  </TouchableOpacity>
                </GlassSurface>
                <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
              </View>
            </Modal>

            <Modal
              visible={tripsModalVisible}
              transparent
              animationType="slide"
              onRequestClose={() => setTripsModalVisible(false)}
            >
              <View style={styles.tripsModalRoot}>
                <Pressable
                  style={styles.tripsModalDim}
                  onPress={() => setTripsModalVisible(false)}
                />
                <View style={styles.tripsSheetWrap} pointerEvents="box-none">
                  <GlassSurface style={[styles.tripsSheet, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={styles.sheetHandle} />
                    <Text style={styles.tripsTitle}>My trips</Text>
                    {tripsLoading ? (
                      <ActivityIndicator style={styles.tripsLoading} color="#2563EB" />
                    ) : (
                      <FlatList
                        data={tripRows}
                        keyExtractor={(item) => item.id}
                        style={styles.tripsList}
                        ListEmptyComponent={
                          <Text style={styles.tripsEmpty}>No trips yet.</Text>
                        }
                        renderItem={({ item }) => (
                          <View style={styles.tripRow}>
                            <View>
                              <Text style={styles.tripStatus}>{item.status}</Text>
                              <Text style={styles.tripMeta}>
                                {item.created_at
                                  ? new Date(item.created_at).toLocaleString()
                                  : '—'}
                              </Text>
                            </View>
                            <Text style={styles.tripFee}>
                              {Number(item.base_fee).toLocaleString()} RWF
                            </Text>
                          </View>
                        )}
                      />
                    )}
                    <TouchableOpacity
                      onPress={() => setTripsModalVisible(false)}
                      style={styles.tripsClose}
                    >
                      <Text style={styles.tripsCloseText}>Close</Text>
                    </TouchableOpacity>
                  </GlassSurface>
                </View>
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
    fontSize: 32,
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
  tripsModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  tripsModalDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
    zIndex: 0,
  },
  tripsSheetWrap: {
    zIndex: 2,
    width: '100%',
  },
  tripsSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '72%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 16,
  },
  tripsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  tripsList: {
    maxHeight: 360,
  },
  tripsLoading: {
    marginVertical: 24,
  },
  tripsEmpty: {
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 15,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  tripStatus: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'capitalize',
  },
  tripMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  tripFee: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563EB',
  },
  tripsClose: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 12,
  },
  tripsCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563EB',
  },
});
