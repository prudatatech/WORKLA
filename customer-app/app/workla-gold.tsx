import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Check,
    Crown,
    Zap
} from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';
const GOLD = '#D97706';
const GOLD_LIGHT = '#FEF3C7';
const GOLD_DARK = '#92400E';

const PLANS = [
    {
        id: 'monthly',
        label: 'Monthly',
        price: '₹149',
        period: '/month',
        savings: null,
        badge: null,
    },
    {
        id: 'quarterly',
        label: 'Quarterly',
        price: '₹399',
        period: '/3 months',
        savings: 'Save ₹48',
        badge: 'Popular',
    },
    {
        id: 'yearly',
        label: 'Yearly',
        price: '₹1,199',
        period: '/year',
        savings: 'Save ₹589',
        badge: 'Best Value',
    },
];

const BENEFITS = [
    { icon: '⚡', title: '₹0 Platform Fee', sub: 'No extra charges on any booking, ever.' },
    { icon: '🎯', title: 'Priority Dispatch', sub: 'Your request goes to the front of the queue.' },
    { icon: '🌟', title: 'Verified Gold Workers', sub: 'Access to our highest-rated, background-checked workers.' },
    { icon: '💬', title: 'Dedicated Support', sub: '24/7 priority support with < 2 hr response time.' },
    { icon: '🎁', title: 'Monthly Free Service', sub: 'One free home cleaning every month (up to ₹299).' },
    { icon: '🔒', title: 'Work Guarantee', sub: 'Free redo if you are not 100% satisfied.' },
];

