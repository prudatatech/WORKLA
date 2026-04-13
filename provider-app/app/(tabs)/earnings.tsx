import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import {
    ArrowDownLeft,
    ArrowUpRight,
    BarChart3,
    Star,
    TrendingUp
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EarningRowSkeleton } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';

const WalletEmptyImg = require('../../assets/images/wallet-empty.png');


const PRIMARY = '#1A3FFF';
const GREEN = '#059669';

const PERIOD_TABS = ['Today', 'This Week', 'This Month', 'All'] as const;

export default function EarningsScreen() {
    const [earnings, setEarnings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [wallet, setWallet] = useState({ digital_balance: 0, total_liability: 0, total_earned: 0 });
    const [stats, setStats] = useState({ todayNet: 0, jobCount: 0, rating: 0 });

    const fetchFinancials = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Summary Stats (Today's net, job count, etc)
            const summaryRes = await api.get('/api/v1/earnings/summary');
            if (summaryRes.data) {
                setStats({
                    todayNet: summaryRes.data.todayNet || 0,
                    jobCount: summaryRes.data.jobCount || 0,
                    rating: summaryRes.data.rating || 0
                });
            }

            // 2. Fetch Wallet
            const walletRes = await api.get('/api/v1/earnings/wallet');
            if (walletRes.data) setWallet(walletRes.data);

            // 3. Fetch History (Audit Trail)
            const historyRes = await api.get('/api/v1/earnings/history');
            if (historyRes.data) setEarnings(historyRes.data);

        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    const hasMountedRef = useRef(false);

    useEffect(() => { fetchFinancials(); }, [fetchFinancials]);

    // Real-time subscription for earnings updates
    useEffect(() => {
        let channel: any;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            channel = supabase
                .channel(`earnings-live-${user.id}`)
                .on('postgres_changes', {
                    event: '*', schema: 'public', table: 'provider_earnings', filter: `provider_id=eq.${user.id}`,
                }, () => {
                    console.log('[Earnings] Real-time update detected');
                    fetchFinancials();
                })
                .subscribe();
        })();
        return () => { if (channel) supabase.removeChannel(channel); };
    }, [fetchFinancials]);

    // Silent refresh when tab is re-focused
    useFocusEffect(
        useCallback(() => {
            if (hasMountedRef.current) {
                fetchFinancials();
            }
            hasMountedRef.current = true;
        }, [fetchFinancials])
    );




    const handleWithdraw = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if ((wallet?.digital_balance || 0) <= 0) {
            Alert.alert('No Balance', 'You have no digital earnings available to withdraw.');
            return;
        }

        Alert.alert(
            'Withdraw Funds',
            `Request ₹${(wallet?.digital_balance || 0).toFixed(0)} to be transferred to your bank?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        try {
                            const res = await api.post('/api/v1/earnings/wallet/withdraw', {
                                amount: wallet.digital_balance,
                                transferMethod: 'bank_transfer'
                            });

                            if (res.success) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                Alert.alert('Request Sent', 'Your withdrawal request has been submitted for admin approval. Funds will be moved to escrow.');
                                fetchFinancials(); // Refresh balance
                            } else {
                                throw new Error(res.error || 'Withdrawal failed');
                            }
                        } catch (err: any) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
                        } finally {
                        }
                    }
                }
            ]
        );
    };

    const handlePayDues = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if ((wallet?.total_liability || 0) <= 0) {
            Alert.alert('No Dues', 'You have no outstanding platform fees to pay! Great job.');
            return;
        }

        Alert.alert(
            'Pay Platform Dues',
            `Clear your outstanding balance of ₹${(wallet?.total_liability || 0).toFixed(0)}?`,
            [
                { text: 'Later', style: 'cancel' },
                {
                    text: 'Pay Now',
                    onPress: () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Alert.alert('Payment Simulated', 'Liability successfully settled! Your balance is now clear.');
                    }
                }
            ]
        );
    };

    const STAT_CARDS = [
        { label: 'Today (Net)', value: `₹${(stats?.todayNet || 0).toFixed(0)}`, Icon: TrendingUp, color: PRIMARY, bg: '#EEF2FF' },
        { label: 'Lifetime Earned', value: `₹${(wallet?.total_earned || 0).toFixed(0)}`, Icon: BarChart3, color: '#6366F1', bg: '#EEF2FF' },
        { label: 'Platform Dues', value: `₹${(wallet?.total_liability || 0).toFixed(0)}`, Icon: ArrowUpRight, color: '#DC2626', bg: '#FEF2F2' },
        { label: 'Total Jobs', value: String(stats?.jobCount || 0), Icon: Star, color: '#D97706', bg: '#FFFBEB' },
    ];

    const renderItem = ({ item }: { item: any }) => {
        const date = new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const isEarning = item.type === 'earning';

        return (
            <View style={s.earningRow}>
                <View style={[s.earningIcon, { backgroundColor: isEarning ? '#D1FAE5' : '#FEF2F2' }]}>
                    {isEarning
                        ? <ArrowDownLeft size={16} color={GREEN} />
                        : <ArrowUpRight size={16} color="#DC2626" />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.earningService}>{item.description ?? (item.bookings as any)?.service_name_snapshot ?? 'Wallet Transaction'}</Text>
                    <Text style={s.earningDate}>{date} · {item.payment_method?.toUpperCase()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.earningNet, { color: isEarning ? GREEN : '#DC2626' }]}>
                        {isEarning ? '+' : '-'}₹{Number(item.amount || 0).toFixed(0)}
                    </Text>
                    <View style={[s.statusCapsule, { backgroundColor: isEarning ? '#D1FAE5' : '#F1F5F9' }]}>
                        <Text style={[s.statusCapsuleText, { color: isEarning ? GREEN : '#64748B' }]}>{item.type.toUpperCase()}</Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            <View style={s.header}>
                <Text style={s.headerTitle}>Financials</Text>
                {stats.rating > 0 && (
                    <View style={s.ratingBadge}>
                        <Star size={13} color="#D97706" fill="#D97706" />
                        <Text style={s.ratingText}>{(stats?.rating || 0).toFixed(1)}</Text>
                    </View>
                )}
            </View>

            <View style={s.walletBanner}>
                <View style={s.walletMain}>
                    <Text style={s.walletLabel}>Ready to Withdraw</Text>
                    <Text style={s.walletAmount}>₹{(wallet?.digital_balance || 0).toFixed(0)}</Text>
                    <TouchableOpacity style={s.withdrawAction} onPress={handleWithdraw}>
                        <Text style={s.withdrawActionText}>Withdraw</Text>
                    </TouchableOpacity>
                </View>
                <View style={s.walletDivider} />
                <TouchableOpacity style={s.walletSide} onPress={handlePayDues}>
                    <Text style={s.walletSideLabel}>Platform Dues</Text>
                    <Text style={s.walletSideAmount}>₹{(wallet?.total_liability || 0).toFixed(0)}</Text>
                    <Text style={s.payActionText}>Pay Now ›</Text>
                </TouchableOpacity>
            </View>

            <View style={s.statsGrid}>
                {STAT_CARDS.map(c => (
                    <View key={c.label} style={s.statCard}>
                        <View style={[s.statIcon, { backgroundColor: c.bg }]}>
                            <c.Icon size={16} color={c.color} />
                        </View>
                        <View style={{ alignItems: 'center' }}>
                            <Text style={[s.statValue, { color: c.color }]}>{c.value}</Text>
                            <Text style={s.statLabel}>{c.label}</Text>
                        </View>
                    </View>
                ))}
            </View>

            <View style={s.body}>
                <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>Transaction History</Text>
                    <TouchableOpacity onPress={fetchFinancials}>
                        <Text style={s.refreshText}>Refresh</Text>
                    </TouchableOpacity>
                </View>
                {loading && earnings.length === 0 ? (
                    <View style={{ marginTop: 10 }}>
                        {Array.from({ length: 5 }).map((_, i) => <EarningRowSkeleton key={i} />)}
                    </View>
                ) : (
                    <FlatList
                        data={earnings}
                        keyExtractor={i => i.id}
                        renderItem={renderItem}
                        contentContainerStyle={s.list}
                        onRefresh={fetchFinancials}
                        refreshing={loading}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={8}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                        ListEmptyComponent={
                            <EmptyState 
                                title="No Earnings Yet"
                                description="Your completed job payments and wallet transactions will appear here."
                                imageSource={WalletEmptyImg}
                            />
                        }
                    />
                )}

            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFF' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
    ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFBEB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    ratingText: { fontSize: 13, fontWeight: '800', color: '#B45309' },
    walletBanner: { flexDirection: 'row', margin: 16, backgroundColor: '#0F172A', borderRadius: 24, padding: 20, alignItems: 'center' },
    walletMain: { flex: 1.2 },
    walletLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
    walletAmount: { color: '#FFF', fontSize: 28, fontWeight: '900', marginVertical: 4 },
    withdrawAction: { backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, alignSelf: 'flex-start', marginTop: 8 },
    withdrawActionText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
    walletDivider: { width: 1, height: '80%', backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 20 },
    walletSide: { flex: 0.8 },
    walletSideLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
    walletSideAmount: { color: '#F87171', fontSize: 18, fontWeight: '900', marginVertical: 2 },
    payActionText: { color: '#F87171', fontSize: 12, fontWeight: '700', marginTop: 4 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
    statCard: { width: '48%', backgroundColor: '#F8FAFC', borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    statIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    statValue: { fontSize: 18, fontWeight: '900' },
    statLabel: { fontSize: 10, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
    body: { flex: 1, padding: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    refreshText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
    list: { paddingBottom: 40 },
    earningRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    earningIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    earningService: { fontSize: 14, fontWeight: '700', color: '#334155' },
    earningDate: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
    earningNet: { fontSize: 15, fontWeight: '800' },
    statusCapsule: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
    statusCapsuleText: { fontSize: 8, fontWeight: '900' },
    empty: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: '#94A3B8', fontSize: 14 }
});
