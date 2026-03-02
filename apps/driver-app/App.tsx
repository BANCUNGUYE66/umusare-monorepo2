import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Button,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabaseClient } from './src/lib/supabaseClient';
import DriverDashboard from './src/screens/DriverDashboard';
import ProfileScreen from './src/screens/ProfileScreen';
import type { Profile } from '../../packages/shared-logic/types';

export default function App() {
  const [status, setStatus] = useState<'loading' | 'verified' | 'auth' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'profile'>('dashboard');

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

  return (
    <View style={showMain ? styles.mainContainer : styles.container}>
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
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'dashboard' && styles.tabActive]}
              onPress={() => setActiveTab('dashboard')}
            >
              <Text style={[styles.tabText, activeTab === 'dashboard' && styles.tabTextActive]}>
                Dashboard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
              onPress={() => setActiveTab('profile')}
            >
              <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
                Profile
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.mainWrapper}>
            {activeTab === 'dashboard' ? (
              <DriverDashboard />
            ) : (
              <ProfileScreen
                profile={profile}
                email={session?.user?.email}
                onSignOut={handleSignOut}
              />
            )}
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
            <Button title="Sign In" onPress={handleSignIn} />
            <Button title="Sign Up" onPress={handleSignUp} />
          </View>
          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        </View>
      )}
      {!isLoading && status === 'error' && (
        <View>
          <Text style={styles.error}>❌ Error: {errorMsg}</Text>
          {errorMsg === 'Profile Not Found' && (
            <Button title="Retry" onPress={handleRetry} />
          )}
        </View>
      )}
      <StatusBar style="dark" />
    </View>
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
});
