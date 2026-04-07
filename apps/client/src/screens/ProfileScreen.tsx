import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Profile } from '../../../../packages/shared-logic/types';
import GlassSurface from '../components/GlassSurface';

interface ProfileScreenProps {
  profile: Profile;
  email?: string;
  onSignOut: () => void;
}

export default function ProfileScreen({ profile, email, onSignOut }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: 56,
          paddingBottom: insets.bottom + 24,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>Profile</Text>
      <Text style={styles.screenSubtitle}>Your Umusare account</Text>

      <GlassSurface style={styles.card}>
        <Text style={styles.cardSection}>Identity</Text>
        <Row label="Name" value={profile.full_name || '—'} />
        <Row label="Email" value={profile.email || email || '—'} />
        <Row label="Role" value={profile.role} last />
      </GlassSurface>

      <GlassSurface style={styles.card}>
        <Text style={styles.cardSection}>Status</Text>
        <Text style={styles.hint}>
          Trip history and payments will appear here as we expand the app.
        </Text>
      </GlassSurface>

      <TouchableOpacity style={styles.signOutButton} onPress={onSignOut} activeOpacity={0.9}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#eef1f6',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 20,
  },
  card: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cardSection: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  row: {
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(226,232,240,0.95)',
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  rowValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
  },
  hint: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  signOutButton: {
    marginTop: 8,
    backgroundColor: '#fef2f2',
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  signOutText: {
    color: '#b91c1c',
    fontSize: 16,
    fontWeight: '700',
  },
});
