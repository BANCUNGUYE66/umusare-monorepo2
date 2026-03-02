import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { supabaseClient } from '../lib/supabaseClient';
import type { Profile } from '../../../../packages/shared-logic/types';

interface ProfileScreenProps {
  profile: Profile;
  email?: string;
  onSignOut: () => void;
}

export default function ProfileScreen({ profile, email, onSignOut }: ProfileScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.label}>Name</Text>
      <Text style={styles.value}>{profile.full_name || '—'}</Text>
      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{profile.email || email || '—'}</Text>
      <Text style={styles.label}>Role</Text>
      <Text style={styles.value}>{profile.role}</Text>
      <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A174E',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    color: '#F5F5F5',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 4,
  },
  value: {
    color: '#F5F5F5',
    fontSize: 18,
    marginBottom: 20,
  },
  signOutButton: {
    marginTop: 32,
    backgroundColor: '#e74c3c',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
