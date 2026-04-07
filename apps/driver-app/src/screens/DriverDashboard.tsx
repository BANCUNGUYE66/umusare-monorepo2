import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabaseClient } from '../lib/supabaseClient';
import GlassSurface from '../components/GlassSurface';
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
  onActiveTripChange?: (active: boolean) => void;
}

export default function DriverDashboard({
  isOnline,
  offlineReason,
  onActiveTripChange,
}: DriverDashboardProps) {
  const insets = useSafeAreaInsets();
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  useEffect(() => {
    onActiveTripChange?.(!!activeTrip);
  }, [activeTrip, onActiveTripChange]);

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
  const bottomPad = Math.max(insets.bottom, 16) + 96;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: 56, paddingBottom: bottomPad },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>Dashboard</Text>
      <Text style={styles.screenSubtitle}>
        {!isOnline
          ? offlineReason || 'You are offline — turn on to receive missions'
          : hasPendingMission
            ? 'New mission available'
            : 'Waiting for missions…'}
      </Text>

      <GlassSurface style={styles.card}>
        <Text style={styles.cardHint}>
          {isOnline
            ? 'Stay online to get ride requests near you.'
            : 'Go online from the bar below when you are ready to drive.'}
        </Text>
      </GlassSurface>

      <Modal visible={hasPendingMission} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDim} onPress={handleDecline} />
          <GlassSurface
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>New mission</Text>
            <Text style={styles.fee}>
              {latestPendingTrip?.base_fee.toLocaleString() ?? 0} RWF
            </Text>
            <Text style={styles.feeLabel}>Estimated fare</Text>
            <View style={styles.pickupRow}>
              <Text style={styles.pickupLabel}>Pickup</Text>
              {loadingAddress ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={styles.pickupAddress} numberOfLines={3}>
                  {pickupAddress ?? 'Loading…'}
                </Text>
              )}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.declineButton} onPress={handleDecline}>
                <Text style={styles.declineButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.acceptButton,
                  acceptingId === latestPendingTrip?.id && styles.acceptButtonDisabled,
                ]}
                onPress={() => latestPendingTrip && handleAcceptMission(latestPendingTrip)}
                disabled={acceptingId === latestPendingTrip?.id}
              >
                <Text style={styles.acceptButtonText}>
                  {acceptingId === latestPendingTrip?.id ? 'Accepting…' : 'Accept'}
                </Text>
              </TouchableOpacity>
            </View>
          </GlassSurface>
        </View>
      </Modal>
    </ScrollView>
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
    marginBottom: 18,
    lineHeight: 22,
  },
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cardHint: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  fee: {
    color: '#16a34a',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4,
  },
  feeLabel: {
    color: '#64748B',
    fontSize: 14,
    marginBottom: 16,
    fontWeight: '600',
  },
  pickupRow: {
    marginBottom: 22,
  },
  pickupLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pickupAddress: {
    color: '#0f172a',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(241,245,249,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.95)',
  },
  declineButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '700',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#16a34a',
  },
  acceptButtonDisabled: {
    opacity: 0.65,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
