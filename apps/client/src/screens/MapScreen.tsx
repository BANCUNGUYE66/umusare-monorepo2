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
  Pressable,
  Keyboard,
  Linking,
  Alert,
  Animated,
  Easing,
  Vibration,
  Image,
} from 'react-native';
import MapView, { PROVIDER_DEFAULT, Marker, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabaseClient } from '../lib/supabaseClient';
import { calculateTieredFee } from '../../../../packages/shared-logic/calculateBaseFee';
import { tierAccentColor, tierDisplayName } from '../../../../packages/shared-logic/driverTier';
import GlassSurface from '../components/GlassSurface';
import SwipeButton from '../components/SwipeButton';
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

// Extra-light map for glass UI (pale streets, minimal POI)
const MAP_STYLE_GLASS = [
  { elementType: 'geometry', stylers: [{ color: '#f0f2f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f0f2f5' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8eaef' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dde3ea' }] },
] as any;

const MAP_STYLE = MAP_STYLE_GLASS;

function SearchingRadar() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  const rings = [0, 1, 2].map((i) => {
    const scale = pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4 + i * 0.35, 2.4 + i * 0.45],
    });
    const opacity = pulse.interpolate({
      inputRange: [0, 0.2, 0.6, 1],
      outputRange: [0, 0.35 - i * 0.08, 0.12, 0],
    });
    return (
      <Animated.View
        key={i}
        style={[
          styles.radarRing,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
    );
  });

  return <View style={styles.radarWrap}>{rings}</View>;
}

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

