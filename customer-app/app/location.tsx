import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { ArrowLeft, Navigation, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const PRIMARY = '#1A3FFF';

const INITIAL_REGION = {
    latitude: 28.6139,
    longitude: 77.2090, // Default to New Delhi
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
};

export default function LocationScreen() {
    const router = useRouter();
    const mapRef = useRef<MapView>(null);

    const [loading, setLoading] = useState(false);
    const [fetchingLocation, setFetchingLocation] = useState(true);

    // Map State
    const [mapRegion, setMapRegion] = useState<Region>(INITIAL_REGION);
    const [isMoving, setIsMoving] = useState(false);

    // Reverse Geocoded Address Info
    const [addressTitle, setAddressTitle] = useState('Locating...');
    const [fullAddress, setFullAddress] = useState('Please wait...');
    const [currentCity, setCurrentCity] = useState('');

    const geocodePosition = useCallback(async (latitude: number, longitude: number) => {
        try {
            setAddressTitle('Loading...');
            setFullAddress('Fetching address details...');

            const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (address) {
                // Determine broad city text
                const city = address.city || address.subregion || address.district || 'Unknown City';
                setCurrentCity(city);

                // Determine precise title (e.g. Building Name, Street)
                const title = address.name || address.street || city;
                setAddressTitle(title);

                // Build a nicely formatted full address
                const rawParts = [title, address.street, address.district, city, address.region, address.postalCode];
                const parts: string[] = rawParts
                    .filter((p): p is string => Boolean(p))
                    // Remove duplicates
                    .reduce<string[]>((acc, curr) => acc.includes(curr) ? acc : [...acc, curr], []);

                setFullAddress(parts.join(', '));
            } else {
                setAddressTitle('Location Selected');
                setFullAddress('No address details found for this point.');
            }
        } catch (e) {
            console.warn(e);
            setAddressTitle('Location Selected');
            setFullAddress('Error fetching details.');
        }
    }, []);

    const requestAndFetchLocation = useCallback(async () => {
        try {
            setFetchingLocation(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Please grant location permission to detect your current area.');
                setFetchingLocation(false);
                return;
            }

            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const initialPos = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            };
            setMapRegion(initialPos);
            mapRef.current?.animateToRegion(initialPos, 500);
            await geocodePosition(initialPos.latitude, initialPos.longitude);
        } catch (e) {
            console.warn(e);
            Alert.alert('Error', 'Could not get your location. Please move the pin manually.');
        } finally {
            setFetchingLocation(false);
        }
    }, [geocodePosition]);

    useEffect(() => {
        requestAndFetchLocation();
    }, [requestAndFetchLocation]);

    const handleRegionChangeComplete = (region: Region) => {
        setIsMoving(false);
        setMapRegion(region);
        geocodePosition(region.latitude, region.longitude);
    };

    const handleRegionChange = () => {
        setIsMoving(true);
    };

    const saveLocationAndContinue = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase
                    .from('profiles')
                    .update({
                        city: currentCity || addressTitle,
                        preferred_location_lat: mapRegion.latitude,
                        preferred_location_lng: mapRegion.longitude,
                    })
                    .eq('id', user.id);
            }
            router.replace('/(tabs)');
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            {/* The Map */}
            <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={mapRegion}
                showsUserLocation={true}
                showsMyLocationButton={false}
                showsCompass={false}
                onRegionChange={handleRegionChange}
                onRegionChangeComplete={handleRegionChangeComplete}
            />

            {/* Static Center Pin overlay */}
            <View style={styles.centerPinContainer} pointerEvents="none">
                <View style={[styles.pinDrop, isMoving && styles.pinDropLifted]}>
                    <Text style={{ fontSize: 24 }}>📍</Text>
                </View>
                {/* Small shadow to show where it lands */}
                <View style={styles.pinShadow} />
            </View>

            {/* Top Back & Search Bar */}
            <SafeAreaView style={styles.topArea} pointerEvents="box-none">
                <View style={styles.searchRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
                        <ArrowLeft size={22} color="#111827" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.fakeSearchBtn} onPress={() => Alert.alert('Search', 'Search by text coming soon. For now please drag the map!')}>
                        <Search size={18} color="#9CA3AF" />
                        <Text style={styles.fakeSearchText}>Search for area, street name...</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* GPS Locate Me Button */}
            <TouchableOpacity
                style={styles.locateMeBtn}
                onPress={requestAndFetchLocation}
                disabled={fetchingLocation}
            >
                {fetchingLocation ? <ActivityIndicator size="small" color={PRIMARY} /> : <Navigation size={20} color={PRIMARY} />}
            </TouchableOpacity>

            {/* Bottom Sheet Modal Panel */}
            <View style={styles.bottomSheet}>
                <View style={styles.handleBar} />

                <View style={styles.addressHeader}>
                    <Text style={styles.headerTitle}>Select delivery location</Text>
                </View>

                <View style={styles.addressInfoBox}>
                    <View style={styles.addressIconWrap}>
                        <Text style={{ fontSize: 20 }}>📍</Text>
                    </View>
                    <View style={styles.addressTextColumn}>
                        <Text style={styles.addressTitleText} numberOfLines={1}>{addressTitle}</Text>
                        <Text style={styles.fullAddressText} numberOfLines={2}>{fullAddress}</Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.confirmBtn, (isMoving || fetchingLocation) && styles.confirmBtnDisabled]}
                    onPress={saveLocationAndContinue}
                    disabled={isMoving || fetchingLocation || loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.confirmBtnText}>Confirm Location</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFF',
    },
    map: {
        width: width,
        height: height,
    },
    topArea: {
        position: 'absolute',
        top: 0,
        width: '100%',
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    },
    fakeSearchBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#FFF',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    },
    fakeSearchText: {
        fontSize: 14,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    centerPinContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginLeft: -15, // half of pin w
        marginTop: -30, // full pin height offset so tip is center
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    pinDrop: {
        marginBottom: 4, // Space between tip and shadow
        transform: [{ translateY: 0 }],
    },
    pinDropLifted: {
        transform: [{ translateY: -10 }], // Lift pin when dragging map
    },
    pinShadow: {
        width: 12,
        height: 4,
        borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.2)',
        transform: [{ scaleX: 1.5 }],
    },
    locateMeBtn: {
        position: 'absolute',
        bottom: 240, // Above bottom sheet
        right: 16,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 5,
    },
    bottomSheet: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        backgroundColor: '#FFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 20,
    },
    handleBar: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E5E7EB',
        alignSelf: 'center',
        marginBottom: 20,
    },
    addressHeader: {
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
    },
    addressInfoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        marginBottom: 24,
    },
    addressIconWrap: {
        marginTop: 2,
    },
    addressTextColumn: {
        flex: 1,
    },
    addressTitleText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    fullAddressText: {
        fontSize: 13,
        color: '#6B7280',
        lineHeight: 18,
    },
    confirmBtn: {
        backgroundColor: PRIMARY,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    confirmBtnDisabled: {
        backgroundColor: '#93A8FF',
        shadowOpacity: 0,
        elevation: 0,
    },
    confirmBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
