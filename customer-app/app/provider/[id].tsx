import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    BadgeCheck,
    Briefcase,
    Calendar,
    Clock,
    MapPin,
    MessageSquare,
    Star,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#1A3FFF';



export default function ProviderDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [provider, setProvider] = useState<any>(null);
    const [reviews, setReviews] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            // 1. Fetch Provider Details
            const { data: pData } = await supabase
                .from('provider_details')
                .select(`
                    *,
                    profiles (full_name, avatar_url, city, pincode),
                    provider_services (
                        base_price, hourly_rate, experience_years,
                        service_subcategories (name, estimated_duration_minutes)
                    )
                `)
                .eq('provider_id', id)
                .single();
            if (pData) setProvider(pData);

            // 2. Fetch Reviews
            const { data: rData } = await supabase
                .from('ratings')
                .select(`
                    id, rating_score, review_text, created_at,
                    profiles!ratings_reviewer_id_fkey (full_name, avatar_url)
                `)
                .eq('reviewee_id', id)
                .order('created_at', { ascending: false })
                .limit(10);
            if (rData) setReviews(rData);

            setLoading(false);
        }
        if (id) loadData();
    }, [id]);

    if (loading) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color={PRIMARY} />
            </View>
        );
    }

    if (!provider) {
        return (
            <SafeAreaView style={styles.loader} edges={['top']}>
                <Text style={styles.errorText}>Provider not found.</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={{ color: PRIMARY, fontWeight: '600', marginTop: 12 }}>← Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    const profile = provider.profiles || {};
    const displayName = provider.business_name || profile.full_name || 'Provider';
    const initials = displayName.charAt(0).toUpperCase();
    const rating = provider.avg_rating ?? 0;
    const jobs = provider.total_jobs ?? 0;
    const experience = provider.years_of_experience ?? 0;
    const verified = provider.verification_status === 'verified';

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Sticky Header */}
            <SafeAreaView edges={['top']} style={styles.headerWrap}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
                        <ArrowLeft size={22} color="#111827" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Expert Profile</Text>
                    <View style={{ width: 40 }} />
                </View>
            </SafeAreaView>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Hero Profile Card ── */}
                <View style={styles.heroCard}>
                    {/* Dark background banner */}
                    <View style={styles.heroBanner} />

                    {/* Avatar */}
                    <View style={styles.avatarWrap}>
                        {profile.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatar, styles.avatarFallback]}>
                                <Text style={styles.avatarInitial}>{initials}</Text>
                            </View>
                        )}
                        {verified && <View style={styles.verifiedBadge}><BadgeCheck size={14} color="#FFF" /></View>}
                    </View>

                    <Text style={styles.providerName}>{displayName}</Text>
                    {profile.city && (
                        <View style={styles.locationRow}>
                            <MapPin size={13} color="#9CA3AF" />
                            <Text style={styles.locationText}>{profile.city}{profile.pincode ? `, ${profile.pincode}` : ''}</Text>
                        </View>
                    )}

                    {verified && (
                        <View style={styles.verifiedPill}>
                            <BadgeCheck size={14} color={PRIMARY} />
                            <Text style={styles.verifiedPillText}>Workla Verified</Text>
                        </View>
                    )}

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <View style={styles.statIconWrap}>
                                <Star size={16} color="#F59E0B" fill="#F59E0B" />
                            </View>
                            <Text style={styles.statValue}>{rating.toFixed(1)}</Text>
                            <Text style={styles.statLabel}>Rating</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <View style={styles.statIconWrap}>
                                <Briefcase size={16} color={PRIMARY} />
                            </View>
                            <Text style={styles.statValue}>{jobs}</Text>
                            <Text style={styles.statLabel}>Jobs Done</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <View style={styles.statIconWrap}>
                                <Calendar size={16} color="#10B981" />
                            </View>
                            <Text style={styles.statValue}>{experience} yrs</Text>
                            <Text style={styles.statLabel}>Experience</Text>
                        </View>
                    </View>
                </View>

                {/* ── Services Offered ── */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Services Offered</Text>
                    {provider.provider_services?.length > 0 ? provider.provider_services.map((svc: any, i: number) => (
                        <View key={`${svc.service_id}-${i}`} style={styles.serviceRow}>
                            <View style={styles.serviceLeft}>
                                <Text style={styles.serviceName}>
                                    {svc.service_subcategories?.name ?? 'Service'}
                                </Text>
                                <View style={styles.serviceMetaRow}>
                                    <Clock size={11} color="#9CA3AF" />
                                    <Text style={styles.serviceMeta}>
                                        Est. {svc.service_subcategories?.estimated_duration_minutes ?? '—'} mins
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.serviceRight}>
                                <Text style={styles.servicePrice}>₹{svc.base_price}</Text>
                                <Text style={styles.servicePriceLabel}>base price</Text>
                            </View>
                        </View>
                    )) : (
                        <Text style={styles.emptyNote}>No services listed yet.</Text>
                    )}
                </View>

                {/* ── Reviews ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Reviews</Text>
                        <TouchableOpacity>
                            <Text style={styles.viewAll}>View All</Text>
                        </TouchableOpacity>
                    </View>
                    {reviews.length > 0 ? reviews.map((r) => (
                        <View key={r.id} style={styles.reviewCard}>
                            <View style={styles.reviewTop}>
                                <View style={styles.reviewAvatar}>
                                    <Text style={styles.reviewAvatarText}>{(r.profiles?.full_name || '?').charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.reviewName}>{r.profiles?.full_name || 'Anonymous'}</Text>
                                    <View style={styles.starRow}>
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star key={i} size={11} color="#F59E0B" fill={i < r.rating_score ? '#F59E0B' : 'none'} />
                                        ))}
                                        <Text style={styles.reviewDate}>  {new Date(r.created_at).toLocaleDateString()}</Text>
                                    </View>
                                </View>
                            </View>
                            <Text style={styles.reviewComment}>{r.review_text}</Text>
                        </View>
                    )) : (
                        <Text style={styles.emptyNote}>No reviews yet.</Text>
                    )}
                </View>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* ── Sticky Footer ── */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => router.push(`/chat/${provider.user_id}` as any)}
                    activeOpacity={0.85}
                >
                    <MessageSquare size={20} color={PRIMARY} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bookBtn}
                    onPress={() => router.push(`/book/${provider.user_id}` as any)}
                    activeOpacity={0.85}
                >
                    <Text style={styles.bookBtnText}>Book Now</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
    errorText: { color: '#6B7280', fontSize: 15 },
    // Header
    headerWrap: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
    scroll: { paddingBottom: 120 },
    // Hero Card
    heroCard: {
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 20,
        overflow: 'hidden',
        alignItems: 'center',
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 4,
    },
    heroBanner: { width: '100%', height: 88, backgroundColor: '#0B0F1A' },
    avatarWrap: { position: 'relative', marginTop: -44 },
    avatar: {
        width: 88, height: 88, borderRadius: 44,
        borderWidth: 3, borderColor: '#FFF',
        backgroundColor: '#E5E7EB',
    },
    avatarFallback: { backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { fontSize: 34, fontWeight: '900', color: PRIMARY },
    verifiedBadge: {
        position: 'absolute', bottom: 2, right: 2,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: PRIMARY,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#FFF',
    },
    providerName: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 12, marginBottom: 4 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
    locationText: { fontSize: 13, color: '#9CA3AF' },
    verifiedPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#EEF2FF', borderRadius: 20,
        paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16,
    },
    verifiedPillText: { fontSize: 12, fontWeight: '700', color: PRIMARY },
    statsRow: {
        flexDirection: 'row', width: '100%',
        borderTopWidth: 1, borderTopColor: '#F3F4F6',
        paddingTop: 16, paddingHorizontal: 12,
    },
    statItem: { flex: 1, alignItems: 'center', gap: 4 },
    statIconWrap: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#F9FAFB',
        justifyContent: 'center', alignItems: 'center', marginBottom: 2,
    },
    statValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
    statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
    statDivider: { width: 1, backgroundColor: '#F3F4F6', alignSelf: 'stretch', marginVertical: 4 },
    // Section
    section: {
        backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 12,
        borderRadius: 16, padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
    viewAll: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
    // Service row
    serviceRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    },
    serviceLeft: { flex: 1 },
    serviceName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 },
    serviceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    serviceMeta: { fontSize: 12, color: '#9CA3AF' },
    serviceRight: { alignItems: 'flex-end' },
    servicePrice: { fontSize: 16, fontWeight: '800', color: PRIMARY },
    servicePriceLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 1 },
    emptyNote: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 12 },
    // Review
    reviewCard: {
        backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 10,
    },
    reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    reviewAvatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
    },
    reviewAvatarText: { fontSize: 15, fontWeight: '700', color: PRIMARY },
    reviewName: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 2 },
    starRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
    reviewDate: { fontSize: 11, color: '#9CA3AF', marginLeft: 4 },
    reviewComment: { fontSize: 13, color: '#374151', lineHeight: 19 },
    // Footer
    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#FFF',
        borderTopWidth: 1, borderTopColor: '#F3F4F6',
        padding: 16, paddingBottom: 28,
        flexDirection: 'row', gap: 12,
    },
    chatBtn: {
        width: 54, height: 54, borderRadius: 16,
        borderWidth: 2, borderColor: PRIMARY,
        justifyContent: 'center', alignItems: 'center',
    },
    bookBtn: {
        flex: 1, height: 54, borderRadius: 16,
        backgroundColor: PRIMARY,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    bookBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
