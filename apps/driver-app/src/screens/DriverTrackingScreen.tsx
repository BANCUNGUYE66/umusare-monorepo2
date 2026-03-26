import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
} from 'react-native';
import MapView, { PROVIDER_DEFAULT, Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabaseClient } from '../lib/supabaseClient';
import SwipeButton from '../components/SwipeButton';
import type { Trip } from '../../../../packages/shared-logic/types';

// Custom map style (Silver) for a clean minimalist look.
const MAP_STYLE_SILVER = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d8d8d8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
] as any;

interface DriverTrackingScreenProps {
  trip: Trip;
  onComplete?: () => void;
}

export default function DriverTrackingScreen({ trip, onComplete }: DriverTrackingScreenProps) {
  const [cancelling, setCancelling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [tripStatus, setTripStatus] = useState(trip.status || 'active');
  const [tripData, setTripData] = useState<Trip>(trip);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [autoSettling, setAutoSettling] = useState(false);
  const [showConfirmedState, setShowConfirmedState] = useState(false);
  const confirmScale = useRef(new Animated.Value(0.8)).current;
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const handleCancelTrip = () => {
    Alert.alert(
      'Cancel Trip',
      'Are you sure you want to cancel this trip? The client will be notified.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const { error } = await supabaseClient
                .from('trips')
                .update({ status: 'cancelled' })
                .eq('id', trip.id);
              if (error) {
                console.error('Cancel trip error:', error);
                Alert.alert('Error', 'Could not cancel trip. Returning to dashboard.');
              }
            } finally {
              setCancelling(false);
              onComplete?.();
            }
          },
        },
      ]
    );
  };
  const pickupLocation =
    trip.client_lat != null && trip.client_lng != null
      ? { latitude: trip.client_lat, longitude: trip.client_lng }
      : null;
  const destinationLocation =
    trip.destination_lat != null && trip.destination_lng != null
      ? { latitude: trip.destination_lat, longitude: trip.destination_lng }
      : null;

  const initialRegion = pickupLocation
    ? {
        ...pickupLocation,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : { latitude: -1.9441, longitude: 30.0899, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const updateTripStatus = async (nextStatus: string) => {
    setUpdating(true);
    try {
      const { error } = await supabaseClient
        .from('trips')
        .update({ status: nextStatus })
        .eq('id', trip.id);
      if (error) {
        const message = error.message || 'Unknown Supabase error';
        Alert.alert('Error', `Could not update trip status to ${nextStatus}: ${message}`);
        return;
      }
      setTripStatus(nextStatus);
    } finally {
      setUpdating(false);
    }
  };

  const settleTripAndComplete = async () => {
    setUpdating(true);
    try {
      const gross = Number(tripData.final_fare ?? tripData.base_fee ?? 0);
      const commission = gross * 0.15;
      const net = gross - commission;

      const { data: sessionData } = await supabaseClient.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        Alert.alert('Error', 'No authenticated driver session.');
        return;
      }

      const { data: existingTx } = await supabaseClient
        .from('transactions')
        .select('id')
        .eq('trip_id', tripData.id)
        .limit(1);
      if ((existingTx ?? []).length > 0) {
        setPaymentModalVisible(false);
        onComplete?.();
        return;
      }

      const { data: profileRow, error: profileFetchError } = await supabaseClient
        .from('profiles')
        .select('wallet_balance, commission_due')
        .eq('id', userId)
        .single();
      if (profileFetchError) {
        Alert.alert(
          'Error',
          `Could not load wallet balance: ${profileFetchError.message || 'Unknown error'}`
        );
        return;
      }

      const currentBalance = Number((profileRow as any)?.wallet_balance ?? 0);
      const currentCommissionDue = Number((profileRow as any)?.commission_due ?? 0);
      const nextBalance = currentBalance + net;
      const nextCommissionDue = currentCommissionDue + commission;

      const { error: walletError } = await supabaseClient
        .from('profiles')
        .update({
          wallet_balance: nextBalance,
          commission_due: nextCommissionDue,
        })
        .eq('id', userId);
      if (walletError) {
        Alert.alert(
          'Error',
          `Trip completed but wallet update failed: ${walletError.message || 'Unknown error'}`
        );
        return;
      }

      const { error: txError } = await supabaseClient
        .from('transactions')
        .insert({
          driver_id: userId,
          trip_id: tripData.id,
          amount_gross: gross,
          commission_fee: commission,
          amount_net: net,
          type: 'credit',
        });
      if (txError) {
        Alert.alert(
          'Error',
          `Trip completed but transaction insert failed: ${txError.message || 'Unknown error'}`
        );
        return;
      }

      setTripStatus('completed');
      setPaymentModalVisible(false);
      onComplete?.();
    } finally {
      setUpdating(false);
      setAutoSettling(false);
    }
  };

  const swipeLabel =
    tripStatus === 'active'
      ? 'Slide to Arrive'
      : tripStatus === 'arrived'
        ? 'Slide to Start Trip'
        : 'Slide to End Trip';

  const handleSwipe = async () => {
    if (tripStatus === 'active') {
      await updateTripStatus('arrived');
      return;
    }
    if (tripStatus === 'arrived') {
      await updateTripStatus('ongoing');
      return;
    }
    await updateTripStatus('completed');
    setPaymentModalVisible(true);
  };

  useEffect(() => {
    const channel = supabaseClient
      .channel(`driver-trip-${trip.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${trip.id}` },
        (payload) => {
          const updatedTrip = payload.new as Trip;
          setTripData(updatedTrip);
          setTripStatus(updatedTrip.status);
          if (updatedTrip.status === 'completed') {
            setPaymentModalVisible(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [trip.id]);

  useEffect(() => {
    if (!paymentModalVisible) return;
    if (tripStatus !== 'completed') return;
    if (!tripData.client_payment_confirmed) return;
    if (updating) return;

    setShowConfirmedState(true);
    Animated.parallel([
      Animated.spring(confirmScale, {
        toValue: 1,
        useNativeDriver: true,
        bounciness: 10,
      }),
      Animated.timing(confirmOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    setAutoSettling(true);
    const timeout = setTimeout(() => {
      settleTripAndComplete();
    }, 900);

    return () => clearTimeout(timeout);
  }, [paymentModalVisible, tripStatus, tripData.client_payment_confirmed, updating]);

  useEffect(() => {
    if (!paymentModalVisible) {
      setShowConfirmedState(false);
      confirmScale.setValue(0.8);
      confirmOpacity.setValue(0);
    }
  }, [paymentModalVisible, confirmOpacity, confirmScale]);

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        customMapStyle={MAP_STYLE_SILVER}
        showsUserLocation={true}
      >
        {pickupLocation && (
          <Marker
            coordinate={pickupLocation}
            title="Pickup (Client)"
            pinColor={Platform.OS === 'ios' ? undefined : '#00C851'}
          />
        )}
        {destinationLocation && (
          <Marker
            coordinate={destinationLocation}
            title="Destination"
            pinColor={Platform.OS === 'ios' ? undefined : '#e74c3c'}
          />
        )}
      </MapView>
      <View style={[styles.banner, { bottom: insets.bottom + (Platform.OS === 'ios' ? 16 : 24) }]}>
        <Text style={styles.bannerText}>
          {tripStatus === 'active'
            ? 'Heading to client — Meet at pickup location'
            : tripStatus === 'arrived'
              ? 'Client reached — ready to start trip'
                : tripStatus === 'ongoing'
                  ? 'Trip ongoing — slide when at destination'
                  : 'Trip ended — confirm settlement below'}
        </Text>
        <Text style={styles.amountText}>
          Gross: {Number(tripData.final_fare ?? tripData.base_fee ?? 0).toLocaleString()} RWF
          {'  '}|{'  '}
          Commission (15%): {Math.round(Number(tripData.final_fare ?? tripData.base_fee ?? 0) * 0.15).toLocaleString()} RWF
        </Text>
        {updating ? (
          <ActivityIndicator size="small" color="#F5F5F5" />
        ) : (
          <SwipeButton
            label={swipeLabel}
            onSwipeSuccess={handleSwipe}
            disabled={cancelling || updating || tripStatus === 'completed'}
          />
        )}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancelTrip}
          disabled={cancelling || updating}
        >
          {cancelling ? (
            <ActivityIndicator size="small" color="#F5F5F5" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Trip</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={paymentModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Trip Amount</Text>
            <Text style={styles.modalSubtitle}>Waiting for client confirmation</Text>
            <Text style={styles.modalAmount}>
              {Number(tripData.final_fare ?? tripData.base_fee ?? 0).toLocaleString()} RWF
            </Text>
            <Text style={styles.modalBreakdown}>
              Commission (15%): {Math.round(Number(tripData.final_fare ?? tripData.base_fee ?? 0) * 0.15).toLocaleString()} RWF
            </Text>
            <Text style={styles.modalBreakdown}>
              You earn: {Math.round(Number(tripData.final_fare ?? tripData.base_fee ?? 0) * 0.85).toLocaleString()} RWF
            </Text>
            {!tripData.client_payment_confirmed ? (
              <Text style={styles.waitingText}>
                Client has not confirmed amount yet.
              </Text>
            ) : (
              <Animated.View
                style={[
                  styles.confirmedWrap,
                  {
                    opacity: confirmOpacity,
                    transform: [{ scale: confirmScale }],
                  },
                ]}
              >
                <Text style={styles.confirmedIcon}>✓</Text>
                <Text style={styles.confirmedText}>Client confirmed payment</Text>
              </Animated.View>
            )}
            {autoSettling || updating ? (
              <ActivityIndicator style={styles.settlingSpinner} color="#0047AB" />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#142850',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  bannerText: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  amountText: {
    color: '#D1D5DB',
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#64748B',
    marginTop: 8,
    fontSize: 14,
  },
  modalAmount: {
    color: '#0F172A',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 10,
  },
  modalBreakdown: {
    color: '#334155',
    fontSize: 14,
    marginTop: 6,
  },
  waitingText: {
    marginTop: 14,
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmedWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  confirmedIcon: {
    fontSize: 28,
    fontWeight: '900',
    color: '#16A34A',
  },
  confirmedText: {
    marginTop: 4,
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '700',
  },
  settlingSpinner: {
    marginTop: 12,
  },
});