function initialsFromName(name: string | undefined | null): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
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
  const driverWelcomeShownForTripRef = useRef<string | null>(null);
  const [driverWelcomeSheetVisible, setDriverWelcomeSheetVisible] = useState(false);
  const [driverAvatarFailed, setDriverAvatarFailed] = useState(false);
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
  /** After driver is shown, client confirms the ride with swipe (separate from trip create). */
  const [rideConfirmed, setRideConfirmed] = useState(false);

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

  const requestTrip = async () => {
    if (!destinationLocation || !pickupLocation) return;

    const { data: sessionData } = await supabaseClient.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in to request a ride.');
      return;
    }

    const base_fee = calculateTieredFee('standard');
    setRideConfirmed(false);

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
      Alert.alert('Could not request ride', error.message ?? 'Please try again.');
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
    setRideConfirmed(false);
    driverWelcomeShownForTripRef.current = null;
    setDriverWelcomeSheetVisible(false);
  };

  /** Refetch trip row — catches missed realtime events and ensures driver_id is applied. */
  useEffect(() => {
    if (!currentTripId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseClient
        .from('trips')
        .select('driver_id, status')
        .eq('id', currentTripId)
        .single();
      if (cancelled || error || !data) return;
      const row = data as { driver_id?: string | null; status?: string };
      if (row.driver_id) {
        setDriverId(row.driver_id);
        setIsSearching(false);
      } else if (
        row.status === 'active' ||
        row.status === 'arrived' ||
        row.status === 'ongoing'
      ) {
        setIsSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTripId]);

  /** While searching, poll until driver_id appears (realtime can lag or be missed on some networks). */
  useEffect(() => {
    if (!isSearching || !currentTripId) return;
    const tick = async () => {
      const { data } = await supabaseClient
        .from('trips')
        .select('driver_id, status')
        .eq('id', currentTripId)
        .single();
      const row = data as { driver_id?: string | null; status?: string } | null;
      if (row?.driver_id) {
        setDriverId(row.driver_id);
        setIsSearching(false);
      }
    };
    const interval = setInterval(tick, 2500);
    tick();
    return () => clearInterval(interval);
  }, [isSearching, currentTripId]);

  useEffect(() => {
    if (!currentTripId || !driverProfile) return;
    if (driverWelcomeShownForTripRef.current === currentTripId) return;
    driverWelcomeShownForTripRef.current = currentTripId;
    setDriverWelcomeSheetVisible(true);
  }, [currentTripId, driverProfile?.id]);

  useEffect(() => {
    setDriverAvatarFailed(false);
  }, [driverId]);

  const confirmRideWithSwipe = () => {
    setRideConfirmed(true);
    setDriverWelcomeSheetVisible(false);
    Vibration.vibrate(220);
    showStatusBanner('Ride confirmed — your driver is on the way', 'success');
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
          if (trip.driver_id) {
            setDriverId(trip.driver_id);
            setIsSearching(false);
          }
          if (trip.status === 'arrived') {
            setIsSearching(false);
            Vibration.vibrate(300);
            showStatusBanner('Your Driver is Here!', 'success');
          } else if (trip.status === 'active') {
            setIsSearching(false);
            showStatusBanner('Your Driver is Coming');
          } else if (trip.status === 'ongoing') {
            setIsSearching(false);
            showStatusBanner('Trip Started', 'success');
          } else if (trip.status === 'cancelled') {
            setSearchOverlayMessage('Searching for Driver...');
            setDriverId(null);
            setDriverProfile(null);
            setDriverLocation(null);
            setCurrentTripId(null);
            setIsSearching(false);
            setRideConfirmed(false);
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
      if (!isMounted) return;
      if (error || !data) {
        if (error) {
          console.warn('[MapScreen] Could not load driver profile:', error.message);
        }
        setDriverProfile({
          id: driverId,
          full_name: 'Your driver',
        } as Profile);
        return;
      }
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
    setRideConfirmed(false);
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

  const driverPhone = (driverProfile as Profile & { phone?: string })?.phone;
  const licenseCategories = (driverProfile as Profile & { license_categories?: string })
    ?.license_categories;
  const driverAvatarUrl = (driverProfile as Profile & { avatar_url?: string })?.avatar_url;

  const initialRegion = {
    ...(pickupLocation ?? KIGALI_CENTER),
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  /** Hide booking UI as soon as a trip exists, search runs, or a driver is assigned (don’t wait for profile fetch). */
  const showDestinationChrome =
    currentTripId == null && !isSearching && driverId == null;
  /** Below floating app header (padding + glass bar + gap; SafeAreaView already insets the screen). */
  const statusBannerTop = 60;

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

      {/* City label — reference UI */}
      <View style={styles.cityLabelWrap} pointerEvents="none">
        <Text style={styles.cityLabel}>Kigali</Text>
      </View>

      {showDestinationChrome && (
        <View style={[styles.bottomSheetOuter, { bottom: insets.bottom + 12 }]}>
          <GlassSurface style={styles.bottomSheet}>
            <View style={styles.searchRow}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Where to?"
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchSubmit}
                returnKeyType="search"
                editable={!isGeocoding}
              />
              {isGeocoding ? (
                <ActivityIndicator size="small" color="#2563EB" />
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
                <Text style={styles.tierSectionLabel}>Estimated fare</Text>
                <View style={styles.standardFareRow}>
                  <View style={styles.standardFareLeft}>
                    <Text style={styles.standardFareEmoji}>🚗</Text>
                    <Text style={styles.standardFareLabel}>Standard</Text>
                  </View>
                  <Text style={styles.standardFareValue}>
                    {calculateTieredFee('standard').toLocaleString()} RWF
                  </Text>
                </View>
                <Text style={styles.estimateHint}>
                  Next we&apos;ll find a driver and show them on the map — then you confirm your ride.
                </Text>
                <PrimaryButton
                  label="Find a driver"
                  onPress={requestTrip}
                  style={styles.findDriverBtn}
                />
              </Animated.View>
            )}
          </GlassSurface>
        </View>
      )}

      {driverProfile && (
        <>
          <View
            style={[
              styles.etaChip,
              {
                bottom:
                  insets.bottom +
                  (rideConfirmed ? 268 : 360),
              },
            ]}
          >
            <Text style={styles.etaChipLabel}>ETA</Text>
            <Text style={styles.etaChipValue}>
              {etaMins} {etaMins === 1 ? 'min' : 'mins'}
            </Text>
          </View>
          <GlassSurface style={[styles.driverCard, { bottom: insets.bottom + 118 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.driverCardRow}>
              {driverAvatarUrl && !driverAvatarFailed ? (
                <Image
                  source={{ uri: driverAvatarUrl }}
                  style={styles.driverAvatar}
                  onError={() => setDriverAvatarFailed(true)}
                />
              ) : (
                <View style={styles.driverAvatarPlaceholder}>
                  <Text style={styles.driverAvatarInitials}>
                    {initialsFromName(driverProfile.full_name)}
                  </Text>
                </View>
              )}
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
                </View>
                {driverPhone ? (
                  <Text style={styles.driverPhoneText}>📱 {driverPhone}</Text>
                ) : (
                  <Text style={styles.driverMetaMuted}>Phone not on file</Text>
                )}
                {licenseCategories ? (
                  <Text style={styles.driverLicenseText}>
                    Licence: {licenseCategories}
                  </Text>
                ) : null}
                <Text style={styles.driverSubEta}>
                  Arriving in {etaMins} {etaMins === 1 ? 'min' : 'mins'}
                </Text>
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
            {!rideConfirmed ? (
              <View style={styles.confirmSwipeWrap}>
                <SwipeButton
                  label="Slide to confirm ride"
                  variant="glass"
                  onSwipeSuccess={confirmRideWithSwipe}
                />
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelTrip}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel Trip</Text>
            </TouchableOpacity>
          </GlassSurface>
        </>
      )}

      {statusBanner && (
        <View style={[styles.statusBannerOuter, { top: statusBannerTop }]}>
          <GlassSurface
            style={[
              styles.statusBannerGlass,
              statusBanner.tone === 'success'
                ? styles.statusBannerGlassSuccess
                : styles.statusBannerGlassInfo,
            ]}
          >
            <Text
              style={[
                styles.statusBannerGlassText,
                statusBanner.tone === 'success'
                  ? styles.statusBannerGlassTextSuccess
                  : styles.statusBannerGlassTextInfo,
              ]}
            >
              {statusBanner.text}
            </Text>
          </GlassSurface>
        </View>
      )}

      {isSearching && (
        <View style={styles.searchingLayer} pointerEvents="box-none">
          <SearchingRadar />
          <View style={[styles.searchingBottomSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color="#64748B" />
              <Text style={styles.searchingText}>{searchOverlayMessage}</Text>
            </View>
          </View>
        </View>
      )}

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

      <Modal
        visible={driverWelcomeSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDriverWelcomeSheetVisible(false)}
      >
        <View style={styles.tripWelcomeRoot}>
          <Pressable
            style={styles.tripWelcomeDim}
            onPress={() => setDriverWelcomeSheetVisible(false)}
          />
          <GlassSurface
            style={[styles.tripWelcomeSheet, { paddingBottom: insets.bottom + 16 }]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.tripWelcomeTitle}>Driver on the way</Text>
            <View style={styles.tripWelcomeHeadRow}>
              {driverAvatarUrl && !driverAvatarFailed ? (
                <Image
                  source={{ uri: driverAvatarUrl }}
                  style={styles.tripWelcomeAvatar}
                  onError={() => setDriverAvatarFailed(true)}
                />
              ) : (
                <View style={styles.tripWelcomeAvatarPh}>
                  <Text style={styles.tripWelcomeAvatarTxt}>
                    {initialsFromName(driverProfile?.full_name)}
                  </Text>
                </View>
              )}
              <View style={styles.tripWelcomeHeadText}>
                <Text style={styles.tripWelcomeSubtitle}>
                  {driverProfile?.full_name
                    ? `${driverProfile.full_name} is heading to you`
                    : 'Your driver is heading to you'}
                </Text>
                {driverPhone ? (
                  <Text style={styles.tripWelcomePhone}>📱 {driverPhone}</Text>
                ) : null}
                {licenseCategories ? (
                  <Text style={styles.tripWelcomeLicense}>Licence: {licenseCategories}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.tripWelcomeFareRow}>
              <Text style={styles.tripWelcomeFareLabel}>Trip fare</Text>
              <Text style={styles.tripWelcomeFareValue}>
                {Number(fareAmount || calculateTieredFee('standard')).toLocaleString()} RWF
              </Text>
            </View>
            <Text style={styles.tripWelcomeHint}>
              Slide to confirm below when you’re ready. You can follow them on the map.
            </Text>
            <PrimaryButton
              label="Got it"
              onPress={() => setDriverWelcomeSheetVisible(false)}
              style={styles.tripWelcomeBtn}
            />
          </GlassSurface>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef1f6',
  },
  cityLabelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '36%',
    alignItems: 'center',
  },
  cityLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(55,65,81,0.85)',
    letterSpacing: 0.3,
  },
  bottomSheetOuter: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
  },
  bottomSheet: {
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchIcon: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '400',
  },
  searchInput: {
    fontSize: 16,
    color: '#0f172a',
    padding: 0,
    flex: 1,
  },
  confirmButton: {
    marginTop: 12,
    width: '100%',
  },
  confirmButtonWrap: {
    width: '100%',
    marginTop: 4,
    gap: 12,
  },
  estimateHint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  findDriverBtn: {
    width: '100%',
    borderRadius: 16,
  },
  confirmSwipeWrap: {
    width: '100%',
    marginTop: 12,
  },
  tierSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  standardFareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    marginBottom: 4,
  },
  standardFareLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  standardFareEmoji: {
    fontSize: 22,
  },
  standardFareLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
  },
  standardFareValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2563EB',
  },
  searchingLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
    justifyContent: 'flex-end',
  },
  radarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '32%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    backgroundColor: 'transparent',
  },
  searchingBottomSheet: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,232,240,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 16,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
  },
  searchingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  tripWelcomeRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  tripWelcomeDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  tripWelcomeSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  tripWelcomeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  tripWelcomeSubtitle: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 0,
  },
  tripWelcomeHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  tripWelcomeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e2e8f0',
  },
  tripWelcomeAvatarPh: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(226,232,240,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(203,213,225,0.9)',
  },
  tripWelcomeAvatarTxt: {
    fontSize: 22,
    fontWeight: '800',
    color: '#475569',
  },
  tripWelcomeHeadText: {
    flex: 1,
    minWidth: 0,
  },
  tripWelcomePhone: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 6,
  },
  tripWelcomeLicense: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
  },
  tripWelcomeFareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(248,250,252,0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,232,240,0.95)',
    marginBottom: 12,
  },
  tripWelcomeFareLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tripWelcomeFareValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2563EB',
  },
  tripWelcomeHint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  tripWelcomeBtn: {
    width: '100%',
    borderRadius: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
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
  etaChip: {
    position: 'absolute',
    right: 20,
    zIndex: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,232,240,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    alignItems: 'flex-end',
  },
  etaChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  etaChipValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  driverCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 24,
    paddingTop: 4,
    paddingBottom: 14,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.75)',
    overflow: 'hidden',
  },
  driverCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e2e8f0',
  },
  driverAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(226,232,240,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(203,213,225,0.9)',
  },
  driverAvatarInitials: {
    fontSize: 18,
    fontWeight: '800',
    color: '#475569',
  },
  driverCardMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  driverPhoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  driverMetaMuted: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 4,
  },
  driverLicenseText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
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
  driverSubEta: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 4,
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
  statusBannerOuter: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 18,
    alignItems: 'center',
  },
  statusBannerGlass: {
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.6)',
    maxWidth: 420,
  },
  statusBannerGlassInfo: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  statusBannerGlassSuccess: {
    backgroundColor: 'rgba(236, 253, 245, 0.92)',
  },
  statusBannerGlassText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusBannerGlassTextInfo: {
    color: '#1d4ed8',
  },
  statusBannerGlassTextSuccess: {
    color: '#047857',
  },
});
