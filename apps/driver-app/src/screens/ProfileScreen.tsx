import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { DRIVER_TIER_RULES, tierAccentColor, tierDisplayName } from '../../../../packages/shared-logic/driverTier';
import type { Profile } from '../../../../packages/shared-logic/types';

interface ProfileScreenProps {
  profile: Profile;
  email?: string;
  onSignOut: () => void;
}

export default function ProfileScreen({ profile, email, onSignOut }: ProfileScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Profile</Text>

      <Text style={styles.label}>Name</Text>
      <Text style={styles.value}>{profile.full_name || '—'}</Text>

      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{profile.email || email || '—'}</Text>

      <Text style={styles.label}>Phone</Text>
      <Text style={styles.value}>{profile.phone || '—'}</Text>

      <Text style={styles.label}>Car</Text>
      <Text style={styles.value}>
        {[profile.car_model, profile.plate_number].filter(Boolean).join(' • ') || '—'}
      </Text>

      <Text style={styles.label}>Driver tier</Text>
      <View style={styles.tierRow}>
        <View
          style={[
            styles.tierBadge,
            { borderColor: tierAccentColor(profile.driver_tier) },
          ]}
        >
          <Text style={[styles.tierBadgeText, { color: tierAccentColor(profile.driver_tier) }]}>
            {tierDisplayName(profile.driver_tier)}
          </Text>
        </View>
      </View>
      <Text style={styles.tierHint}>
        Silver: {DRIVER_TIER_RULES.silver.minTrips}+ trips & ≥{DRIVER_TIER_RULES.silver.minRating}{' '}
        stars avg · Gold: {DRIVER_TIER_RULES.gold.minTrips}+ & ≥{DRIVER_TIER_RULES.gold.minRating} ·
        Diamond: {DRIVER_TIER_RULES.diamond.minTrips}+ & ≥{DRIVER_TIER_RULES.diamond.minRating}
      </Text>

      <Text style={styles.label}>Trips completed</Text>
      <Text style={styles.value}>{profile.completed_trips_count ?? 0}</Text>

      <Text style={styles.label}>Rating</Text>
      <Text style={styles.value}>
        {profile.rating != null ? `⭐ ${profile.rating.toFixed(1)}` : '—'}
        {profile.rating_count != null && profile.rating_count > 0
          ? ` (${profile.rating_count} reviews)`
          : ''}
      </Text>

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
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
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
  tierRow: {
    marginBottom: 8,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tierBadgeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  tierHint: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 18,
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
