import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Keyboard,
  Linking,
  Alert,
} from 'react-native';
import MapView, { PROVIDER_DEFAULT, Marker, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabaseClient } from '../lib/supabaseClient';
import { calculateBaseFee } from '../../../../packages/shared-logic/calculateBaseFee';
import type { Profile } from '../../../../packages/shared-logic/types';

const KIGALI_CENTER = { latitude: -1.9441, longitude: 30.0899 };
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

// Simple Haversine distance in km (rough approximation)
function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Rough ETA in mins: ~30 km/h avg in city
function estimateMins(
  driverLat: number,
  driverLng: number,
  clientLat: number,
  clientLng: number
): number {
  const km = distanceKm(driverLat, driverLng, clientLat, clientLng);
  return Math.max(1, Math.round((km / 0.5))); // ~30 km/h → ~2 min/km
}

async function geocodePlace(query: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const address = query.trim();
  if (!address) return null;
  const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(address + ', Kigali, Rwanda')}&key=${apiKey}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== 'OK' || !json.results?.[0]) return null;
  const loc = json.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [pickupLocation, setPickupLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchOverlayMessage, setSearchOverlayMessage] = useState('Searching for Driver...');
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverProfile, setDriverProfile] = useState<Profile | null>(null);
  const [driverLocation, setDriverLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      try {
        const location = await Location.getCurrentPositionAsync({});
        const coords = location.coords;
        setPickupLocation({ latitude: coords.latitude, longitude: coords.longitude });
      } catch (err) {
        console.error('Location error:', err);
      }
    })();
  }, []);

  const handleMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setDestinationLocation({ latitude, longitude });
  };

  const handleSearchSubmit = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    Keyboard.dismiss();
    setIsGeocoding(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('Google Maps API key missing');
        return;
      }
      const coords = await geocodePlace(query, apiKey);
      if (coords) {
        const dest = { latitude: coords.lat, longitude: coords.lng };
        setDestinationLocation(dest);
        mapRef.current?.animateToRegion({
          ...dest,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 500);
      }
    } catch (err) {
      console.error('Geocode error:', err);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleConfirmDestination = async () => {
    if (!destinationLocation || !pickupLocation) return;

    const { data: sessionData } = await supabaseClient.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) {
      console.error('No authenticated user');
      return;
    }

    const base_fee = calculateBaseFee();

    const { data: inserted, error } = await supabaseClient
      .from('trips')
      .insert({
        client_id: userId,
        status: 'pending',
        base_fee,
        client_lat: pickupLocation.latitude,
        client_lng: pickupLocation.longitude,
        destination_lat: destinationLocation.latitude,
        destination_lng: destinationLocation.longitude,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Trip insert error:', error);
      return;
    }

    setCurrentTripId(inserted?.id ?? null);
    setSearchOverlayMessage('Searching for Driver...');
    setIsSearching(true);
  };

  useEffect(() => {
    if (!currentTripId) return;

    const channel = supabaseClient
      .channel(`trip-${currentTripId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${currentTripId}` },
        (payload) => {
          const trip = payload.new as { status: string; driver_id?: string | null };
          if (trip.status === 'active') {
            setSearchOverlayMessage('Driver is coming!');
            if (trip.driver_id) {
              setDriverId(trip.driver_id);
            }
          } else if (trip.status === 'cancelled') {
            setSearchOverlayMessage('Searching for Driver...');
            setDriverId(null);
            setDriverProfile(null);
            setDriverLocation(null);
            setCurrentTripId(null);
            setIsSearching(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [currentTripId]);

  useEffect(() => {
    if (!driverId) return;

    let isMounted = true;

    const fetchDriverProfile = async () => {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', driverId)
        .single();
      if (error || !data || !isMounted) return;
      const row = data as any;
      setDriverProfile(row as Profile);
      if (row.location_lat != null && row.location_lng != null) {
        const loc = {
          latitude: row.location_lat as number,
          longitude: row.location_lng as number,
        };
        setDriverLocation(loc);
        mapRef.current?.animateCamera(
          {
            center: loc,
          },
          { duration: 500 }
        );
      }
    };

    fetchDriverProfile();

    const driverChannel = supabaseClient
      .channel(`driver-${driverId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${driverId}` },
        (payload) => {
          const row = payload.new as any;
          setDriverProfile(row as Profile);
          if (row.location_lat != null && row.location_lng != null) {
            const loc = {
              latitude: row.location_lat as number,
              longitude: row.location_lng as number,
            };
            setDriverLocation(loc);
            mapRef.current?.animateCamera(
              {
                center: loc,
              },
              { duration: 500 }
            );
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabaseClient.removeChannel(driverChannel);
    };
  }, [driverId]);

  const handleCallDriver = () => {
    const phone = (driverProfile as any)?.phone;
    if (!phone) {
      Alert.alert('No phone number', 'Driver phone number is not available.');
      return;
    }
    const tel = phone.replace(/\D/g, '');
    const uri = tel.startsWith('250') ? `tel:+${tel}` : `tel:+250${tel}`;
    Linking.openURL(uri).catch(() => {
      Alert.alert('Cannot call', 'Unable to place call. Check phone number.');
    });
  };

  const handleCancelTrip = async () => {
    if (!currentTripId) return;
    const { error } = await supabaseClient
      .from('trips')
      .update({ status: 'cancelled' })
      .eq('id', currentTripId);
    if (error) {
      console.error('Cancel trip error:', error);
      Alert.alert('Error', 'Failed to cancel trip.');
      return;
    }
    setCurrentTripId(null);
    setIsSearching(false);
    setDriverId(null);
    setDriverProfile(null);
    setDriverLocation(null);
  };

  const etaMins =
    pickupLocation && driverLocation
      ? estimateMins(
          driverLocation.latitude,
          driverLocation.longitude,
          pickupLocation.latitude,
          pickupLocation.longitude
        )
      : 5;

  const carDetails = [
    (driverProfile as any)?.car_model,
    (driverProfile as any)?.plate_number,
  ]
    .filter(Boolean)
    .join(' • ');

  const initialRegion = {
    ...(pickupLocation ?? KIGALI_CENTER),
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation={true}
        onPress={handleMapPress}
      >
        {driverLocation && (
          <Marker coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.carMarker}>
              <Text style={styles.carMarkerText}>🚗</Text>
            </View>
          </Marker>
        )}
        {destinationLocation && (
          <Marker
            coordinate={destinationLocation}
            title="Destination"
            pinColor={Platform.OS === 'ios' ? undefined : '#e74c3c'}
          />
        )}
      </MapView>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Where to?"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
          editable={!isGeocoding}
        />
        {isGeocoding && (
          <ActivityIndicator size="small" style={styles.searchSpinner} />
        )}
      </View>

      {destinationLocation && (
        <View style={styles.confirmContainer}>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirmDestination}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmButtonText}>Confirm Destination</Text>
          </TouchableOpacity>
        </View>
      )}

      {driverProfile && (
        <View style={styles.driverCard}>
          <View style={styles.driverCardRow}>
            <View style={styles.driverCardMain}>
              <View style={styles.driverNameRow}>
                <Text style={styles.driverName}>
                  {driverProfile.full_name || 'Your driver'}
                </Text>
                <Text style={styles.etaText}>
                  Arriving in {etaMins} {etaMins === 1 ? 'min' : 'mins'}
                </Text>
              </View>
              <Text style={styles.driverRating}>
                ⭐ {driverProfile.rating?.toFixed(1) ?? '5.0'}
              </Text>
              {carDetails ? (
                <Text style={styles.carDetails}>{carDetails}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCallDriver}
              activeOpacity={0.8}
            >
              <Text style={styles.callButtonIcon}>📞</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelTrip}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>Cancel Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={isSearching} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayContent}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.overlayText}>{searchOverlayMessage}</Text>
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
  searchContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    fontSize: 16,
    color: '#333',
    padding: 0,
    flex: 1,
  },
  searchSpinner: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
  },
  confirmContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#0A174E',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    backgroundColor: '#142850',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 220,
  },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  driverCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 110 : 90,
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  driverCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  driverCardMain: {
    flex: 1,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  etaText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  driverRating: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 2,
  },
  carDetails: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00C851',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  callButtonIcon: {
    fontSize: 22,
  },
  cancelButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
  carMarker: {
    backgroundColor: '#111827',
    padding: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FBBF24',
  },
  carMarkerText: {
    fontSize: 14,
    color: '#FBBF24',
  },
});
