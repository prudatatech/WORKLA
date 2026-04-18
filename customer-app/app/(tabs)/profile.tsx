import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
    Bell,
    BookOpen,
    ChevronRight,
    Crown,
    Gift,
    HelpCircle,
    LogOut,
    MapPin,
    MessageSquare,
    Settings,
    Tag,
    User,
    Wallet
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatIndianPhone } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ProfileScreen() {
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [stats, setStats] = useState({ bookings: 0, spent: 0, coupons: 0 });
    const [walletBalance, setWalletBalance] = useState(0);
    const [isGold, setIsGold] = useState(false);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            console.log('[CUSTOMER DEBUG] Starting profile load...');
            
            // 🕒 5-second safety timeout for auth check
            const sessionPromise = supabase.auth.getSession();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth Timeout')), 5000));
            
            const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
            const u = session?.user;
            setUser(u);

            if (!u) {
                console.warn('[CUSTOMER DEBUG] No session found');
                router.replace('/auth');
                return;
            }

            console.log('[SUPABASE DEBUG] Loading data for:', u.id);
            // 1. Parallel fetch with separate error handling
            const [profRes, bookingRes, walletRes, goldRes, couponRes] = await Promise.all([
                supabase.from('profiles').select('full_name, avatar_url, city, referral_code, phone').eq('id', u.id).single(),
                supabase.from('bookings').select('id, total_amount, status').eq('customer_id', u.id),
                supabase.from('wallets').select('balance').eq('customer_id', u.id).maybeSingle(),
                supabase.from('profiles').select('is_gold').eq('id', u.id).single(),
                supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('is_active', true).gte('valid_till', new Date().toISOString())
            ]);

            if (profRes.error) console.error('[SUPABASE ERROR] Profiles:', profRes.error.message);
            if (profRes.data) setProfile(profRes.data);

            if (bookingRes.data) {
                const totalCompleted = bookingRes.data.filter(b => b.status === 'completed').length;
                const totalSpent = bookingRes.data
                    .filter(b => b.status === 'completed')
                    .reduce((sum, b) => sum + (b.total_amount || 0), 0);
                setStats(prev => ({ ...prev, bookings: totalCompleted, spent: totalSpent }));
            }

            setWalletBalance(walletRes.data?.balance ?? 0);
            setIsGold(!!goldRes.data?.is_gold);
            setStats(prev => ({ ...prev, coupons: couponRes.count ?? 0 }));

            console.log('[SUPABASE SUCCESS] Customer profile loaded');
        } catch (e: any) {
            console.error('[CUSTOMER FATAL ERROR]:', e.message || e);
        } finally {
            setLoading(false);
        }
    }, [router]);

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await loadProfile();
        setRefreshing(false);
    }, [loadProfile]);

    useEffect(() => { loadProfile(); }, [loadProfile]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.replace('/auth');
    };

    const displayName = profile?.full_name || formatIndianPhone(user?.phone) || 'Guest User';
    const displaySub = user?.email || formatIndianPhone(profile?.phone || user?.phone) || '';
    const initials = displayName.charAt(0).toUpperCase();

    const MENU_SECTIONS = [
        {
            title: 'My Account',
            items: [
                { label: 'Personal Info', Icon: User, onPress: () => router.push('/edit-profile' as any) },
                { label: 'Notifications', Icon: Bell, onPress: () => router.push('/notifications' as any) },
                { label: 'Settings', Icon: Settings, onPress: () => router.push('/settings' as any) },
            ],
        },
        {
            title: 'Bookings & Payments',
            items: [
                { label: 'My Bookings', Icon: BookOpen, onPress: () => router.navigate('/(tabs)/bookings' as any) },
                { label: 'Payment History', Icon: Wallet, onPress: () => router.push('/payment-history' as any) },
                { label: 'My Addresses', Icon: MapPin, onPress: () => router.push('/addresses' as any) },
            ],
        },
        {
            title: 'Offers & Rewards',
            items: [
                { label: `Workla Gold 👑${isGold ? ' · Active' : ''}`, Icon: Crown, onPress: () => router.push('/workla-gold' as any) },
                { label: 'My Wallet 💳', Icon: Wallet, onPress: () => router.push('/wallet' as any), badge: walletBalance > 0 ? `₹${walletBalance.toFixed(0)}` : null },
                { label: 'Coupons & Offers', Icon: Tag, onPress: () => router.push('/coupons' as any), badge: stats.coupons > 0 ? `${stats.coupons}` : null },
                { label: 'Refer & Earn 🎁', Icon: Gift, onPress: () => router.push('/referral' as any) },
            ],
        },
        {
            title: 'Help & Legal',
            items: [
                { label: 'Help & Support', Icon: HelpCircle, onPress: () => router.navigate('/(tabs)/support' as any) },
                { label: 'Send Feedback', Icon: MessageSquare, onPress: () => router.navigate('/(tabs)/support' as any) },
            ],
        },
    ];

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={styles.navHeader}>
                <Text style={styles.navTitle}>Profile</Text>
                <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/settings' as any)}>
                    <Settings size={18} color="#6B7280" />
                </TouchableOpacity>
            </View>

            <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
            >

                {/* ── Profile Hero Card ── */}
                <View style={styles.heroCard}>
                    {/* Top banner with gradient-like dark */}
                    <View style={styles.heroBanner}>
                        {isGold && (
                            <View style={styles.goldBannerBadge}>
                                <Crown size={12} color="#D97706" />
                                <Text style={styles.goldBannerText}>WORKLA GOLD</Text>
                            </View>
                        )}
                    </View>

                    {/* Avatar */}
                    <View style={styles.avatarWrap}>
                        <View style={[styles.avatarCircle, isGold && styles.avatarCircleGold]}>
                            <Text style={styles.avatarInitial}>{initials}</Text>
                        </View>
                        {isGold && (
                            <View style={styles.goldRing}>
                                <Crown size={11} color="#D97706" />
                            </View>
                        )}
                    </View>

                    <Text style={styles.heroName}>{displayName}</Text>
                    {displaySub ? <Text style={styles.heroSub}>{displaySub}</Text> : null}

                    {/* Referral code */}
                    {profile?.referral_code && (
                        <TouchableOpacity style={styles.refCodePill} onPress={() => router.push('/referral' as any)}>
                            <Gift size={12} color="#7C3AED" />
                            <Text style={styles.refCodeText}>Code: {profile.referral_code}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Quick Stats ── */}
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statNum}>{loading ? '…' : stats.bookings}</Text>
                        <Text style={styles.statLabel}>Bookings</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statNum}>{loading ? '…' : `₹${(stats.spent / 1000).toFixed(1)}k`}</Text>
                        <Text style={styles.statLabel}>Spent</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={[styles.statNum, { color: walletBalance > 0 ? '#059669' : '#111827' }]}>
                            ₹{loading ? '…' : walletBalance.toFixed(0)}
                        </Text>
                        <Text style={styles.statLabel}>Wallet</Text>
                    </View>
                </View>

                {/* ── Gold Banner (if not subscribed) ── */}
                {!isGold && !loading && (
                    <TouchableOpacity style={styles.goldPromo} onPress={() => router.push('/workla-gold' as any)} activeOpacity={0.85}>
                        <View style={styles.goldPromoLeft}>
                            <Crown size={18} color="#D97706" />
                            <View>
                                <Text style={styles.goldPromoTitle}>Get Workla Gold</Text>
                                <Text style={styles.goldPromoSub}>₹0 platform fees, priority workers & more</Text>
                            </View>
                        </View>
                        <View style={styles.goldPromoBtn}>
                            <Text style={styles.goldPromoBtnText}>Try Now</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* ── Menu Sections ── */}
                {MENU_SECTIONS.map((section) => (
                    <View key={section.title} style={styles.menuSection}>
                        <View style={styles.sectionLabelRow}>
                            <View style={styles.sectionAccent} />
                            <Text style={styles.sectionLabel}>{section.title}</Text>
                        </View>
                        <View style={styles.menuCard}>
                            {section.items.map((item, idx) => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={[styles.menuRow, idx < section.items.length - 1 && styles.menuRowBorder]}
                                    onPress={item.onPress}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.menuRowLeft}>
                                        <View style={styles.menuIconWrap}>
                                            <item.Icon size={16} color="#374151" />
                                        </View>
                                        <Text style={styles.menuLabel}>{item.label}</Text>
                                    </View>
                                    <View style={styles.menuRowRight}>
                                        {(item as any).badge && (
                                            <View style={styles.menuBadge}>
                                                <Text style={styles.menuBadgeText}>{(item as any).badge}</Text>
                                            </View>
                                        )}
                                        <ChevronRight size={16} color="#D1D5DB" />
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}

                {/* ── Logout ── */}
                <View style={styles.menuSection}>
                    <View style={styles.menuCard}>
                        <TouchableOpacity style={styles.menuRow} onPress={handleLogout} activeOpacity={0.7}>
                            <View style={styles.menuRowLeft}>
                                <View style={[styles.menuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                                    <LogOut size={16} color="#DC2626" />
                                </View>
                                <Text style={[styles.menuLabel, { color: '#DC2626' }]}>Logout</Text>
                            </View>
                            <ChevronRight size={16} color="#FCA5A5" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* App version */}
                <Text style={styles.version}>Workla v1.0.0</Text>
                <View style={{ height: 110 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
    navHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    navTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    settingsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    scroll: { paddingBottom: 20 },
    // Hero Card
    heroCard: {
        backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 16,
        borderRadius: 20, overflow: 'hidden', alignItems: 'center', paddingBottom: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
    },
    heroBanner: {
        width: '100%', height: 80,
        backgroundColor: '#0B0F1A',
        justifyContent: 'flex-end', alignItems: 'flex-end',
        paddingHorizontal: 14, paddingBottom: 10,
    },
    goldBannerBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(217,119,6,0.2)', borderRadius: 12,
        paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#D9770640',
    },
    goldBannerText: { fontSize: 10, fontWeight: '800', color: '#D97706', letterSpacing: 1 },
    avatarWrap: { marginTop: -40, position: 'relative' },
    avatarCircle: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: PRIMARY, borderWidth: 3, borderColor: '#FFF',
        justifyContent: 'center', alignItems: 'center',
        shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    avatarCircleGold: { borderColor: '#FCD34D' },
    avatarInitial: { fontSize: 30, fontWeight: '900', color: '#FFF' },
    goldRing: {
        position: 'absolute', bottom: 0, right: 0,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#FEF3C7', borderWidth: 2, borderColor: '#FFF',
        justifyContent: 'center', alignItems: 'center',
    },
    heroName: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 10, marginBottom: 2 },
    heroSub: { fontSize: 13, color: '#9CA3AF', marginBottom: 8 },
    refCodePill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#F5F3FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
        borderWidth: 1, borderColor: '#DDD6FE',
    },
    refCodeText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
    // Stats
    statsRow: {
        flexDirection: 'row', backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 12,
        borderRadius: 16, padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    statBox: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 2 },
    statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
    statDivider: { width: 1, backgroundColor: '#F3F4F6', alignSelf: 'stretch', marginVertical: 4 },
    // Gold promo
    goldPromo: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#FFFBEB', marginHorizontal: 16, marginTop: 12,
        borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#FDE68A',
    },
    goldPromoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    goldPromoTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
    goldPromoSub: { fontSize: 11, color: '#B45309', marginTop: 1 },
    goldPromoBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
    goldPromoBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
    // Menu
    menuSection: { marginHorizontal: 16, marginTop: 16 },
    sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    sectionAccent: { width: 4, height: 16, backgroundColor: PRIMARY, borderRadius: 2 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 },
    menuCard: {
        backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1,
    },
    menuRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
    },
    menuRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
    menuRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    menuIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    menuLabel: { fontSize: 14, color: '#111827', fontWeight: '500' },
    menuBadge: { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    menuBadgeText: { fontSize: 12, fontWeight: '700', color: PRIMARY },
    version: { textAlign: 'center', fontSize: 12, color: '#D1D5DB', marginTop: 24 },
});
