import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabaseClient } from '../lib/supabaseClient';
import DriverTrackingScreen from './DriverTrackingScreen';
import type { Trip } from '../../../../packages/shared-logic/types';

const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/** Only consider very recent requests; older pendings are ignored in the UI */
const PENDING_MAX_AGE_MS = 20 * 60 * 1000;

function isRecentPendingTrip(trip: Trip): boolean {
  if (!trip.created_at) return true;
  return Date.now() - new Date(trip.created_at).getTime() <= PENDING_MAX_AGE_MS;
}

async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string
): Promise<string> {
  const url = `${GOOGLE_GEOCODE_URL}?latlng=${lat},${lng}&key=${apiKey}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== 'OK' || !json.results?.[0]) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  return json.results[0].formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

interface DriverDashboardProps {
  isOnline: boolean;
  offlineReason?: string;
}

export default function DriverDashboard({ isOnline, offlineReason }: DriverDashboardProps) {
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  const fetchAddress = useCallback(async (trip: Trip) => {
    if (trip.client_lat == null || trip.client_lng == null) {
      setPickupAddress('Pickup location');
      return;
    }
    setLoadingAddress(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      const addr = apiKey
        ? await reverseGeocode(trip.client_lat, trip.client_lng, apiKey)
        : `${trip.client_lat.toFixed(4)}, ${trip.client_lng.toFixed(4)}`;
      setPickupAddress(addr);
    } catch {
      setPickupAddress(`${trip.client_lat.toFixed(4)}, ${trip.client_lng.toFixed(4)}`);
    } finally {
      setLoadingAddress(false);
    }
  }, []);

  const loadPendingTrips = useCallback(async () => {
    const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString();
    const { data, error } = await supabaseClient
      .from('trips')
      .select('*')
      .eq('status', 'pending')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.warn('[DriverDashboard] load pending trips:', error.message);
      return;
    }
    const row = (data as Trip[] | null)?.[0];
    if (row && isRecentPendingTrip(row)) {
      setPendingTrips([row]);
    } else {
      setPendingTrips([]);
    }
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setPendingTrips([]);
      return;
    }

    loadPendingTrips();

    // Backup if realtime misses an event (network / RLS / channel lag)
    const poll = setInterval(loadPendingTrips, 10000);

    const channel = supabaseClient
      .channel('trips-pending')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trips' },
        (payload) => {
          const trip = payload.new as Trip;
          if (trip.status !== 'pending') return;
          if (!isRecentPendingTrip(trip)) return;
          setPendingTrips((prev) => {
            if (prev.length === 0) return [trip];
            const a = new Date(trip.created_at || 0).getTime();
            const b = new Date(prev[0].created_at || 0).getTime();
            if (trip.id === prev[0].id) return [trip];
            return a >= b ? [trip] : prev;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips' },
        (payload) => {
          const updated = payload.new as Trip;
          if (updated.status === 'pending') {
            if (!isRecentPendingTrip(updated as Trip)) {
              setPendingTrips([]);
              return;
            }
            setPendingTrips((prev) => {
              if (prev.length === 0 || prev[0].id === updated.id) {
                return [updated as Trip];
              }
              const a = new Date((updated as Trip).created_at || 0).getTime();
              const b = new Date(prev[0].created_at || 0).getTime();
              return a >= b ? [updated as Trip] : prev;
            });
            return;
          }
          setPendingTrips((prev) => prev.filter((t) => t.id !== updated.id));
        }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabaseClient.removeChannel(channel);
    };
  }, [isOnline, loadPendingTrips]);

  const latestPendingTrip = pendingTrips[0] ?? null;

  useEffect(() => {
    if (latestPendingTrip) {
      fetchAddress(latestPendingTrip);
    } else {
      setPickupAddress(null);
    }
  }, [latestPendingTrip?.id, fetchAddress]);

  const handleAcceptMission = async (trip: Trip) => {
    if (!isOnline) {
      return;
    }

    const { data: sessionData } = await supabaseClient.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) {
      console.error('No authenticated user');
      return;
    }

    setAcceptingId(trip.id);
    let { error } = await supabaseClient.rpc('accept_trip_with_priority', {
      p_trip_id: trip.id,
    });

    if (error) {
      const msg = error.message || '';
      const tryDirect =
        msg.includes('No eligible') ||
        msg.includes('matching') ||
        msg.includes('schema cache');

      if (tryDirect) {
        const direct = await supabaseClient
          .from('trips')
          .update({ status: 'active', driver_id: userId })
          .eq('id', trip.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();
        error = direct.error;
        if (!error && !direct.data) {
          error = { message: 'Trip was already taken or is no longer pending.' } as any;
        }
      }
    }

    setAcceptingId(null);
    if (error) {
      console.error('Accept error:', error);
      Alert.alert(
        'Could not accept',
        (error as { message?: string }).message ||
          'Another driver may have higher priority for this trip.'
      );
      return;
    }
    setPendingTrips((prev) => prev.filter((t) => t.id !== trip.id));
    setActiveTrip({ ...trip, status: 'active', driver_id: userId });
  };

  const handleDecline = () => {
    if (!latestPendingTrip) return;
    setPendingTrips((prev) => prev.filter((t) => t.id !== latestPendingTrip.id));
  };

  if (activeTrip) {
    return (
      <DriverTrackingScreen
        trip={activeTrip}
        onComplete={() => setActiveTrip(null)}
      />
    );
  }

  const hasPendingMission = !!latestPendingTrip;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Dashboard</Text>
      <Text style={styles.subtitle}>
        {!isOnline
          ? offlineReason || 'Offline — mission intake paused'
          : hasPendingMission
            ? 'New mission available'
            : 'Waiting for missions...'}
      </Text>

      <Modal
        visible={hasPendingMission}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Mission</Text>
            <Text style={styles.fee}>
              {latestPendingTrip?.base_fee.toLocaleString() ?? 0} RWF
            </Text>
            <Text style={styles.feeLabel}>Base fee</Text>
            <View style={styles.pickupRow}>
              <Text style={styles.pickupLabel}>Pickup:</Text>
              {loadingAddress ? (
                <ActivityIndicator size="small" color="#00C851" />
              ) : (
                <Text style={styles.pickupAddress} numberOfLines={2}>
                  {pickupAddress ?? 'Loading...'}
                </Text>
              )}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDecline}
              >
                <Text style={styles.declineButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptButton, acceptingId === latestPendingTrip?.id && styles.acceptButtonDisabled]}
                onPress={() => latestPendingTrip && handleAcceptMission(latestPendingTrip)}
                disabled={acceptingId === latestPendingTrip?.id}
              >
                <Text style={styles.acceptButtonText}>
                  {acceptingId === latestPendingTrip?.id ? 'Accepting...' : 'Accept'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A174E',
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingHorizontal: 16,
  },
  title: {
    color: '#F5F5F5',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#142850',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  fee: {
    color: '#00C851',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  feeLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 16,
  },
  pickupRow: {
    marginBottom: 24,
  },
  pickupLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 4,
  },
  pickupAddress: {
    color: '#F5F5F5',
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  declineButtonText: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#00C851',
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
