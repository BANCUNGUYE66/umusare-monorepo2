import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { supabaseClient } from '../../packages/shared-logic/supabaseClient';

export default function App() {
  const [status, setStatus] = useState<'active' | 'error'>('active');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchProfilesCount = async () => {
      try {
        const { count, error } = await supabaseClient
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        setCount(count ?? 0);
        setStatus('active');
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Unknown error');
      }
    };
    fetchProfilesCount();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Supabase Connection Test</Text>
      {status === 'active' ? (
        <Text style={styles.success}>✅ Connection Active ({count} profiles)</Text>
      ) : (
        <Text style={styles.error}>❌ Error: {errorMsg}</Text>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A174E', // Royal Rwanda deep blue
    alignItems: 'center',
    justifyContent: 'center',
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
  error: {
    color: '#ff4444',
    fontSize: 18,
    marginBottom: 8,
  },
});