export default function WorklaGoldScreen() {
    const router = useRouter();
    const [selectedPlan, setSelectedPlan] = React.useState('quarterly');
    const [submitting, setSubmitting] = React.useState(false);
    const [isAlreadyGold, setIsAlreadyGold] = React.useState(false);
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const crownBob = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const checkGold = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('profiles').select('is_gold').eq('id', user.id).single();
                if (data?.is_gold) setIsAlreadyGold(true);
            }
        };
        checkGold();
    }, []);

    const handleSubscribe = async () => {
        if (isAlreadyGold) {
            Alert.alert('Gold Member', 'You are already a Workla Gold member!');
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not logged in');

            const months = selectedPlan === 'monthly' ? 1 : selectedPlan === 'quarterly' ? 3 : 12;
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + months);

            const { error } = await supabase
                .from('profiles')
                .update({
                    is_gold: true,
                    gold_expiry: expiryDate.toISOString(),
                    subscription_plan: selectedPlan
                })
                .eq('id', user.id);

            if (error) throw error;

            Alert.alert(
                '👑 Welcome to Gold!',
                'You are now a Workla Gold member. Enjoy zero platform fees and priority service.',
                [{ text: 'Great!', onPress: () => router.back() }]
            );
            setIsAlreadyGold(true);
        } catch (err: any) {
            Alert.alert('Subscription Failed', err.message);
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        // Shimmer sweep on the hero banner
        Animated.loop(
            Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
        ).start();
        // Crown bob
        Animated.loop(
            Animated.sequence([
                Animated.timing(crownBob, { toValue: -8, duration: 700, useNativeDriver: true }),
                Animated.timing(crownBob, { toValue: 0, duration: 700, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const plan = PLANS.find(p => p.id === selectedPlan)!;

    return (
        <SafeAreaView style={s.safeArea} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor="#92400E" />

            {/* Gradient-style hero */}
            <View style={s.hero}>
                <TouchableOpacity style={s.heroBack} onPress={() => router.back()}>
                    <ArrowLeft size={20} color="#FFF" />
                </TouchableOpacity>

                <Animated.View style={{ transform: [{ translateY: crownBob }] }}>
                    <Crown size={64} color={GOLD} />
                </Animated.View>
                <Text style={s.heroLabel}>WORKLA</Text>
                <Text style={s.heroTitle}>Gold</Text>
                <Text style={s.heroSub}>The smarter way to book services — no fees, priority dispatch, and premium workers.</Text>

                {/* Shimmer bar */}
                <View style={s.shimmerWrap}>
                    <View style={s.shimmerTrack} />
                    <Animated.View style={[s.shimmerGlow, {
                        transform: [{
                            translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] })
                        }]
                    }]} />
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

                {/* Plan selector */}
                <Text style={s.sectionTitle}>Choose your plan</Text>
                <View style={s.planRow}>
                    {PLANS.map(p => (
                        <TouchableOpacity
                            key={p.id}
                            style={[s.planCard, selectedPlan === p.id && s.planCardActive]}
                            onPress={() => setSelectedPlan(p.id)}
                            activeOpacity={0.8}
                        >
                            {p.badge && (
                                <View style={s.planBadge}><Text style={s.planBadgeText}>{p.badge}</Text></View>
                            )}
                            <Text style={[s.planLabel, selectedPlan === p.id && s.planLabelActive]}>{p.label}</Text>
                            <Text style={[s.planPrice, selectedPlan === p.id && s.planPriceActive]}>{p.price}</Text>
                            <Text style={[s.planPeriod, selectedPlan === p.id && s.planPeriodActive]}>{p.period}</Text>
                            {p.savings && (
                                <Text style={s.planSavings}>{p.savings}</Text>
                            )}
                            {selectedPlan === p.id && (
                                <View style={s.planCheck}><Check size={12} color="#FFF" /></View>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Benefits */}
                <Text style={s.sectionTitle}>What you get</Text>
                <View style={s.benefitsCard}>
                    {BENEFITS.map((b, i) => (
                        <View key={b.title} style={[s.benefitRow, i < BENEFITS.length - 1 && s.benefitBorder]}>
                            <Text style={s.benefitIcon}>{b.icon}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.benefitTitle}>{b.title}</Text>
                                <Text style={s.benefitSub}>{b.sub}</Text>
                            </View>
                            <Check size={16} color="#059669" />
                        </View>
                    ))}
                </View>

                {/* Comparison chip */}
                <View style={s.comparisonCard}>
                    <View style={s.comparisonRow}>
                        <View style={[s.compBadge, { backgroundColor: '#F3F4F6' }]}><Text style={s.compBadgeText}>Free</Text></View>
                        <Text style={s.compLabel}>Platform fee per booking: <Text style={{ fontWeight: '700', color: '#DC2626' }}>₹30–₹80</Text></Text>
                    </View>
                    <View style={s.comparisonRow}>
                        <View style={[s.compBadge, { backgroundColor: GOLD_LIGHT }]}><Crown size={11} color={GOLD} /></View>
                        <Text style={s.compLabel}>Platform fee with Gold: <Text style={{ fontWeight: '700', color: '#059669' }}>₹0</Text></Text>
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* CTA footer */}
            <View style={s.footer}>
                <View style={s.footerLeft}>
                    <Text style={s.footerPrice}>{plan.price}<Text style={s.footerPeriod}>{plan.period}</Text></Text>
                    {plan.savings && <Text style={s.footerSave}>{plan.savings}</Text>}
                </View>
                <TouchableOpacity
                    style={[s.subscribeBtn, (isAlreadyGold || submitting) && { opacity: 0.8, backgroundColor: '#FFF', borderWidth: 2, borderColor: GOLD }]}
                    activeOpacity={0.85}
                    onPress={handleSubscribe}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color={GOLD_DARK} size="small" />
                    ) : (
                        <>
                            <Crown size={16} color={isAlreadyGold ? GOLD : GOLD_DARK} />
                            <Text style={[s.subscribeBtnText, isAlreadyGold && { color: GOLD }]}>
                                {isAlreadyGold ? 'Membership Active' : 'Get Gold Now'}
                            </Text>
                            {!isAlreadyGold && <Zap size={14} color={GOLD_DARK} />}
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
    // Hero
    hero: { backgroundColor: GOLD_DARK, alignItems: 'center', paddingTop: 8, paddingBottom: 28, paddingHorizontal: 24, position: 'relative' },
    heroBack: { position: 'absolute', top: 12, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    heroLabel: { fontSize: 11, fontWeight: '900', color: GOLD, letterSpacing: 4, marginTop: 8 },
    heroTitle: { fontSize: 48, fontWeight: '900', color: '#FFF', marginTop: -4 },
    heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 16 },
    shimmerWrap: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden', position: 'relative' },
    shimmerTrack: { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
    shimmerGlow: { position: 'absolute', top: 0, width: 80, height: 3, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 2 },
    scroll: { padding: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12, marginTop: 4 },
    // Plans
    planRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    planCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: '#E5E7EB', position: 'relative' },
    planCardActive: { borderColor: GOLD, backgroundColor: GOLD_LIGHT },
    planBadge: { position: 'absolute', top: -10, backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    planBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
    planLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
    planLabelActive: { color: GOLD_DARK },
    planPrice: { fontSize: 20, fontWeight: '900', color: '#111827' },
    planPriceActive: { color: GOLD_DARK },
    planPeriod: { fontSize: 10, color: '#9CA3AF', marginBottom: 4 },
    planPeriodActive: { color: GOLD },
    planSavings: { fontSize: 10, color: '#059669', fontWeight: '700', backgroundColor: '#D1FAE5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    planCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
    // Benefits
    benefitsCard: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' },
    benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
    benefitBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
    benefitIcon: { fontSize: 22 },
    benefitTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
    benefitSub: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
    // Comparison
    comparisonCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#F3F4F6' },
    comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    compBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    compBadgeText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
    compLabel: { fontSize: 13, color: '#374151', flex: 1 },
    // Footer
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 32, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    footerLeft: { gap: 2 },
    footerPrice: { fontSize: 20, fontWeight: '900', color: '#111827' },
    footerPeriod: { fontSize: 13, fontWeight: '400', color: '#9CA3AF' },
    footerSave: { fontSize: 12, fontWeight: '600', color: '#059669' },
    subscribeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GOLD, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
    subscribeBtnText: { fontSize: 15, fontWeight: '800', color: GOLD_DARK },
});
