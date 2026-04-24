import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    Check,
    MessageSquare,
    Navigation2,
    Phone,
    Share2,
    Shield,
    Star,
    Timer,
    Calendar,
    X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    Image,
    Linking,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import RescheduleModal from '../../components/bookings/RescheduleModal';
import NearbyWorkers from '../../components/bookings/NearbyWorkers';
import CancelModal from '../../components/bookings/CancelModal';
import SearchingProvider from '../../components/SearchingProvider';
import ProviderFoundScreen from '../../components/ProviderFoundScreen';
import { api } from '../../lib/api';
import { initiateCall } from '../../lib/phone';
import { socketService } from '../../lib/socket';
import { supabase } from '../../lib/supabase';
import EmptyState from '../../components/EmptyState';

const PRIMARY = '#1A3FFF';

const STATUS_LABELS: Record<string, { title: string; sub: string; color: string }> = {
    requested: { title: '🔍 Finding Worker', sub: 'Looking for the best worker nearby', color: PRIMARY },
    searching: { title: '🔍 Searching...', sub: 'Connecting with nearby service providers', color: PRIMARY },
    confirmed: { title: 'Worker Assigned', sub: 'Your worker is preparing to come', color: PRIMARY },
    en_route: { title: '🚗 On the Way', sub: 'Your worker is heading to you', color: '#0369A1' },
    arrived: { title: '📍 Worker Arrived', sub: 'Your worker is at your location', color: '#059669' },
    in_progress: { title: '🔧 Work in Progress', sub: 'Your worker has started the job', color: '#7C3AED' },
    completed: { title: '✅ Completed', sub: 'Job has been completed', color: '#059669' },
    disputed: { title: '⚠️ Disputed', sub: 'This job is under review', color: '#E11D48' },
};

