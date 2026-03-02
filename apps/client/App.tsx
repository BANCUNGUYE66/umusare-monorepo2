import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, Button } from 'react-native';
import { supabaseClient } from '../../packages/shared-logic/supabaseClient';
import MapScreen from './src/screens/MapScreen';

interface Profile {
  id: string;
  role: 'driver' | 'client';
  full_name?: string;
  phone?: string;
  rating?: number;
  verification_status?: string;
  language_tags?: string[];
  email?: string;
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'verified' | 'auth' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const getSession = async () => {
      setIsLoading(true);
      const { data } = await supabaseClient.auth.getSession();
      setSession(data?.session ?? null);
      setIsLoading(false);
    };
    getSession();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let timeoutId: NodeJS.Timeout;
    const initProfile = async () => {
      try {
        setIsLoading(true);
        const user = session.user;
        console.log('Current User:', user);
        // Check for profile
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
        // No insert logic; DB trigger handles profile creation
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
      // Will trigger useEffect again
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
      // Show loading spinner only; DB trigger will create profile
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Umusare Profile Initialization</Text>
      {isLoading && <Text style={styles.info}>Loading...</Text>}
      {!isLoading && status === 'verified' && profile && (
        <MapScreen />
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
  title: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  success: {
    color: '#00C851',
    fontSize: 18,
    marginBottom: 8,
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
