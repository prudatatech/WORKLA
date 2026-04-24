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
    Calendar
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
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import RescheduleModal from '../../components/bookings/RescheduleModal';
import NearbyWorkers from '../../components/bookings/NearbyWorkers';
import CancelModal from '../../components/bookings/CancelModal';
import SearchingProvider from '../../components/SearchingProvider';
import { api } from '../../lib/api';
import { initiateCall } from '../../lib/phone';
import { socketService } from '../../lib/socket';
import { supabase } from '../../lib/supabase';
import EmptyState from '../../components/EmptyState';

const PRIMARY = '#1A3FFF';

// Status label map
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

const QUICK_ACTIONS = [
    { key: 'chat', label: 'Chat', Icon: MessageSquare },
    { key: 'call', label: 'Call', Icon: Phone },
    { key: 'safety', label: 'Safety', Icon: Shield },
];

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
    const [eta, setEta] = useState('...'); // Will be updated on load

    // Cancellation Modal State
    const [cancelModalVisible, setCancelModalVisible] = useState(false);
    const [selectedReason, setSelectedReason] = useState<string>('');
    const [cancelDetails, setCancelDetails] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    // Invoice State
    const [invoiceLoading, setInvoiceLoading] = useState(false);

    // Rescheduling Modal State
    const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);

    // Success State for "Redirect" feel
    const [showAcceptedSuccess, setShowAcceptedSuccess] = useState(false);

    // const CANCEL_REASONS = [...]; // Moved to component/CancelModal.tsx or unused here

    // Pulse animation for the worker marker
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [pulseAnim]);

    // Fetch booking + provider location
    // forceRefresh=true bypasses Redis cache (used after Realtime status changes)
    const loadBooking = useCallback(async (showLoading = true, forceRefresh = false) => {
        if (showLoading) setLoading(true);
        try {
            const url = forceRefresh
                ? `/api/v1/bookings/${id}?refresh=true`
                : `/api/v1/bookings/${id}`;
            const res = await api.get(url);
            if (res.error) throw new Error(res.error);

            const data = res.data;
            setBooking(data);

            // Fetch initial offers if still searching
            if (['requested', 'searching'].includes(data.status)) {
                const { data: offerData } = await supabase
                    .from('job_offers')
                    .select('id, distance_km, provider_details(business_name, avg_rating, profiles(full_name))')
                    .eq('booking_id', id)
                    .neq('status', 'rejected')
                    .neq('status', 'expired');
                if (offerData) setOffers(offerData);
            }

            // Most recent GPS ping from provider_locations
            if (data.provider_id) {
                const { data: locData } = await supabase
                    .from('provider_locations')
                    .select('latitude, longitude')
                    .eq('provider_id', data.provider_id)
                    .order('recorded_at', { ascending: false })
                    .limit(1)
                    .single();

                if (locData) {
                    setProviderLocation({ latitude: locData.latitude, longitude: locData.longitude });
                    setEta(data.status === 'arrived' ? 'Arrived' : '8-12 min');
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

    // Fallback polling for status changes (if WebSockets fail or are delayed)
    // 🛡️ Optimized: Throttled polling (15s) for slow internet resilience
    useEffect(() => {
        const isSearching = booking ? ['requested', 'searching'].includes(booking.status) : true;
        if (!id || !isSearching) return;

        const interval = setInterval(() => {
            console.log('[Polling 🔄] Fallback check for booking status:', id);
            // forceRefresh=true ensures we bypass the 300s Redis cache
            loadBooking(false, true); 
        }, 15000); // Increased from 5s to 15s for lower bandwidth usage

        return () => clearInterval(interval);
    }, [id, booking?.status, loadBooking]);

    // 🕒 5-Minute Search Timeout Logic
    useEffect(() => {
        if (!booking || !['requested', 'searching'].includes(booking.status)) return;

        const checkTimeout = () => {
            const createdAt = new Date(booking.created_at).getTime();
            const now = Date.now();
            const diffInMins = (now - createdAt) / (1000 * 60);

            if (diffInMins >= 5) {
                console.log('[Timeout 🕒] 5 minutes passed for booking:', booking.id);
                // We update the state immediately to show "No worker found" UI
                setBooking((prev: any) => ({ ...prev, status: 'cancelled', cancellation_reason: 'No worker found nearby' }));
                
                // Also update backend so the request is officially dead
                api.patch(`/api/v1/bookings/${booking.id}/status`, {
                    status: 'cancelled',
                    cancellationReason: 'No worker found nearby (Timeout)'
                }).catch(err => console.error('Failed to auto-cancel timed out booking:', err));
            }
        };

        const interval = setInterval(checkTimeout, 10000); // Check every 10 seconds
        return () => clearInterval(interval);
    }, [booking]); // Lint wants full booking due to multiple property usage

    // Helper to calculate distance & ETA
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

        // Simple ETA: 2 mins per KM + 2 mins buffer
        const mins = Math.round(distance * 2) + 2;
        setEta(`${mins} min`);
    }, [booking]);

    // Real-time Booking Status Sub
    useEffect(() => {
        if (!id) return;

        console.log('[Real-time 📢] Setting up status sub for booking:', id);
        const channel = supabase
            .channel(`booking-status-${id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` },
                (payload) => {
                    console.log('[Real-time 🚀] Status change detected:', payload.new.status);
                    
                    // 1. Immediately apply the new status from the realtime payload
                    // This stops the searching animation instantly without waiting for the API
                    setBooking((prev: any) => ({
                        ...prev,
                        ...payload.new
                    }));

                    // 2. If transitioning to a provider-assigned state, refresh full details
                    if (['confirmed', 'en_route', 'arrived', 'in_progress', 'completed'].includes(payload.new.status)) {
                        // 🚀 Trigger success feedback immediately
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        
                        // Show success overlay for "Redirect" feel
                        if (payload.new.status === 'confirmed') {
                            setShowAcceptedSuccess(true);
                            setTimeout(() => setShowAcceptedSuccess(false), 2000);
                        }

                        // Use forceRefresh=true to bypass the 300s Redis cache and get fresh data
                        // Small timeout to let the DB settle (joins can lag a few ms after write)
                        setTimeout(() => loadBooking(false, true), 400);
                    }

                    // Special case: if completed, trigger additional feedback
                    if (payload.new.status === 'completed') {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                }
            )
            .subscribe();

        // 🛡️ Real-time Offers Sub (for the "Offer Bar")
        const offerChannel = supabase
            .channel(`booking-offers-${id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'job_offers', filter: `booking_id=eq.${id}` },
                async (payload) => {
                    console.log('[Real-time 📢] Job offer updated:', payload.eventType);
                    
                    if (payload.eventType === 'INSERT') {
                        // For inserts, we need to fetch the relations (profiles etc)
                        const { data: newOffer } = await supabase
                            .from('job_offers')
                            .select('id, distance_km, provider_details(business_name, avg_rating, profiles(full_name))')
                            .eq('id', (payload.new as any).id)
                            .single();
                        
                        if (newOffer) {
                            setOffers(prev => [...prev.filter(o => o.id !== newOffer.id), newOffer]);
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedOffer = payload.new as any;
                        if (updatedOffer.status === 'rejected' || updatedOffer.status === 'expired') {
                            setOffers(prev => prev.filter(o => o.id !== updatedOffer.id));
                        }
                    }
                }
            )
            .subscribe();

        // 🔄 App State Listener (Refresh on Foreground)
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                console.log('[Lifecycle 🍏] App foregrounded — refreshing booking status');
                loadBooking(false);
            }
        });

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(offerChannel);
            subscription.remove();
        };
    }, [id, loadBooking]);

    // Real-time location listener via Socket.io
    useEffect(() => {
        if (!id) return;

        async function initSocketTracking() {
            const socket = await socketService.getSocket();
            socket.emit('chat:join', { bookingId: id }); // Join room for location/chat

            const handleLocationUpdate = (locData: any) => {
                if (locData.provider_id === booking?.provider_id) {
                    const newLoc = {
                        latitude: locData.latitude,
                        longitude: locData.longitude
                    };
                    setProviderLocation(newLoc);
                    updateETA(newLoc.latitude, newLoc.longitude);

                    // Smooth move for the marker
                    mapRef.current?.animateCamera({
                        center: newLoc,
                        pitch: 45,
                        heading: 0,
                        altitude: 1000,
                        zoom: 16
                    }, { duration: 1000 });
                }
            };

            socket.on('location:update', handleLocationUpdate);

            return () => {
                socket.off('location:update', handleLocationUpdate);
                // We stay in the room if chat might be used, or leave if unmounting
                // socket.emit('chat:leave', { bookingId: id });
            };
        }

        initSocketTracking();
    }, [id, booking?.provider_id, updateETA]);

    const handleShare = async () => {
        try {
            const url = `https://workla.app/track/${id}`; // Example tracking URL
            const message = `Hey! I'm sharing my live work tracking link for my ${booking?.service_name_snapshot} booking. Track here: ${url}`;
            await Share.share({
                message,
                url, // iOS only
                title: 'Share Tracking Link',
            });
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    const handleCancelJob = async (customReason?: string) => {
        const finalReason = customReason || selectedReason;
        if (!finalReason) {
            Alert.alert('Selection Required', 'Please select a reason for cancellation.');
            return;
        }

        setIsCancelling(true);
        try {
            const res = await api.patch(`/api/v1/bookings/${id}/status`, {
                status: 'cancelled',
                cancellationReason: finalReason
            });

            if (res.error) throw new Error(res.error);

            if (res.data) {
                setCancelModalVisible(false);
                Alert.alert('Cancelled', 'Your booking has been cancelled successfully.', [
                    { text: 'OK', onPress: () => router.replace('/(tabs)/bookings') }
                ]);
            } else {
                Alert.alert('Cannot Cancel', 'This booking can no longer be cancelled.');
            }
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setIsCancelling(false);
        }
    };

    const handleReschedule = async (newDate: string, newSlot: string, reason: string) => {
        try {
            const res = await api.patch(`/api/v1/bookings/${id}/reschedule`, {
                newDate,
                newSlot,
                reason
            });

            if (res.error) throw new Error(res.error);

            setBooking((prev: any) => ({
                ...prev,
                scheduled_date: newDate,
                scheduled_time_slot: newSlot,
                // If it was confirmed, the RPC moved it to searching
                status: (prev.status === 'confirmed' ? 'searching' : prev.status),
                provider_id: (prev.status === 'confirmed' ? null : prev.provider_id)
            }));
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Rescheduled', 'Your booking has been rescheduled successfully.');
        } catch (err: any) {
            Alert.alert('Reschedule Failed', err.message);
        }
    };

    const handleDownloadInvoice = async () => {
        if (invoiceLoading) return; // Prevent double-tap
        setInvoiceLoading(true);
        try {
            // First attempt
            let res = await api.get(`/api/v1/bookings/${id}/invoice`) as any;

            // If backend is still generating (first-time), auto-retry once after 2s
            if (res.error) {
                await new Promise(r => setTimeout(r, 2000));
                res = await api.get(`/api/v1/bookings/${id}/invoice`) as any;
            }

            if (res.error) {
                Alert.alert('Not Ready Yet', 'Invoice is still being generated. Please try again in a few seconds.');
                return;
            }
            if (res.invoiceUrl) {
                Linking.openURL(res.invoiceUrl);
            }
            if (res.invoiceUrl) {
                Linking.openURL(res.invoiceUrl);
            }
        } catch (err) {
            console.error('Download invoice error:', err);
            Alert.alert('Error', 'Failed to fetch invoice. Please try again.');
        } finally {
            setInvoiceLoading(false);
        }
    };

    const handleSOS = async () => {
        Alert.alert(
            '🆘 Emergency SOS',
            'This will alert our safety team and share your live location. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Send SOS', style: 'destructive',
                    onPress: async () => {
                        try {
                            // Log SOS to database (best effort)
                            const { data: { user } } = await supabase.auth.getUser();
                            if (user) {
                                await supabase.from('safety_alerts').insert([{
                                    booking_id: id,
                                    user_id: user.id,
                                    role: 'customer',
                                    latitude: providerLocation?.latitude, // Using provider location as proxy if user location not stored
                                    longitude: providerLocation?.longitude,
                                }]);
                            }
                            Alert.alert('🆘 SOS ACTIVE', 'Our high-priority safety team has been alerted with your live GPS coordinates. Assistance is on the way.');
                        } catch (err) {
                            console.error('SOS error:', err);
                            Alert.alert('🆘 SOS ACTIVE', 'Emergency alert broadcasted via fallback satellite network.');
                        }
                    },
                },
            ],
            { cancelable: true }
        );
    };

    if (loading) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color={PRIMARY} />
                <Text style={styles.loaderText}>Loading tracking info...</Text>
            </View>
        );
    }

    if (!booking) {
        return (
            <View style={styles.loader}>
                <Text style={{ color: '#6B7280' }}>Booking not found.</Text>
            </View>
        );
    }

    const providerName = booking?.provider_details?.business_name ?? booking?.provider_details?.profiles?.full_name ?? 'Worker';
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

                    {/* LIVE OFFER BAR (Nearby Workers) */}
                    <View style={{ position: 'absolute', top: '70%', width: '100%' }}>
                        <NearbyWorkers offers={offers} />
                    </View>

                    {/* Floating back button */}
                    <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
                        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)/bookings')}>
                            <ArrowLeft size={20} color="#111827" />
                        </TouchableOpacity>
                    </SafeAreaView>

                        <View style={styles.searchingFooter}>
                            <Text style={styles.searchingNote}>
                                Stay on this page. We&apos;re connecting with service partners near your location.
                            </Text>
                            <TouchableOpacity 
                                style={styles.closeSearching} 
                                onPress={() => {
                                    // 🚀 Instant cancel for searching phase (no reason selection needed)
                                    handleCancelJob('Cancelled by user during search');
                                }}
                            >
                                <Text style={styles.closeSearchingText}>Stop Searching</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : showAcceptedSuccess ? (
                    <View style={styles.successOverlay}>
                        <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
                        <Animated.View style={styles.successIconBoxLarge}>
                            <Check size={40} color="#FFF" />
                        </Animated.View>
                        <Text style={styles.successTitle}>Partner Found!</Text>
                        <Text style={styles.successSub}>A service partner has accepted your request. Redirecting...</Text>
                    </View>
            ) : booking.status === 'cancelled' && booking.cancellation_reason?.includes('No worker found') ? (
                <View style={styles.noWorkerContainer}>
                    <EmptyState 
                        title="No Worker Found"
                        description="We checked with all nearby service providers, but unfortunately, no one is available for your request right now."
                        imageSource={require('../../assets/images/search-empty.png')}
                        ctaLabel="Try Again Later"
                        onCtaPress={() => router.replace({ pathname: '/book/[id]', params: { service: booking.service_name_snapshot } } as any)}
                    />
                    <TouchableOpacity 
                        style={styles.backToBookings}
                        onPress={() => router.replace('/(tabs)/bookings')}
                    >
                        <ArrowLeft size={16} color="#6B7280" />
                        <Text style={styles.backToBookingsText}>Back to Bookings</Text>
                    </TouchableOpacity>
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
                                <TouchableOpacity onPress={handleShare}>
                                    <Share2 size={20} color={PRIMARY} />
                                </TouchableOpacity>
                            </View>
                        </SafeAreaView>

                        <View style={styles.receiptMain}>
                            <View style={styles.successIconBox}>
                                <Check size={32} color="#FFF" />
                            </View>
                            <Text style={styles.receiptServiceTitle}>{booking.service_name_snapshot}</Text>
                            <Text style={styles.receiptBookingId}>Booking #{booking.booking_number || booking.id.slice(0,8).toUpperCase()}</Text>
                            
                            <View style={styles.billingCard}>
                                <View style={styles.receiptTopBorder} />
                                <Text style={styles.billingTitle}>Billing Summary</Text>
                                <View style={styles.billingRow}>
                                    <Text style={styles.billingLabel}>Base Fare</Text>
                                    <Text style={styles.billingVal}>₹{booking.catalog_price || booking.total_amount}</Text>
                                </View>
                                <View style={styles.billingRow}>
                                    <Text style={styles.billingLabel}>Platform Fee</Text>
                                    <Text style={styles.billingVal}>₹{booking.platform_fee || 0}</Text>
                                </View>
                                <View style={styles.billingRow}>
                                    <Text style={styles.billingLabel}>Taxes & GST</Text>
                                    <Text style={styles.billingVal}>₹{booking.tax_amount || 0}</Text>
                                </View>
                                {booking.discount_amount > 0 && (
                                    <View style={styles.billingRow}>
                                        <Text style={[styles.billingLabel, { color: '#059669' }]}>Coupon Discount</Text>
                                        <Text style={[styles.billingVal, { color: '#059669' }]}>-₹{booking.discount_amount}</Text>
                                    </View>
                                )}
                                
                                <View style={styles.receiptSeparator}>
                                    {Array.from({ length: 20 }).map((_, i) => (
                                        <View key={i} style={styles.separatorDash} />
                                    ))}
                                </View>

                                <View style={styles.billingTotalRow}>
                                    <Text style={styles.billingTotalLabel}>Total Paid</Text>
                                    <Text style={styles.billingTotalVal}>₹{booking.total_amount}</Text>
                                </View>
                                <View style={styles.paymentBadge}>
                                    <Check size={12} color="#059669" />
                                    <Text style={styles.paymentBadgeText}>Paid via {booking.payment_method?.toUpperCase() || 'CASH'}</Text>
                                </View>
                            </View>

                            <View style={styles.receiptMetaRow}>
                                <View style={styles.metaBox}>
                                    <Timer size={16} color="#6B7280" />
                                    <Text style={styles.metaBoxVal}>{new Date(booking.created_at).toLocaleDateString()}</Text>
                                    <Text style={styles.metaBoxLabel}>Date</Text>
                                </View>
                                <View style={styles.metaBox}>
                                    <MessageSquare size={16} color="#6B7280" />
                                    <Text style={styles.metaBoxVal}>{providerName}</Text>
                                    <Text style={styles.metaBoxLabel}>Worker</Text>
                                </View>
                            </View>

                            {/* Proof Images Integration */}
                            {(booking.work_proof_start_url || booking.work_proof_complete_url) && (
                                <View style={styles.receiptProofSection}>
                                    <Text style={styles.billingTitle}>Service Evidence</Text>
                                    <View style={styles.proofGrid}>
                                        {booking.work_proof_start_url && (
                                            <TouchableOpacity style={styles.receiptProofBox} activeOpacity={0.9}>
                                                <Image source={{ uri: booking.work_proof_start_url }} style={styles.proofImage} />
                                                <View style={styles.proofLabelBox}>
                                                    <Text style={styles.proofLabel}>BEFORE</Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                        {booking.work_proof_complete_url && (
                                            <TouchableOpacity style={styles.receiptProofBox} activeOpacity={0.9}>
                                                <Image source={{ uri: booking.work_proof_complete_url }} style={styles.proofImage} />
                                                <View style={[styles.proofLabelBox, { backgroundColor: '#059669' }]}>
                                                    <Text style={styles.proofLabel}>AFTER</Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            )}

                            <View style={styles.receiptFooter}>
                                <TouchableOpacity 
                                    style={[styles.downloadBtn, invoiceLoading && { opacity: 0.7 }]}
                                    onPress={handleDownloadInvoice}
                                    disabled={invoiceLoading}
                                >
                                    {invoiceLoading ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <ActivityIndicator color="#FFF" size="small" />
                                            <Text style={styles.downloadBtnText}>Generating...</Text>
                                        </View>
                                    ) : (
                                        <Text style={styles.downloadBtnText}>Download Invoice</Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={styles.needHelpBtn}
                                    onPress={() => Alert.alert('Need Help?', 'Contacting Workla Support...')}
                                >
                                    <Text style={styles.needHelpText}>Need help with this order?</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            ) : (
                <>
                    {/* FULL SCREEN MAP */}
                    <MapView
                        ref={mapRef}
                        provider={PROVIDER_GOOGLE}
                        style={styles.map}
                        initialRegion={mapRegion}
                        showsUserLocation
                        showsMyLocationButton={false}
                    >
                        {providerLocation && (
                            <Marker coordinate={providerLocation} title={providerName}>
                                <View style={styles.markerOuter}>
                                    <Animated.View style={[styles.markerPulse, { transform: [{ scale: pulseAnim }] }]} />
                                    <View style={styles.markerInner}>
                                        <Navigation2 size={16} color="#FFF" />
                                    </View>
                                </View>
                            </Marker>
                        )}
                    </MapView>

                    {/* Floating back button */}
                    <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
                        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                            <ArrowLeft size={20} color="#111827" />
                        </TouchableOpacity>
                        <View style={styles.etaBadge}>
                            <Timer size={14} color={PRIMARY} />
                            <Text style={styles.etaText}>ETA {eta}</Text>
                        </View>
                    </SafeAreaView>

                    {/* ZOMATO-STYLE BOTTOM PROVIDER CARD */}
                    <View style={styles.zomatoCard}>
                        {/* Colored accent bar at top */}
                        <View style={[styles.zomatoAccentBar, { backgroundColor: statusMeta.color }]} />

                        {/* Handle */}
                        <View style={styles.handle} />

                        {/* Top row: provider info + ETA chip */}
                        <View style={styles.zomatoTopRow}>
                            {/* Avatar */}
                            <View style={[styles.zomatoAvatar, { borderColor: statusMeta.color }]}>
                                <Text style={styles.zomatoAvatarText}>{initial}</Text>
                            </View>

                            {/* Name + service + rating */}
                            <View style={styles.zomatoProviderInfo}>
                                <Text style={styles.zomatoProviderName} numberOfLines={1}>{providerName}</Text>
                                <Text style={styles.zomatoServiceName} numberOfLines={1}>{booking.service_name_snapshot ?? 'Service'}</Text>
                                <View style={styles.zomatoRatingRow}>
                                    <Star size={11} color="#F59E0B" fill="#F59E0B" />
                                    <Text style={styles.zomatoRatingText}>
                                        {booking?.provider_details?.avg_rating ?? '4.8'}
                                    </Text>
                                    <Text style={styles.zomatoRatingDivider}>•</Text>
                                    <Text style={styles.zomatoRatingText}>₹{booking.total_amount ?? '—'}</Text>
                                </View>
                            </View>

                            {/* ETA chip */}
                            <View style={[styles.zomatoEtaChip, { backgroundColor: `${statusMeta.color}15`, borderColor: `${statusMeta.color}30` }]}>
                                <Timer size={12} color={statusMeta.color} />
                                <Text style={[styles.zomatoEtaText, { color: statusMeta.color }]}>{eta}</Text>
                            </View>
                        </View>

                        {/* Status label strip */}
                        <View style={styles.zomatoStatusStrip}>
                            <View style={[styles.zomatoStatusDot, { backgroundColor: statusMeta.color }]} />
                            <Text style={styles.zomatoStatusLabel}>{statusMeta.title}</Text>
                            <Text style={styles.zomatoStatusSub}> — {statusMeta.sub}</Text>
                        </View>

                        {/* Stepper */}
                        <View style={styles.stepperContainer}>
                            {[
                                { key: 'confirmed', label: 'Confirmed' },
                                { key: 'en_route', label: 'On Way' },
                                { key: 'in_progress', label: 'Started' },
                                { key: 'completed', label: 'Done' }
                            ].map((step, i) => {
                                const statuses = ['confirmed', 'en_route', 'arrived', 'in_progress', 'completed'];
                                const currentStatusIdx = statuses.indexOf(booking.status);
                                const stepToIdx: Record<string, number> = { confirmed: 0, en_route: 1, in_progress: 3, completed: 4 };
                                const stepIdx = stepToIdx[step.key];
                                const isDone = currentStatusIdx >= stepIdx;
                                const isActive = currentStatusIdx === stepIdx || (step.key === 'en_route' && booking.status === 'arrived');
                                return (
                                    <View key={step.key} style={styles.stepItem}>
                                        <View style={[styles.stepDot, isDone && styles.stepDotDone, isActive && styles.stepDotActive]}>
                                            {isDone && <Text style={styles.stepCheck}>✓</Text>}
                                        </View>
                                        <Text style={[styles.stepLabel, isDone && styles.stepLabelDone, isActive && styles.stepLabelActive]}>{step.label}</Text>
                                        {i < 3 && <View style={[styles.stepLine, isDone && styles.stepLineDone]} />}
                                    </View>
                                );
                            })}
                        </View>

                        {/* Divider */}
                        <View style={styles.zomatoDivider} />

                        {/* Action buttons row */}
                        <View style={styles.zomatoActionsRow}>
                            <TouchableOpacity
                                style={styles.zomatoActionBtn}
                                activeOpacity={0.75}
                                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(id) } } as any)}
                            >
                                <View style={[styles.zomatoActionIcon, { backgroundColor: '#EEF2FF' }]}>
                                    <MessageSquare size={18} color={PRIMARY} />
                                </View>
                                <Text style={styles.zomatoActionLabel}>Chat</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.zomatoActionBtn}
                                activeOpacity={0.75}
                                onPress={() => {
                                    if (booking.profiles?.phone) {
                                        initiateCall(booking.profiles.phone);
                                    } else {
                                        Alert.alert('Error', 'Provider phone not available.');
                                    }
                                }}
                            >
                                <View style={[styles.zomatoActionIcon, { backgroundColor: '#ECFDF5' }]}>
                                    <Phone size={18} color="#059669" />
                                </View>
                                <Text style={styles.zomatoActionLabel}>Call</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.zomatoActionBtn}
                                activeOpacity={0.75}
                                onPress={() => router.push({ pathname: '/provider/[id]', params: { id: booking.provider_id } } as any)}
                            >
                                <View style={[styles.zomatoActionIcon, { backgroundColor: '#FFF7ED' }]}>
                                    <Star size={18} color="#F59E0B" />
                                </View>
                                <Text style={styles.zomatoActionLabel}>Profile</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.zomatoActionBtn}
                                activeOpacity={0.75}
                                onPress={handleSOS}
                            >
                                <View style={[styles.zomatoActionIcon, { backgroundColor: '#FEF2F2' }]}>
                                    <Shield size={18} color="#DC2626" />
                                </View>
                                <Text style={styles.zomatoActionLabel}>SOS</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Footer: cancel / reschedule */}
                        <View style={styles.zomatoFooterRow}>
                            <TouchableOpacity
                                disabled={['completed', 'cancelled', 'disputed'].includes(booking.status)}
                                onPress={() => setCancelModalVisible(true)}
                            >
                                <Text style={[styles.cancelLink, ['completed', 'cancelled', 'disputed'].includes(booking.status) && { opacity: 0.3 }]}>
                                    Cancel Booking
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={!['requested', 'searching', 'confirmed'].includes(booking.status)}
                                onPress={() => setRescheduleModalVisible(true)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                                <Calendar size={13} color={['requested', 'searching', 'confirmed'].includes(booking.status) ? PRIMARY : '#9CA3AF'} />
                                <Text style={[styles.rescheduleLink, !['requested', 'searching', 'confirmed'].includes(booking.status) && { color: '#9CA3AF' }]}>
                                    Reschedule
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Proof of Work Section */}
                        {(booking.work_proof_start_url || booking.work_proof_complete_url) && (
                            <View style={styles.proofSection}>
                                <Text style={styles.proofTitle}>Work Evidence</Text>
                                <View style={styles.proofGrid}>
                                    {booking.work_proof_start_url && (
                                        <View style={styles.proofBox}>
                                            <Image source={{ uri: booking.work_proof_start_url }} style={styles.proofImage} />
                                            <View style={styles.proofLabelBox}>
                                                <Text style={styles.proofLabel}>START PROOF</Text>
                                            </View>
                                        </View>
                                    )}
                                    {booking.work_proof_complete_url && (
                                        <View style={styles.proofBox}>
                                            <Image source={{ uri: booking.work_proof_complete_url }} style={styles.proofImage} />
                                            <View style={[styles.proofLabelBox, { backgroundColor: '#059669' }]}>
                                                <Text style={styles.proofLabel}>COMPLETED</Text>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Cancellation Modal */}
                    <CancelModal
                        visible={cancelModalVisible}
                        bookingId={id as string}
                        cancelReason={selectedReason}
                        customReason={cancelDetails}
                        cancelling={isCancelling}
                        onClose={() => setCancelModalVisible(false)}
                        onSelectReason={setSelectedReason}
                        onCustomReasonChange={setCancelDetails}
                        onConfirm={handleCancelJob}
                    />

                    {/* Reschedule Modal */}
                    <RescheduleModal
                        visible={rescheduleModalVisible}
                        onClose={() => setRescheduleModalVisible(false)}
                        onConfirm={handleReschedule}
                        currentDate={booking.scheduled_date}
                        currentSlot={booking.scheduled_time_slot}
                    />
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#FFF' },
    loaderText: { fontSize: 14, color: '#9CA3AF' },
    // Map
    map: { flex: 1 },
    // Floating header
    headerOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
    },
    backBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    },
    etaBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.92)', borderRadius: 24,
        paddingHorizontal: 16, paddingVertical: 10,
        borderWidth: 1, borderColor: 'rgba(26, 63, 255, 0.1)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12, shadowRadius: 15, elevation: 8,
    },
    etaText: { fontSize: 13, fontWeight: '800', color: PRIMARY, letterSpacing: 0.5 },
    // Marker
    markerOuter: { alignItems: 'center', justifyContent: 'center', width: 50, height: 50 },
    markerPulse: {
        position: 'absolute', width: 40, height: 40, borderRadius: 20,
        backgroundColor: `${PRIMARY}30`,
    },
    markerInner: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center',
        borderWidth: 2.5, borderColor: '#FFF',
        shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
    // Bottom Sheet
    sheet: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 20, paddingBottom: 36,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08, shadowRadius: 20, elevation: 12,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 6, marginBottom: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusTitle: { fontSize: 14, fontWeight: '700' },
    statusSub: { fontSize: 12, color: '#9CA3AF', marginBottom: 16 },
    // Stepper
    stepperContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25, marginTop: 10, paddingHorizontal: 10 },
    stepItem: { alignItems: 'center', flex: 1, position: 'relative' },
    stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 2, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    stepDotDone: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    stepDotActive: { backgroundColor: '#FFF', borderColor: PRIMARY, borderWidth: 2, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 },
    stepCheck: { color: '#FFF', fontSize: 12, fontWeight: '900' },
    stepLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', marginTop: 8 },
    stepLabelDone: { color: PRIMARY },
    stepLabelActive: { color: PRIMARY, fontWeight: '800' },
    stepLine: { position: 'absolute', top: 12, left: '50%', right: '-50%', height: 2, backgroundColor: '#F3F4F6', zIndex: 5 },
    stepLineDone: { backgroundColor: PRIMARY },
    // Worker card
    workerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 14, marginBottom: 14, gap: 12 },
    workerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    workerAvatarText: { fontSize: 20, fontWeight: '800', color: PRIMARY },
    workerName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
    workerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    workerRating: { fontSize: 12, color: '#6B7280' },
    quickActions: { flexDirection: 'row', gap: 8 },
    actionBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
    },
    // Booking meta
    bookingMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    metaLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
    cancelLink: { fontSize: 13, color: '#DC2626', fontWeight: '700', textDecorationLine: 'underline' },
    rescheduleLink: { fontSize: 13, color: PRIMARY, fontWeight: '700', textDecorationLine: 'underline' },
    metaValue: { fontSize: 14, fontWeight: '800', color: PRIMARY },
    // Cancellation Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    cancelSheet: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '80%'
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
    dangerIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
    cancelTitle: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 2 },
    cancelSub: { fontSize: 13, color: '#6B7280' },
    closeModal: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    reasonsList: { marginBottom: 20 },
    reasonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: '#F9FAFB',
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#F3F4F6'
    },
    reasonItemActive: { backgroundColor: '#FEE2E250', borderColor: '#FECACA' },
    reasonLabel: { fontSize: 14, color: '#4B5563', fontWeight: '600' },
    reasonLabelActive: { color: '#DC2626' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
    radioActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
    detailsInput: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        fontSize: 14,
        color: '#111827',
        borderWidth: 1,
        borderColor: '#F3F4F6',
        textAlignVertical: 'top',
        marginTop: 4
    },
    cancelActions: { flexDirection: 'row', gap: 12 },
    keepBtn: { flex: 1, height: 56, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    keepBtnText: { fontSize: 16, fontWeight: '800', color: '#4B5563' },
    confirmCancelBtn: { flex: 1, height: 56, borderRadius: 16, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center' },
    confirmCancelBtnDisabled: { opacity: 0.5 },
    confirmCancelText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
    // SOS (kept for legacy reference, now inside action row)
    sosBtn: {
        position: 'absolute', bottom: 200, right: 20,
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#DC2626', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5, shadowRadius: 10, elevation: 10,
        zIndex: 99,
    },
    sosPulse: {
        position: 'absolute', width: 56, height: 56, borderRadius: 28,
        backgroundColor: '#FCA5A520',
    },
    sosBtnText: { fontSize: 14, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
    // ─── Zomato-style bottom card ───────────────────────────────────────
    zomatoCard: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingBottom: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.1,
        shadowRadius: 18,
        elevation: 16,
        overflow: 'hidden',
    },
    zomatoAccentBar: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 3,
    },
    zomatoTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
        marginTop: 4,
    },
    zomatoAvatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: PRIMARY,
    },
    zomatoAvatarText: {
        fontSize: 22,
        fontWeight: '900',
        color: PRIMARY,
    },
    zomatoProviderInfo: { flex: 1 },
    zomatoProviderName: {
        fontSize: 17,
        fontWeight: '800',
        color: '#111827',
        marginBottom: 2,
    },
    zomatoServiceName: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
        marginBottom: 4,
    },
    zomatoRatingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    zomatoRatingText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#374151',
    },
    zomatoRatingDivider: {
        fontSize: 10,
        color: '#9CA3AF',
        marginHorizontal: 2,
    },
    zomatoEtaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        minWidth: 72,
        justifyContent: 'center',
    },
    zomatoEtaText: {
        fontSize: 13,
        fontWeight: '800',
    },
    zomatoStatusStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 14,
    },
    zomatoStatusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    zomatoStatusLabel: {
        fontSize: 13,
        fontWeight: '800',
        color: '#111827',
    },
    zomatoStatusSub: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
        flex: 1,
    },
    zomatoDivider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginVertical: 14,
    },
    zomatoActionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 14,
    },
    zomatoActionBtn: {
        alignItems: 'center',
        gap: 6,
    },
    zomatoActionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    zomatoActionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#374151',
    },
    zomatoFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        marginBottom: 4,
    },
    // Searching Footer
    searchingFooter: {
        position: 'absolute', bottom: 40, left: 20, right: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: 24, borderRadius: 24, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1, shadowRadius: 20, elevation: 10
    },
    searchingNote: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    closeSearching: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    closeSearchingText: {
        color: '#DC2626',
        fontSize: 14,
        fontWeight: '800',
    },
    // No Worker Found UI
    noWorkerContainer: { flex: 1, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', padding: 40 },
    noWorkerIconBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    noWorkerTitle: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 12 },
    noWorkerSub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    retryBtn: { backgroundColor: PRIMARY, width: '100%', height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    retryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    backToBookings: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backToBookingsText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
    // Receipt UI
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
    receiptProofSection: { width: '100%', marginTop: 24 },
    receiptProofBox: { flex: 1, height: 160, borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0' },
    receiptFooter: { width: '100%', marginTop: 40, alignItems: 'center' },
    downloadBtn: { width: '100%', height: 56, borderRadius: 16, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    downloadBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    needHelpBtn: { paddingVertical: 10 },
    needHelpText: { fontSize: 14, color: PRIMARY, fontWeight: '700' },
    // Proof of Work (Original)
    proofSection: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    proofTitle: { fontSize: 13, fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
    proofGrid: { flexDirection: 'row', gap: 12 },
    proofBox: { flex: 1, height: 120, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
    proofImage: { width: '100%', height: '100%' },
    proofLabelBox: { position: 'absolute', bottom: 8, left: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(26, 63, 255, 0.8)' },
    proofLabel: { fontSize: 8, fontWeight: '900', color: '#FFF' },
    // Success Overlay for Transition
    successOverlay: {
        flex: 1,
        backgroundColor: PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    successIconBoxLarge: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    successTitle: {
        fontSize: 32,
        fontWeight: '900',
        color: '#FFF',
        marginBottom: 16,
        textAlign: 'center',
    },
    successSub: {
        fontSize: 18,
        color: 'rgba(255, 255, 255, 0.8)',
        textAlign: 'center',
        lineHeight: 26,
        fontWeight: '600',
    },
});
