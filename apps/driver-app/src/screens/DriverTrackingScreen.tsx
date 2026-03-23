import React, { useState } from 'react';
import { StyleSheet, View, Text, Platform, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import MapView, { PROVIDER_DEFAULT, Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabaseClient } from '../lib/supabaseClient';
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
        <Text style={styles.bannerText}>Heading to client — Meet at pickup location</Text>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancelTrip}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator size="small" color="#F5F5F5" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Trip</Text>
          )}
        </TouchableOpacity>
      </View>
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
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '600',
  },
});
