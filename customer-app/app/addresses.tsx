import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Briefcase, Edit3, Home, MapPin, Navigation, Plus, Star, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { AddressRowSkeleton } from '../components/SkeletonLoader';
import { useAddressStore } from '../lib/addressStore';
import { api } from '../lib/api';

const AddressesEmptyImg = require('../assets/images/search-empty.png');

const PRIMARY = '#1A3FFF';

interface Address {
    id: string;
    label: 'Home' | 'Work' | 'Other';
    name: string;
    address: string;
    landmark?: string;
    isDefault: boolean;
    latitude?: number;
    longitude?: number;
}

const LABEL_CONFIG = {
    Home: { Icon: Home, color: '#0369A1', bg: '#E0F2FE' },
    Work: { Icon: Briefcase, color: '#7C3AED', bg: '#EDE9FE' },
    Other: { Icon: MapPin, color: '#D97706', bg: '#FEF3C7' },
};

export default function AddressBookScreen() {
    const router = useRouter();
    const { selectable } = useLocalSearchParams();
    const { setSelectedAddress } = useAddressStore();

    const [addresses, setAddresses] = useState<Address[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<Address | null>(null);

    // Form
    const [label, setLabel] = useState<Address['label']>('Home');
    const [name, setName] = useState('');
    const [fullAddress, setFullAddress] = useState('');
    const [landmark, setLandmark] = useState('');

    // Map State
    const mapRef = useRef<MapView>(null);
    const [mapRegion, setMapRegion] = useState<Region>({
        latitude: 28.6139,
        longitude: 77.2090,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    });
    const [isMoving, setIsMoving] = useState(false);
    const [fetchingLocation, setFetchingLocation] = useState(false);
    const [geocoding, setGeocoding] = useState(false);
    const [pinLocation, setPinLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(false);
    const geocodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchAddresses = useCallback(async () => {
        setLoading(true);
        const { data, error } = await api.get('/api/v1/addresses');

        if (!error && data) {
            setAddresses(data.map((d: any) => ({
                id: d.id,
                label: d.label as any,
                name: d.name || d.label,
                address: d.full_address,
                landmark: d.landmark || '',
                isDefault: d.is_default,
                latitude: d.latitude,
                longitude: d.longitude
            })));
        }
        setLoading(false);
    }, []);

    const onRefresh = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await fetchAddresses();
    }, [fetchAddresses]);

    useEffect(() => {
        fetchAddresses();
    }, [fetchAddresses]);

    const requestAndFetchLocation = async () => {
        try {
            setFetchingLocation(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required. Please enable it in settings.');
                return;
            }
            
            // Try last known position first (fastest — no GPS wait time)
            let loc = await Location.getLastKnownPositionAsync({});
            
            // If no last known, get current (may take a few seconds)
            if (!loc) {
                loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            }

            if (loc) {
                const initialPos = {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                };
                // 1. Snap map & pin INSTANTLY — user sees their location right away
                setMapRegion(initialPos);
                setPinLocation({ lat: initialPos.latitude, lng: initialPos.longitude });
                setTimeout(() => { mapRef.current?.animateToRegion(initialPos, 400); }, 100);

                // 2. Geocode in background — fills address text when ready, non-blocking
                geocodePositionBackground(initialPos.latitude, initialPos.longitude);
            }
        } catch (e: any) { 
            console.warn('Location Error:', e);
        } finally { 
            setFetchingLocation(false); 
        }
    };

    // Fires immediately — sets pin coords right away, then resolves address string async
    const geocodePosition = (latitude: number, longitude: number, _forceUpdate: boolean = false) => {
        setPinLocation({ lat: latitude, lng: longitude });
        // Debounce: cancel previous pending geocode (happens when dragging map)
        if (geocodeDebounceRef.current) clearTimeout(geocodeDebounceRef.current);
        geocodeDebounceRef.current = setTimeout(() => {
            geocodePositionBackground(latitude, longitude);
        }, 600); // Wait 600ms after the user stops dragging before calling API
    };

    // Non-blocking geocode — resolves address string in background, never blocks UI
    const geocodePositionBackground = async (latitude: number, longitude: number) => {
        try {
            setGeocoding(true);
            const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (addr) {
                const parts: string[] = [addr.name, addr.street, addr.district, addr.city, addr.region, addr.postalCode]
                    .filter((p): p is string => Boolean(p))
                    .reduce<string[]>((acc, curr) => acc.includes(curr) ? acc : [...acc, curr], []);
                if (parts.length > 0) setFullAddress(parts.join(', '));
            }
        } catch (e) { 
            console.warn('Geocode Error:', e); 
        } finally {
            setGeocoding(false);
        }
    };

    const handleRegionChangeComplete = (region: Region) => {
        setIsMoving(false);
        setMapRegion(region);
        geocodePosition(region.latitude, region.longitude, true);
    };

    const openAdd = () => {
        setEditing(null); setLabel('Home'); setName(''); setFullAddress(''); setLandmark(''); setPinLocation(null);
        setMapReady(false); setMapError(false);
        setShowModal(true);
        // Defer map rendering to avoid New Arch crash, then fetch location
        setTimeout(() => { setMapReady(true); }, 500);
        setTimeout(() => requestAndFetchLocation(), 600);
    };

    const openEdit = (addr: Address) => {
        setEditing(addr);
        setLabel(addr.label); setName(addr.name); setFullAddress(addr.address); setLandmark(addr.landmark ?? '');
        setMapReady(false); setMapError(false);
        if (addr.latitude && addr.longitude) {
            const initialPos = { latitude: addr.latitude, longitude: addr.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 };
            setMapRegion(initialPos);
            setPinLocation({ lat: addr.latitude, lng: addr.longitude });
        }
        setShowModal(true);
        setTimeout(() => { setMapReady(true); }, 500);
    };

    const save = async () => {
        if (!name.trim() || !fullAddress.trim()) {
            Alert.alert('Required', 'Please enter a name and complete address.'); return;
        }
        setSaving(true);
        try {
            // Prioritize the pin location from the map. Fallback to geocoding if something went wrong.
            let lat = pinLocation?.lat || editing?.latitude || null;
            let lng = pinLocation?.lng || editing?.longitude || null;

            if (!lat || !lng) {
                try {
                    const geoHits = await Location.geocodeAsync(fullAddress);
                    if (geoHits.length > 0) {
                        lat = geoHits[0].latitude;
                        lng = geoHits[0].longitude;
                    }
                } catch (_e) { console.warn("Could not geocode address"); }
            }

            const payload = {
                label,
                name,
                full_address: fullAddress,
                landmark,
                is_default: addresses.length === 0 || (editing?.isDefault ?? false),
                latitude: lat,
                longitude: lng
            };

            let res;
            if (editing) {
                res = await api.patch(`/api/v1/addresses/${editing.id}`, payload);
            } else {
                res = await api.post('/api/v1/addresses', payload);
            }

            if (res.error) throw new Error(res.error);

            setShowModal(false);
            fetchAddresses();
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setSaving(false); }
    };

    const deleteAddr = async (id: string) => {
        Alert.alert('Delete Address', 'Remove this address?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    const { error } = await api.delete(`/api/v1/addresses/${id}`);
                    if (error) Alert.alert('Error', error);
                    fetchAddresses();
                }
            },
        ]);
    };

    const setDefault = async (id: string) => {
        const { error } = await api.patch(`/api/v1/addresses/${id}`, { is_default: true });
        if (error) {
            Alert.alert('Error', error);
        } else {
            fetchAddresses();
        }
    };

    const handleSelectAddress = (addr: Address) => {
        if (selectable === 'true') {
            setSelectedAddress(addr);
            router.back();
        }
    };

    return (
        <SafeAreaView style={s.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Address Book</Text>
                <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                    <Plus size={18} color="#FFF" />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
            >
                {loading ? (
                    <View style={{ gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(i => <AddressRowSkeleton key={i} />)}
                    </View>
                ) : addresses.length === 0 ? (
                    <EmptyState
                        title="No Saved Addresses"
                        description="You haven't added any addresses yet. Add your home or work for faster bookings!"
                        imageSource={AddressesEmptyImg}
                        ctaLabel="Add Address"
                        onCtaPress={() => { setShowModal(true); setEditing(null); }}
                    />
                ) : (
                    addresses.map(addr => {
                        const cfg = LABEL_CONFIG[addr.label] || LABEL_CONFIG['Other'];
                        return (
                            <TouchableOpacity
                                key={addr.id}
                                style={[s.addrCard, selectable === 'true' && { borderColor: PRIMARY, borderWidth: 1 }]}
                                onPress={() => handleSelectAddress(addr)}
                                disabled={selectable !== 'true'}
                            >
                                <View style={s.addrLeft}>
                                    <View style={[s.addrIconWrap, { backgroundColor: cfg.bg }]}>
                                        <cfg.Icon size={18} color={cfg.color} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={s.addrTitleRow}>
                                            <Text style={s.addrName}>{addr.name}</Text>
                                            {addr.isDefault && (
                                                <View style={s.defaultBadge}>
                                                    <Star size={10} color={PRIMARY} fill={PRIMARY} />
                                                    <Text style={s.defaultText}>Default</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={s.addrText} numberOfLines={2}>{addr.address}</Text>
                                        {addr.landmark && <Text style={s.addrLandmark}>Near: {addr.landmark}</Text>}
                                        {!addr.latitude && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>GPS coordinates missing</Text>}
                                    </View>
                                </View>
                                <View style={s.addrActions}>
                                    {!addr.isDefault && (
                                        <TouchableOpacity style={s.actionBtn} onPress={() => setDefault(addr.id)}>
                                            <Star size={14} color="#9CA3AF" />
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(addr)}>
                                        <Edit3 size={14} color="#9CA3AF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.actionBtn} onPress={() => deleteAddr(addr.id)}>
                                        <Trash2 size={14} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}

                {!loading && addresses.length > 0 && (
                    <TouchableOpacity style={s.addRowBtn} onPress={openAdd}>
                        <Plus size={18} color={PRIMARY} />
                        <Text style={s.addRowBtnText}>Add New Address</Text>
                    </TouchableOpacity>
                )}
                <View style={{ height: 60 }} />
            </ScrollView>

            {/* Add/Edit Modal */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={s.overlay}>
                    <View style={s.sheet}>
                        <View style={s.sheetHandle} />
                        <Text style={s.sheetTitle}>{editing ? 'Edit Address' : 'Add New Address'}</Text>

                        {/* Interactive Mini Map - deferred to avoid New Arch crash */}
                        <View style={s.mapContainer}>
                            {mapError ? (
                                <View style={[s.miniMap, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }]}>
                                    <MapPin size={28} color="#9CA3AF" />
                                    <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Map unavailable</Text>
                                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>Enter address manually below</Text>
                                </View>
                            ) : !mapReady ? (
                                <View style={[s.miniMap, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }]}>
                                    <ActivityIndicator size="small" color={PRIMARY} />
                                    <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Loading map...</Text>
                                </View>
                            ) : (
                                <>
                                    <MapView
                                        ref={mapRef}
                                        style={s.miniMap}
                                        initialRegion={mapRegion}
                                        onRegionChange={() => setIsMoving(true)}
                                        onRegionChangeComplete={handleRegionChangeComplete}
                                        showsUserLocation={true}
                                        showsMyLocationButton={false}
                                        showsCompass={false}
                                        onMapReady={() => console.log('[Map] Ready')}
                                    />
                                    <View style={s.centerPinContainer} pointerEvents="none">
                                        <View style={[s.pinDrop, isMoving && s.pinDropLifted]}>
                                            <Text style={{ fontSize: 24 }}>📍</Text>
                                        </View>
                                    </View>
                                </>
                            )}
                            <TouchableOpacity
                                style={s.locateMeBtn}
                                onPress={requestAndFetchLocation}
                            >
                                {fetchingLocation ? <ActivityIndicator size="small" color={PRIMARY} /> : <Navigation size={18} color={PRIMARY} />}
                            </TouchableOpacity>
                        </View>
                        <Text style={s.mapHelpText}>{mapError ? 'Type your address below' : 'Drag map to pin your exact location'}</Text>

                        <Text style={s.fieldLabel}>Type</Text>
                        <View style={s.labelRow}>
                            {(['Home', 'Work', 'Other'] as const).map(l => (
                                <TouchableOpacity key={l} style={[s.labelChip, label === l && s.labelChipActive]} onPress={() => setLabel(l)}>
                                    <Text style={[s.labelChipText, label === l && s.labelChipTextActive]}>{l}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={s.fieldLabel}>Label (e.g. &quot;Mom&apos;s House&quot;)</Text>
                        <TextInput style={s.fieldInput} placeholder="Name for this address" placeholderTextColor="#9CA3AF" value={name} onChangeText={setName} />

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 12 }}>
                            <Text style={[s.fieldLabel, { marginBottom: 0, marginTop: 0 }]}>Full Address</Text>
                            {geocoding && <ActivityIndicator size="small" color={PRIMARY} />}
                            {geocoding && <Text style={{ fontSize: 11, color: '#9CA3AF' }}>Detecting...</Text>}
                        </View>
                        <TextInput style={[s.fieldInput, { height: 80, textAlignVertical: 'top' }]} placeholder="Street, area, city, pincode" placeholderTextColor="#9CA3AF" value={fullAddress} onChangeText={setFullAddress} multiline />

                        <Text style={s.fieldLabel}>Landmark (optional)</Text>
                        <TextInput style={s.fieldInput} placeholder="Near landmark" placeholderTextColor="#9CA3AF" value={landmark} onChangeText={setLandmark} />

                        <View style={s.sheetBtns}>
                            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)} disabled={saving}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.saveAddBtn} onPress={save} disabled={saving}>
                                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveAddBtnText}>Save Address</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
    addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 16 },
    empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151' },
    emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24 },
    emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
    emptyAddBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    addrCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6', gap: 12, alignItems: 'flex-start' },
    addrLeft: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    addrIconWrap: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
    addrTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
    addrName: { fontSize: 14, fontWeight: '700', color: '#111827' },
    defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    defaultText: { fontSize: 10, color: PRIMARY, fontWeight: '700' },
    addrText: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
    addrLandmark: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
    addrActions: { flexDirection: 'column', gap: 8, alignItems: 'center' },
    actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' },
    addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: `${PRIMARY}30`, borderStyle: 'dashed', marginTop: 4 },
    addRowBtnText: { fontSize: 14, fontWeight: '600', color: PRIMARY },
    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 16 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6, marginTop: 12 },
    labelRow: { flexDirection: 'row', gap: 10 },
    labelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB' },
    labelChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    labelChipText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    labelChipTextActive: { color: '#FFF', fontWeight: '700' },
    fieldInput: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827' },
    sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
    saveAddBtn: { flex: 2, height: 48, borderRadius: 12, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },
    saveAddBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

    // Map Styles
    mapContainer: { width: '100%', height: 160, borderRadius: 16, overflow: 'hidden', marginBottom: 4, backgroundColor: '#E5E7EB', position: 'relative' },
    miniMap: { width: '100%', height: '100%' },
    centerPinContainer: { position: 'absolute', top: '50%', left: '50%', marginLeft: -15, marginTop: -30, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    pinDrop: { transform: [{ translateY: 0 }] },
    pinDropLifted: { transform: [{ translateY: -10 }] },
    locateMeBtn: { position: 'absolute', bottom: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 },
    mapHelpText: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 16 },
});