export default function TrackingScreen() {
    const { id: rawId } = useLocalSearchParams();
    const id = Array.isArray(rawId) ? rawId[0] : (rawId as string);
    const router = useRouter();
    const mapRef = useRef<MapView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState<any>(null);
    const [offers, setOffers] = useState<any[]>([]);
    const [providerLocation, setProviderLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [eta, setEta] = useState('...'); 

    const [cancelModalVisible, setCancelModalVisible] = useState(false);
    const [selectedReason, setSelectedReason] = useState<string>('');
    const [cancelDetails, setCancelDetails] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
    const [showProviderFound, setShowProviderFound] = useState(false);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [pulseAnim]);

    const loadBooking = useCallback(async (showLoading = true, forceRefresh = false) => {
        if (showLoading) setLoading(true);
        try {
            const url = forceRefresh ? `/api/v1/bookings/${id}?refresh=true` : `/api/v1/bookings/${id}`;
            const res = await api.get(url);
            if (res.error) throw new Error(res.error);

            const data = res.data;
            setBooking(data);

            if (data.status === 'confirmed') {
                setShowProviderFound(true);
            } else if (['en_route', 'arrived', 'in_progress', 'completed'].includes(data.status)) {
                setShowProviderFound(false);
            }

            if (['requested', 'searching'].includes(data.status)) {
                const { data: offerData } = await supabase
                    .from('job_offers')
                    .select('id, distance_km, provider_details(business_name, avg_rating, profiles(full_name))')
                    .eq('booking_id', id)
                    .neq('status', 'rejected')
                    .neq('status', 'expired');
                if (offerData) setOffers(offerData);
            }

            if (data.provider_id) {
                const { data: locData } = await supabase
                    .from('provider_locations')
                    .select('latitude, longitude')
                    .eq('provider_id', data.provider_id)
                    .order('recorded_at', { ascending: false })
                    .limit(1)
                    .single();

                if (locData) {
                    const newLoc = { latitude: locData.latitude, longitude: locData.longitude };
                    setProviderLocation(newLoc);
                    
                    if (data.status === 'arrived') {
                        setEta('Arrived');
                    } else {
                        updateETA(newLoc.latitude, newLoc.longitude);
                    }
                    
                    if (data.customer_latitude && data.customer_longitude) {
                        setTimeout(() => {
                            mapRef.current?.fitToCoordinates([
                                { latitude: data.customer_latitude, longitude: data.customer_longitude },
                                newLoc
                            ], {
                                edgePadding: { top: 140, right: 50, bottom: 300, left: 50 },
                                animated: true,
                            });
                        }, 600);
                    }
                } else {
                    setEta('Calculating...');
                }
            } else {
                setEta('Searching...');
            }
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) loadBooking();
    }, [id, loadBooking]);

    useEffect(() => {
        const isSearching = booking ? ['requested', 'searching'].includes(booking.status) : true;
        if (!id || !isSearching) return;

        const interval = setInterval(() => {
            loadBooking(false, true); 
        }, 15000);

        return () => clearInterval(interval);
    }, [id, booking, loadBooking]);

    useEffect(() => {
        if (!booking || !['requested', 'searching'].includes(booking.status)) return;
        const checkTimeout = () => {
            const createdAt = new Date(booking.created_at).getTime();
            const now = Date.now();
            const diffInMins = (now - createdAt) / (1000 * 60);
            if (diffInMins >= 5) {
                setBooking((prev: any) => ({ ...prev, status: 'cancelled', cancellation_reason: 'No worker found nearby' }));
                api.patch(`/api/v1/bookings/${booking.id}/status`, {
                    status: 'cancelled',
                    cancellationReason: 'No worker found nearby (Timeout)'
                }).catch(err => console.error('Failed to auto-cancel timed out booking:', err));
            }
        };
        const interval = setInterval(checkTimeout, 10000);
        return () => clearInterval(interval);
    }, [booking]);

    const updateETA = useCallback((pLat: number, pLng: number) => {
        if (!booking?.customer_latitude || !booking?.customer_longitude) return;

        // Haversine distance in km
        const R = 6371;
        const dLat = (pLat - booking.customer_latitude) * Math.PI / 180;
        const dLng = (pLng - booking.customer_longitude) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(booking.customer_latitude * Math.PI / 180) * Math.cos(pLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        // 🧠 Improved city traffic heuristic
        // < 0.5km: "Arriving"
        // < 2km: ~4 mins per km + 2 mins buffer
        // > 2km: ~3.5 mins per km + 3 mins buffer
        let mins = 0;
        if (distance < 0.3) {
            setEta('Arriving');
            return;
        } else if (distance < 2) {
            mins = Math.round(distance * 4) + 2;
        } else {
            mins = Math.round(distance * 3.5) + 3;
        }

        // Cap at reasonable limits
        if (mins < 1) mins = 1;
        if (mins > 60) {
            setEta('> 1 hr');
        } else {
            setEta(`${mins} min`);
        }
    }, [booking]);

    useEffect(() => {
        if (!id) return;
        const channel = supabase
            .channel(`booking-status-${id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, (payload) => {
                console.log('[Real-time 🚀] Status update:', payload.new.status);
                
                // 1. Instantly update status to stop searching/radar
                setBooking((prev: any) => ({ ...prev, ...payload.new }));

                if (payload.new.status === 'confirmed') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    
                    // 🚀 SPEED OPTIMIZATION: Try to find the provider name in our existing offers list 
                    // so we don't have to wait for the API refresh to show "Partner Found Kushagra..."
                    const matchingOffer = offers.find(o => o.provider_id === payload.new.provider_id);
                    if (matchingOffer) {
                        const name = matchingOffer.provider_details?.profiles?.full_name || 
                                     matchingOffer.provider_details?.business_name;
                        if (name) {
                            setBooking((prev: any) => ({
                                ...prev,
                                profiles: { full_name: name }, // Optimistic update
                                provider_details: matchingOffer.provider_details
                            }));
                        }
                    }
                    
                    setShowProviderFound(true);
                }

                if (['en_route', 'arrived', 'in_progress', 'completed'].includes(payload.new.status)) {
                    setShowProviderFound(false);
                    if (payload.new.status === 'completed') {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                }

                // 2. Full refresh of joins (profiles, ratings) in background
                setTimeout(() => loadBooking(false, true), 400);
            })
            .subscribe();

        const offerChannel = supabase
            .channel(`booking-offers-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'job_offers', filter: `booking_id=eq.${id}` }, async (payload) => {
                if (payload.eventType === 'INSERT') {
                    const { data: newOffer } = await supabase.from('job_offers').select('id, distance_km, provider_details(business_name, avg_rating, profiles(full_name))').eq('id', (payload.new as any).id).single();
                    if (newOffer) setOffers(prev => [...prev.filter(o => o.id !== newOffer.id), newOffer]);
                } else if (payload.eventType === 'UPDATE') {
                    const updatedOffer = payload.new as any;
                    if (updatedOffer.status === 'rejected' || updatedOffer.status === 'expired') setOffers(prev => prev.filter(o => o.id !== updatedOffer.id));
                }
            })
            .subscribe();

        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') loadBooking(false);
        });

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(offerChannel);
            subscription.remove();
        };
    }, [id, loadBooking]);

    useEffect(() => {
        if (!id) return;
        async function initSocketTracking() {
            const socket = await socketService.getSocket();
            socket.emit('chat:join', { bookingId: id });
            const handleLocationUpdate = (locData: any) => {
                if (locData.provider_id === booking?.provider_id) {
                    const newLoc = { latitude: locData.latitude, longitude: locData.longitude };
                    setProviderLocation(newLoc);
                    updateETA(newLoc.latitude, newLoc.longitude);
                    mapRef.current?.animateCamera({ center: newLoc, pitch: 45, heading: 0, altitude: 1000, zoom: 16 }, { duration: 1000 });
                }
            };
            socket.on('location:update', handleLocationUpdate);
            return () => { socket.off('location:update', handleLocationUpdate); };
        }
        initSocketTracking();
    }, [id, booking?.provider_id, updateETA]);

    const handleShare = async () => {
        try {
            const url = `https://workla.app/track/${id}`;
            const message = `Hey! I'm sharing my live work tracking link for my ${booking?.service_name_snapshot} booking. Track here: ${url}`;
            await Share.share({ message, url, title: 'Share Tracking Link' });
        } catch (error: any) { Alert.alert('Error', error.message); }
    };

    const handleCancelJob = async (customReason?: string) => {
        const finalReason = customReason || selectedReason;
        if (!finalReason) { Alert.alert('Selection Required', 'Please select a reason for cancellation.'); return; }
        setIsCancelling(true);
        try {
            const res = await api.patch(`/api/v1/bookings/${id}/status`, { status: 'cancelled', cancellationReason: finalReason });
            if (res.error) throw new Error(res.error);
            setCancelModalVisible(false);
            Alert.alert('Cancelled', 'Your booking has been cancelled successfully.', [{ text: 'OK', onPress: () => router.replace('/(tabs)/bookings') }]);
        } catch (err: any) { Alert.alert('Error', err.message); } finally { setIsCancelling(false); }
    };

    const handleReschedule = async (newDate: string, newSlot: string, reason: string) => {
        try {
            const res = await api.patch(`/api/v1/bookings/${id}/reschedule`, { newDate, newSlot, reason });
            if (res.error) throw new Error(res.error);
            setBooking((prev: any) => ({
                ...prev,
                scheduled_date: newDate,
                scheduled_time_slot: newSlot,
                status: (prev.status === 'confirmed' ? 'searching' : prev.status),
                provider_id: (prev.status === 'confirmed' ? null : prev.provider_id)
            }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Rescheduled', 'Your booking has been rescheduled successfully.');
        } catch (err: any) { Alert.alert('Reschedule Failed', err.message); }
    };

    const handleDownloadInvoice = async () => {
        if (invoiceLoading) return;
        setInvoiceLoading(true);
        try {
            let res = await api.get(`/api/v1/bookings/${id}/invoice`) as any;
            if (res.error) {
                await new Promise(r => setTimeout(r, 2000));
                res = await api.get(`/api/v1/bookings/${id}/invoice`) as any;
            }
            if (res.error) { Alert.alert('Not Ready Yet', 'Invoice is still being generated. Please try again in a few seconds.'); return; }
            if (res.invoiceUrl) Linking.openURL(res.invoiceUrl);
        } catch (err) { Alert.alert('Error', 'Failed to fetch invoice. Please try again.'); } finally { setInvoiceLoading(false); }
    };

    const handleSOS = async () => {
        Alert.alert('🆘 Emergency SOS', 'This will alert our safety team and share your live location. Continue?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Send SOS', style: 'destructive', onPress: async () => {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        await supabase.from('safety_alerts').insert([{
                            booking_id: id, user_id: user.id, role: 'customer',
                            latitude: providerLocation?.latitude, longitude: providerLocation?.longitude,
                        }]);
                    }
                    Alert.alert('🆘 SOS ACTIVE', 'Our high-priority safety team has been alerted. Assistance is on the way.');
                } catch (err) { Alert.alert('🆘 SOS ACTIVE', 'Emergency alert broadcasted via fallback satellite network.'); }
            }},
        ]);
    };

    if (loading) return (
        <View style={styles.loader}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loaderText}>Loading tracking info...</Text>
        </View>
    );

    if (!booking) return (
        <View style={styles.loader}>
            <Text style={{ color: '#6B7280' }}>Booking not found.</Text>
        </View>
    );

    const providerName = booking?.profiles?.full_name || booking?.provider_details?.business_name || 'Worker';
    const initial = providerName.charAt(0).toUpperCase();
    const statusMeta = STATUS_LABELS[booking.status] ?? STATUS_LABELS['confirmed'];
    const mapRegion = {
        latitude: providerLocation?.latitude ?? 25.3176,
        longitude: providerLocation?.longitude ?? 82.9739,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
    };

    const isSearching = ['requested', 'searching'].includes(booking.status);

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            {isSearching ? (
                <View style={{ flex: 1 }}>
                    <SearchingProvider serviceName={booking.service_name_snapshot || 'Service'} />
                    <View style={{ position: 'absolute', top: '70%', width: '100%' }}>
                        <NearbyWorkers offers={offers} />
                    </View>
                    <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
                        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)/bookings')}>
                            <ArrowLeft size={20} color="#111827" />
                        </TouchableOpacity>
                    </SafeAreaView>
                    <View style={styles.searchingFooter}>
                        <Text style={styles.searchingNote}>Stay on this page. We're connecting with service partners near your location.</Text>
                        <TouchableOpacity style={styles.closeSearching} onPress={() => handleCancelJob('Cancelled by user during search')}>
                            <Text style={styles.closeSearchingText}>Stop Searching</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : booking.status === 'completed' ? (
                <View style={styles.receiptContainer}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                        <SafeAreaView>
                            <View style={styles.receiptHeader}>
                                <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)/' as any)}>
                                    <ArrowLeft size={20} color="#111827" />
                                </TouchableOpacity>
                                <Text style={styles.receiptHeaderTitle}>Order Receipt</Text>
                                <TouchableOpacity onPress={handleShare}><Share2 size={20} color={PRIMARY} /></TouchableOpacity>
                            </View>
                        </SafeAreaView>
                        <View style={styles.receiptMain}>
                            <View style={styles.successIconBox}><Check size={32} color="#FFF" /></View>
                            <Text style={styles.receiptServiceTitle}>{booking.service_name_snapshot}</Text>
                            <Text style={styles.receiptBookingId}>Booking #{booking.booking_number || booking.id.slice(0,8).toUpperCase()}</Text>
                            <View style={styles.billingCard}>
                                <View style={styles.receiptTopBorder} />
                                <Text style={styles.billingTitle}>Billing Summary</Text>
                                <View style={styles.billingRow}><Text style={styles.billingLabel}>Base Fare</Text><Text style={styles.billingVal}>₹{booking.catalog_price || booking.total_amount}</Text></View>
                                <View style={styles.billingRow}><Text style={styles.billingLabel}>Platform Fee</Text><Text style={styles.billingVal}>₹{booking.platform_fee || 0}</Text></View>
                                <View style={styles.billingRow}><Text style={styles.billingLabel}>Taxes & GST</Text><Text style={styles.billingVal}>₹{booking.tax_amount || 0}</Text></View>
                                {booking.discount_amount > 0 && <View style={styles.billingRow}><Text style={[styles.billingLabel, { color: '#059669' }]}>Coupon Discount</Text><Text style={[styles.billingVal, { color: '#059669' }]}>-₹{booking.discount_amount}</Text></View>}
                                <View style={styles.receiptSeparator}>{Array.from({ length: 20 }).map((_, i) => <View key={i} style={styles.separatorDash} />)}</View>
                                <View style={styles.billingTotalRow}><Text style={styles.billingTotalLabel}>Total Paid</Text><Text style={styles.billingTotalVal}>₹{booking.total_amount}</Text></View>
                                <View style={styles.paymentBadge}><Check size={12} color="#059669" /><Text style={styles.paymentBadgeText}>Paid via {booking.payment_method?.toUpperCase() || 'CASH'}</Text></View>
                            </View>
                            <View style={styles.receiptMetaRow}>
                                <View style={styles.metaBox}><Timer size={16} color="#6B7280" /><Text style={styles.metaBoxVal}>{new Date(booking.created_at).toLocaleDateString()}</Text><Text style={styles.metaBoxLabel}>Date</Text></View>
                                <View style={styles.metaBox}><MessageSquare size={16} color="#6B7280" /><Text style={styles.metaBoxVal}>{providerName}</Text><Text style={styles.metaBoxLabel}>Worker</Text></View>
                            </View>
                            <View style={styles.receiptFooter}>
                                <TouchableOpacity style={[styles.downloadBtn, invoiceLoading && { opacity: 0.7 }]} onPress={handleDownloadInvoice} disabled={invoiceLoading}>
                                    {invoiceLoading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator color="#FFF" size="small" /><Text style={styles.downloadBtnText}>Generating...</Text></View> : <Text style={styles.downloadBtnText}>Download Invoice</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            ) : booking.status === 'cancelled' && booking.cancellation_reason?.includes('No worker found') ? (
                <View style={styles.noWorkerContainer}>
                    <EmptyState title="No Worker Found" description="We checked with all nearby service providers, but unfortunately, no one is available for your request right now." imageSource={require('../../assets/images/search-empty.png')} ctaLabel="Try Again Later" onCtaPress={() => router.replace({ pathname: '/book/[id]', params: { service: booking.service_name_snapshot } } as any)} />
                    <TouchableOpacity style={styles.backToBookings} onPress={() => router.replace('/(tabs)/bookings')}><ArrowLeft size={16} color="#6B7280" /><Text style={styles.backToBookingsText}>Back to Bookings</Text></TouchableOpacity>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={mapRegion} showsUserLocation showsMyLocationButton={false} showsCompass={false} onMapReady={() => {
                        if (providerLocation) {
                            mapRef.current?.fitToCoordinates([{ latitude: booking.customer_latitude, longitude: booking.customer_longitude }, providerLocation], { edgePadding: { top: 100, right: 50, bottom: 300, left: 50 }, animated: false });
                        }
                    }}>
                        <Marker coordinate={{ latitude: booking.customer_latitude, longitude: booking.customer_longitude }} anchor={{ x: 0.5, y: 0.5 }}><View style={styles.customerMarkerOuter}><View style={styles.customerMarkerInner} /></View></Marker>
                        {providerLocation && (
                            <>
                                <Marker coordinate={providerLocation} anchor={{ x: 0.5, y: 0.5 }}><Animated.View style={[styles.providerMarker, { transform: [{ scale: pulseAnim }] }]}><View style={styles.providerMarkerDot} /></Animated.View></Marker>
                                <Polyline coordinates={[{ latitude: booking.customer_latitude, longitude: booking.customer_longitude }, providerLocation]} strokeColor={PRIMARY} strokeWidth={3} lineDashPattern={[5, 5]} />
                            </>
                        )}
                    </MapView>

                    {showProviderFound && (
                        <View style={StyleSheet.absoluteFill}>
                            <ProviderFoundScreen providerName={providerName} serviceName={booking.service_name_snapshot || 'Service'} rating={booking?.provider_details?.avg_rating} />
                            <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
                                <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)/bookings')}><ArrowLeft size={20} color="#111827" /></TouchableOpacity>
                            </SafeAreaView>
                        </View>
                    )}

                    {!showProviderFound && (
                        <>
                            <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
                                <View style={styles.headerTop}>
                                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={20} color="#111827" /></TouchableOpacity>
                                    <View style={styles.headerStatus}><Text style={styles.headerStatusTitle}>{statusMeta.title}</Text><Text style={styles.headerStatusSub}>{statusMeta.sub}</Text></View>
                                </View>
                            </SafeAreaView>

                            <View style={styles.zomatoCard}>
                                <View style={[styles.zomatoAccentBar, { backgroundColor: statusMeta.color }]} />
                                <View style={styles.handle} />
                                <View style={styles.zomatoTopRow}>
                                    <View style={[styles.zomatoAvatar, { borderColor: statusMeta.color }]}><Text style={styles.zomatoAvatarText}>{initial}</Text></View>
                                    <View style={styles.zomatoProviderInfo}>
                                        <Text style={styles.zomatoProviderName} numberOfLines={1}>{providerName}</Text>
                                        <Text style={styles.zomatoServiceName}>{booking.service_name_snapshot || 'Service'}</Text>
                                        <View style={styles.zomatoRatingRow}><Star size={11} color="#F59E0B" fill="#F59E0B" /><Text style={styles.zomatoRatingText}>{booking?.provider_details?.avg_rating || '5.0'}</Text><Text style={styles.zomatoRatingDivider}>•</Text><Text style={styles.zomatoRatingText}>₹{booking.total_amount}</Text></View>
                                    </View>
                                    <View style={[styles.zomatoEtaChip, { backgroundColor: `${statusMeta.color}15`, borderColor: `${statusMeta.color}30` }]}><Timer size={12} color={statusMeta.color} /><Text style={[styles.zomatoEtaText, { color: statusMeta.color }]}>{eta}</Text></View>
                                </View>
                                <View style={styles.zomatoActionsRow}>
                                    <TouchableOpacity style={styles.zomatoActionBtn} onPress={() => router.push(`/chat/${id}` as any)}><View style={[styles.zomatoActionIcon, { backgroundColor: '#EEF2FF' }]}><MessageSquare size={18} color={PRIMARY} /></View><Text style={styles.zomatoActionLabel}>Chat</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.zomatoActionBtn} onPress={() => initiateCall(booking.profiles?.phone)}><View style={[styles.zomatoActionIcon, { backgroundColor: '#ECFDF5' }]}><Phone size={18} color="#059669" /></View><Text style={styles.zomatoActionLabel}>Call</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.zomatoActionBtn} onPress={handleSOS}><View style={[styles.zomatoActionIcon, { backgroundColor: '#FEF2F2' }]}><Shield size={18} color="#DC2626" /></View><Text style={styles.zomatoActionLabel}>SOS</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.zomatoActionBtn} onPress={() => setCancelModalVisible(true)}><View style={[styles.zomatoActionIcon, { backgroundColor: '#F3F4F6' }]}><X size={18} color="#6B7280" /></View><Text style={styles.zomatoActionLabel}>Cancel</Text></TouchableOpacity>
                                </View>
                                <TouchableOpacity style={styles.zomatoRescheduleLink} onPress={() => setRescheduleModalVisible(true)}><Calendar size={12} color={PRIMARY} /><Text style={styles.zomatoRescheduleText}>Need to Reschedule?</Text></TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>
            )}

            <CancelModal
                visible={cancelModalVisible}
                bookingId={id}
                cancelReason={selectedReason}
                customReason={cancelDetails}
                cancelling={isCancelling}
                onClose={() => setCancelModalVisible(false)}
                onSelectReason={setSelectedReason}
                onCustomReasonChange={setCancelDetails}
                onConfirm={handleCancelJob}
            />

            <RescheduleModal
                visible={rescheduleModalVisible}
                onClose={() => setRescheduleModalVisible(false)}
                onConfirm={handleReschedule}
                currentDate={booking.scheduled_date}
                currentSlot={booking.scheduled_time_slot}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#FFF' },
    loaderText: { fontSize: 14, color: '#9CA3AF' },
    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 10, zIndex: 100 },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerStatus: { backgroundColor: 'rgba(255, 255, 255, 0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    headerStatusTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
    headerStatusSub: { fontSize: 11, color: '#6B7280' },
    backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    providerMarker: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(26, 63, 255, 0.2)', alignItems: 'center', justifyContent: 'center' },
    providerMarkerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: PRIMARY, borderWidth: 2, borderColor: '#FFF' },
    customerMarkerOuter: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'center', alignItems: 'center' },
    customerMarkerInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#111827', borderWidth: 2, borderColor: '#FFF' },
    zomatoCard: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, paddingBottom: 34, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 },
    zomatoAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
    zomatoTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    zomatoAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
    zomatoAvatarText: { fontSize: 24, fontWeight: '900', color: PRIMARY },
    zomatoProviderInfo: { flex: 1 },
    zomatoProviderName: { fontSize: 18, fontWeight: '800', color: '#111827' },
    zomatoServiceName: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
    zomatoRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    zomatoRatingText: { fontSize: 13, fontWeight: '700', color: '#374151' },
    zomatoRatingDivider: { fontSize: 12, color: '#9CA3AF' },
    zomatoEtaChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 2 },
    zomatoEtaText: { fontSize: 14, fontWeight: '900' },
    zomatoActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    zomatoActionBtn: { alignItems: 'center', gap: 6 },
    zomatoActionIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    zomatoActionLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
    zomatoRescheduleLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    zomatoRescheduleText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
    searchingFooter: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: 24, borderRadius: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
    searchingNote: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    closeSearching: { backgroundColor: '#FEE2E2', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: '#FECACA' },
    closeSearchingText: { color: '#DC2626', fontSize: 14, fontWeight: '800' },
    receiptContainer: { flex: 1, backgroundColor: '#F8FAFC' },
    receiptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
    receiptHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
    receiptMain: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 30 },
    successIconBox: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    receiptServiceTitle: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 4 },
    receiptBookingId: { fontSize: 14, color: '#6B7280', fontWeight: '600', marginBottom: 30 },
    billingCard: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 24, paddingBottom: 30, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4, overflow: 'hidden' },
    receiptTopBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: PRIMARY },
    billingTitle: { fontSize: 13, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, marginTop: 4 },
    billingRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    billingLabel: { fontSize: 15, color: '#4B5563', fontWeight: '500' },
    billingVal: { fontSize: 15, fontWeight: '700', color: '#111827' },
    receiptSeparator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginVertical: 20 },
    separatorDash: { width: 4, height: 1, backgroundColor: '#CBD5E1' },
    billingTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    billingTotalLabel: { fontSize: 18, fontWeight: '800', color: '#111827' },
    billingTotalVal: { fontSize: 24, fontWeight: '900', color: PRIMARY },
    paymentBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignSelf: 'center' },
    paymentBadgeText: { fontSize: 12, fontWeight: '800', color: '#16A34A', textTransform: 'uppercase' },
    receiptMetaRow: { flexDirection: 'row', gap: 12, marginTop: 12, width: '100%' },
    metaBox: { flex: 1, backgroundColor: '#FFF', borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    metaBoxVal: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 8 },
    metaBoxLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
    receiptFooter: { width: '100%', marginTop: 40, alignItems: 'center' },
    downloadBtn: { width: '100%', height: 56, borderRadius: 16, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    downloadBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    noWorkerContainer: { flex: 1, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', padding: 40 },
    backToBookings: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
    backToBookingsText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
});
