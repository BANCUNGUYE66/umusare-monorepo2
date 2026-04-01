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
  Animated,
  Easing,
  Vibration,
} from 'react-native';
import MapView, { PROVIDER_DEFAULT, Marker, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabaseClient } from '../lib/supabaseClient';
import { calculateBaseFee } from '../../../../packages/shared-logic/calculateBaseFee';
import { tierAccentColor, tierDisplayName } from '../../../../packages/shared-logic/driverTier';
import PrimaryButton from '../PrimaryButton';
import type { Profile } from '../../../../packages/shared-logic/types';

const KIGALI_CENTER = { latitude: -1.9441, longitude: 30.0899 };
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

// Custom map styles for a more professional look.
// Switch MAP_STYLE to MAP_STYLE_SILVER if you prefer the silver theme.
const MAP_STYLE_SILVER = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d8d8d8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
] as any;

const MAP_STYLE_NIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f6d4a' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a6b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
] as any;

const MAP_STYLE = MAP_STYLE_SILVER;

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
  const insets = useSafeAreaInsets();
  const confirmAnim = useRef(new Animated.Value(0)).current;
  const completionBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [fareModalVisible, setFareModalVisible] = useState(false);
  const [fareAmount, setFareAmount] = useState<number>(0);
  const [confirmingFare, setConfirmingFare] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [pendingRatingTripId, setPendingRatingTripId] = useState<string | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    text: string;
    tone: 'info' | 'success';
  } | null>(null);

  useEffect(() => {
    Animated.timing(confirmAnim, {
      toValue: destinationLocation ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [destinationLocation, confirmAnim]);

  const showStatusBanner = (
    text: string,
    tone: 'info' | 'success' = 'info'
  ) => {
    setStatusBanner({ text, tone });
  };

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
    setFareAmount(base_fee);
    setSearchOverlayMessage('Searching for Driver...');
    setIsSearching(true);
  };

  const clearActiveTripUi = () => {
    setCurrentTripId(null);
    setDriverId(null);
    setDriverProfile(null);
    setDriverLocation(null);
  };

  const handleConfirmFare = async () => {
    if (!currentTripId) return;
    if (!Number.isFinite(fareAmount) || fareAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }

    const tripIdForRating = currentTripId;
    const driverIdForRating = driverId;

    setConfirmingFare(true);
    try {
      const { error } = await supabaseClient
        .from('trips')
        .update({
          final_fare: fareAmount,
          client_payment_confirmed: true,
        })
        .eq('id', currentTripId);
      if (error) {
        Alert.alert('Error', `Could not confirm payment: ${error.message}`);
        return;
      }
      setFareModalVisible(false);
      showStatusBanner('Payment Confirmed', 'success');
      if (tripIdForRating && driverIdForRating) {
        setPendingRatingTripId(tripIdForRating);
        setRatingStars(0);
        setRatingModalVisible(true);
      } else {
        clearActiveTripUi();
      }
    } finally {
      setConfirmingFare(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!pendingRatingTripId || ratingStars < 1) {
      Alert.alert('Rating', 'Please tap the stars to rate your driver (1–5).');
      return;
    }
    setSubmittingRating(true);
    try {
      const { error } = await supabaseClient.rpc('submit_trip_rating', {
        p_trip_id: pendingRatingTripId,
        p_stars: ratingStars,
      });
      if (error) {
        Alert.alert('Error', error.message || 'Could not save rating.');
        return;
      }
      setRatingModalVisible(false);
      setPendingRatingTripId(null);
      clearActiveTripUi();
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleSkipRating = () => {
    setRatingModalVisible(false);
    setPendingRatingTripId(null);
    clearActiveTripUi();
  };

  useEffect(() => {
    if (!currentTripId) return;

    const channel = supabaseClient
      .channel(`trip-${currentTripId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${currentTripId}` },
        (payload) => {
          const trip = payload.new as {
            status: string;
            driver_id?: string | null;
            client_payment_confirmed?: boolean;
            final_fare?: number;
            base_fee?: number;
          };
          if (trip.status === 'arrived') {
            setIsSearching(false);
            Vibration.vibrate(300);
            showStatusBanner('Your Driver is Here!', 'success');
          } else if (trip.status === 'active') {
            setIsSearching(false);
            showStatusBanner('Your Driver is Coming');
            if (trip.driver_id) {
              setDriverId(trip.driver_id);
            }
          } else if (trip.status === 'ongoing') {
            setIsSearching(false);
            showStatusBanner('Trip Started', 'success');
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
            setStatusBanner(null);
            setFareModalVisible(false);
          } else if (trip.status === 'completed') {
            setIsSearching(false);
            showStatusBanner('Trip Ended. Thanks for riding with us!', 'success');
            if (!trip.client_payment_confirmed) {
              const suggestedFare = Number(trip.final_fare ?? trip.base_fee ?? 0);
              if (suggestedFare > 0) {
                setFareAmount(suggestedFare);
              }
              setFareModalVisible(true);
            } else {
              setDriverId(null);
              setDriverProfile(null);
              setDriverLocation(null);
              setCurrentTripId(null);
              setFareModalVisible(false);
            }
            if (completionBannerTimeoutRef.current) {
              clearTimeout(completionBannerTimeoutRef.current);
            }
            completionBannerTimeoutRef.current = setTimeout(() => {
              setStatusBanner(null);
            }, 4000);
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
    setStatusBanner(null);
    if (completionBannerTimeoutRef.current) {
      clearTimeout(completionBannerTimeoutRef.current);
      completionBannerTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (completionBannerTimeoutRef.current) {
        clearTimeout(completionBannerTimeoutRef.current);
      }
    };
  }, []);

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
        customMapStyle={MAP_STYLE}
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

      <View style={[styles.bottomSheet, { bottom: insets.bottom + 12 }]}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Where to?"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            editable={!isGeocoding}
          />
          {isGeocoding ? (
            <ActivityIndicator size="small" color="#0047AB" />
          ) : null}
        </View>

        {destinationLocation && (
          <Animated.View
            style={[
              styles.confirmButtonWrap,
              {
                opacity: confirmAnim,
                transform: [
                  {
                    translateY: confirmAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <PrimaryButton
              label="Confirm Destination"
              onPress={handleConfirmDestination}
              style={styles.confirmButton}
            />
          </Animated.View>
        )}
      </View>

      {driverProfile && (
        <View style={[styles.driverCard, { bottom: insets.bottom + 140 }]}>
          <View style={styles.driverCardRow}>
            <View style={styles.driverCardMain}>
              <View style={styles.driverNameRow}>
                <Text style={styles.driverName}>
                  {driverProfile.full_name || 'Your driver'}
                </Text>
                {(driverProfile as any).driver_tier &&
                (driverProfile as any).driver_tier !== 'normal' ? (
                  <View
                    style={[
                      styles.tierPill,
                      {
                        borderColor: tierAccentColor((driverProfile as any).driver_tier),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tierPillText,
                        { color: tierAccentColor((driverProfile as any).driver_tier) },
                      ]}
                    >
                      {tierDisplayName((driverProfile as any).driver_tier)}
                    </Text>
                  </View>
                ) : null}
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

      {statusBanner && (
        <View
          style={[
            styles.statusBanner,
            statusBanner.tone === 'success' ? styles.statusBannerSuccess : styles.statusBannerInfo,
            { top: insets.top + 72 },
          ]}
        >
          <Text style={styles.statusBannerText}>{statusBanner.text}</Text>
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

      <Modal visible={fareModalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.fareModal}>
            <Text style={styles.fareTitle}>Confirm Trip Amount</Text>
            <Text style={styles.fareSubtitle}>
              Trip ended. Confirm amount to finalize payment.
            </Text>
            <View style={styles.fareAmountBox}>
              <Text style={styles.fareAmountLabel}>Amount to pay</Text>
              <Text style={styles.fareAmountValue}>
                {fareAmount.toLocaleString()} RWF
              </Text>
            </View>
            <PrimaryButton
              label={confirmingFare ? 'Confirming...' : 'Confirm Amount'}
              onPress={handleConfirmFare}
              disabled={confirmingFare}
              style={styles.fareConfirmButton}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={ratingModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.ratingModal}>
            <Text style={styles.ratingTitle}>Rate your driver</Text>
            <Text style={styles.ratingSubtitle}>How was your trip?</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRatingStars(n)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.starGlyph}>{n <= ratingStars ? '★' : '☆'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <PrimaryButton
              label={submittingRating ? 'Sending...' : 'Submit rating'}
              onPress={handleSubmitRating}
              disabled={submittingRating || ratingStars < 1}
              style={styles.ratingSubmitButton}
            />
            <TouchableOpacity onPress={handleSkipRating} style={styles.skipRatingBtn}>
              <Text style={styles.skipRatingText}>Skip</Text>
            </TouchableOpacity>
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
  bottomSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    fontSize: 16,
    color: '#111827',
    padding: 0,
    flex: 1,
  },
  confirmButton: {
    marginTop: 12,
    width: '100%',
  },
  confirmButtonWrap: {
    width: '100%',
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
  fareModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '88%',
    maxWidth: 360,
  },
  fareTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '700',
  },
  fareSubtitle: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 14,
  },
  fareAmountBox: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
  },
  fareAmountLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
  },
  fareAmountValue: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '800',
  },
  fareConfirmButton: {
    width: '100%',
  },
  ratingModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    width: '88%',
    maxWidth: 360,
    alignItems: 'center',
  },
  ratingTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '700',
  },
  ratingSubtitle: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 20,
  },
  starGlyph: {
    fontSize: 40,
    color: '#FBBF24',
  },
  ratingSubmitButton: {
    width: '100%',
    marginBottom: 8,
  },
  skipRatingBtn: {
    paddingVertical: 10,
  },
  skipRatingText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  tierPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tierPillText: {
    fontSize: 11,
    fontWeight: '800',
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
  statusBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  statusBannerInfo: {
    backgroundColor: '#0047AB',
    shadowColor: '#0047AB',
  },
  statusBannerSuccess: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  statusBannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
