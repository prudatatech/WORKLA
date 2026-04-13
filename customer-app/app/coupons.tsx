import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Clock, Copy, Tag } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Clipboard,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { localCache } from '../lib/localCache';

const PRIMARY = '#1A3FFF';

interface Coupon {
    id: string;
    code: string;
    title: string;
    description: string;
    discount_type: 'percent' | 'flat';
    discount_value: number;
    max_discount: number | null;
    min_order: number;
    valid_till: string;
    color?: string; // computed locally
    used?: boolean;
}

const COUPON_COLORS = ['#7C3AED', '#0369A1', '#059669', '#D97706', '#DC2626'];

export default function CouponsScreen() {
    const router = useRouter();
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [couponCode, setCouponCode] = useState('');
    const [copiedCode, setCopiedCode] = useState('');
    const [activeTab, setActiveTab] = useState<'available' | 'used'>('available');
    const [validating, setValidating] = useState(false);

    useEffect(() => {
        loadCoupons();
    }, []);

    const loadCoupons = async () => {
        // Show cached coupons instantly
        const cached = await localCache.get<any[]>('coupons:list');
        if (cached?.length) {
            setCoupons(cached.map((c: any, i: number) => ({
                id: c.id, code: c.code,
                title: c.description || c.code, description: c.description || '',
                discount_type: c.discount_type === 'percentage' ? 'percent' : c.discount_type,
                discount_value: c.discount_value, max_discount: c.max_discount_amount,
                min_order: c.min_order_amount || 0, valid_till: c.valid_until,
                color: COUPON_COLORS[i % COUPON_COLORS.length], used: false,
            })));
            setLoading(false);
        }

        // Fetch fresh data in background
        const res = await api.get('/api/v1/coupons');

        if (res.data) {
            const allCoupons = Array.isArray(res.data) ? res.data : [];
            setCoupons(allCoupons.map((c: any, i: number) => ({
                id: c.id, code: c.code,
                title: c.description || c.code, description: c.description || '',
                discount_type: c.discount_type === 'percentage' ? 'percent' : c.discount_type,
                discount_value: c.discount_value, max_discount: c.max_discount_amount,
                min_order: c.min_order_amount || 0, valid_till: c.valid_until,
                color: COUPON_COLORS[i % COUPON_COLORS.length], used: false,
            })));
            localCache.set('coupons:list', allCoupons, 600); // 10-min TTL
        }
        setLoading(false);
    };

    const copyCode = (code: string) => {
        Clipboard.setString(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(''), 2000);
    };

    const applyManual = async () => {
        if (!couponCode.trim()) return;
        setValidating(true);

        const res = await api.post('/api/v1/coupons/validate', {
            code: couponCode.trim().toUpperCase(),
            orderAmount: 1000, // Default check amount
        });

        setValidating(false);
        if (res.error || !res.data) {
            Alert.alert('Invalid Code', res.error || 'This coupon code is not valid or has expired.');
        } else {
            const d = res.data;
            Alert.alert('✅ Valid Coupon!', `${d.code}: ₹${d.calculatedDiscount} off`);
        }
    };

    const formatDiscount = (c: Coupon) =>
        c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`;

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const filtered = coupons.filter(c => activeTab === 'used' ? c.used : !c.used);

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <ArrowLeft size={22} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Coupons & Offers</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* Manual Code Entry */}
                <View style={s.manualWrap}>
                    <View style={s.manualRow}>
                        <TextInput
                            style={s.codeInput}
                            placeholder="Enter coupon code"
                            placeholderTextColor="#9CA3AF"
                            value={couponCode}
                            onChangeText={t => setCouponCode(t.toUpperCase())}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={applyManual}
                        />
                        <TouchableOpacity style={s.applyBtn} onPress={applyManual} disabled={validating}>
                            {validating
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <Text style={s.applyBtnText}>Apply</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Tabs */}
                <View style={s.tabs}>
                    {(['available', 'used'] as const).map(tab => (
                        <TouchableOpacity
                            key={tab}
                            style={[s.tab, activeTab === tab && s.tabActive]}
                            onPress={() => setActiveTab(tab)}
                        >
                            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                                {tab === 'available' ? 'Available' : 'Used'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Coupon List */}
                {loading ? (
                    <ActivityIndicator size="large" color={PRIMARY} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={s.empty}>
                        <Tag size={36} color="#D1D5DB" />
                        <Text style={s.emptyTitle}>
                            {activeTab === 'used' ? 'No used coupons' : 'No active offers'}
                        </Text>
                        <Text style={s.emptySub}>
                            {activeTab === 'used' ? 'Use a coupon during checkout to see it here.' : 'Check back soon for new offers!'}
                        </Text>
                    </View>
                ) : (
                    filtered.map(c => (
                        <View key={c.id} style={[s.couponCard, c.used && s.couponUsed]}>
                            {/* Left accent */}
                            <View style={[s.couponAccent, { backgroundColor: c.used ? '#D1D5DB' : c.color }]} />

                            <View style={s.couponContent}>
                                {/* Top row */}
                                <View style={s.couponTopRow}>
                                    <View style={[s.discountBadge, { backgroundColor: c.used ? '#F3F4F6' : `${c.color}15` }]}>
                                        <Text style={[s.discountText, { color: c.used ? '#9CA3AF' : c.color }]}>
                                            {formatDiscount(c)}
                                        </Text>
                                    </View>
                                    {c.used && (
                                        <View style={s.usedBadge}>
                                            <Check size={11} color="#059669" />
                                            <Text style={s.usedBadgeText}>Used</Text>
                                        </View>
                                    )}
                                </View>

                                <Text style={s.couponTitle}>{c.title}</Text>
                                <Text style={s.couponDesc}>{c.description}</Text>
                                {c.min_order > 0 && (
                                    <Text style={s.minOrder}>Min. order ₹{c.min_order}</Text>
                                )}

                                {/* Divider dots */}
                                <View style={s.dotDivider}>
                                    {Array.from({ length: 18 }).map((_, i) => (
                                        <View key={i} style={s.dot} />
                                    ))}
                                </View>

                                {/* Bottom row */}
                                <View style={s.couponBottom}>
                                    <TouchableOpacity style={s.codePill} onPress={() => !c.used && copyCode(c.code)} disabled={c.used}>
                                        <Text style={[s.codeText, c.used && { color: '#9CA3AF' }]}>{c.code}</Text>
                                        {!c.used && (
                                            copiedCode === c.code
                                                ? <Check size={12} color="#059669" />
                                                : <Copy size={12} color={PRIMARY} />
                                        )}
                                    </TouchableOpacity>
                                    <View style={s.validRow}>
                                        <Clock size={10} color="#9CA3AF" />
                                        <Text style={s.validTill}>Valid till {formatDate(c.valid_till)}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    ))
                )}
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
    scroll: { padding: 16, gap: 12 },
    // Manual entry
    manualWrap: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
    manualRow: { flexDirection: 'row', gap: 10 },
    codeInput: { flex: 1, height: 46, backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 14, fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#E5E7EB', fontWeight: '700', letterSpacing: 1 },
    applyBtn: { height: 46, paddingHorizontal: 20, backgroundColor: PRIMARY, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    applyBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
    // Tabs
    tabs: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    tabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
    tabTextActive: { color: '#111827' },
    // Coupon card
    couponCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
    couponUsed: { opacity: 0.65 },
    couponAccent: { width: 6 },
    couponContent: { flex: 1, padding: 16, gap: 6 },
    couponTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    discountBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    discountText: { fontSize: 14, fontWeight: '800' },
    usedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    usedBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669' },
    couponTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
    couponDesc: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
    minOrder: { fontSize: 11, color: '#9CA3AF' },
    dotDivider: { flexDirection: 'row', gap: 3, marginVertical: 4 },
    dot: { width: 4, height: 2, borderRadius: 1, backgroundColor: '#E5E7EB' },
    couponBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    codePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: `${PRIMARY}50` },
    codeText: { fontSize: 13, fontWeight: '800', color: PRIMARY, letterSpacing: 1 },
    validRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    validTill: { fontSize: 11, color: '#9CA3AF' },
    // Empty
    empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: '#374151' },
    emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
});
