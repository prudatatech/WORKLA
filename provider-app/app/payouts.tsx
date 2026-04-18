import { useRouter } from 'expo-router';
import { 
    ArrowLeft, 
    Banknote, 
    Clock, 
    CheckCircle2, 
    AlertCircle, 
    History,
    IndianRupee
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { 
    ActivityIndicator, 
    Alert, 
    FlatList, 
    RefreshControl,
    StyleSheet, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    View,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { EarningRowSkeleton } from '../components/SkeletonLoader';
import { api } from '../lib/api';

const PayoutsEmptyImg = require('../assets/images/wallet-empty.png');

const PRIMARY = '#1A3FFF';

export default function PayoutScreen() {
    const router = useRouter();
    const [balance, setBalance] = useState<number>(0);
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [history, setHistory] = useState<any[]>([]);



    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch wallet balance
            const earningsRes = await api.get('/api/v1/earnings/stats');
            if (earningsRes.data) {
                setBalance(earningsRes.data.walletBalance || 0);
            }

            // 2. Fetch payout history
            const historyRes = await api.get('/api/v1/payouts/history');
            if (historyRes.data) {
                setHistory(historyRes.data);
            }
        } catch (e) {
            console.error('Failed to fetch payout data:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const onRefresh = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRequest = async () => {
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid amount to withdraw.');
            return;
        }

        if (value > balance) {
            Alert.alert('Insufficient Balance', 'You cannot withdraw more than your current balance.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post('/api/v1/payouts/request', { amount: value });
            if (res.error) throw new Error(res.error);

            Alert.alert('Success', 'Your payout request has been submitted for approval.');
            setAmount('');
            fetchData();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    const renderHistoryItem = ({ item }: { item: any }) => {
        const statusColors: any = {
            pending: { color: '#D97706', bg: '#FEF3C7', icon: Clock },
            approved: { color: '#2563EB', bg: '#DBEAFE', icon: CheckCircle2 },
            completed: { color: '#059669', bg: '#D1FAE5', icon: CheckCircle2 },
            rejected: { color: '#DC2626', bg: '#FEE2E2', icon: AlertCircle },
        };
        const meta = statusColors[item.status] || statusColors.pending;

        return (
            <View style={styles.historyCard}>
                <View style={styles.historyLeft}>
                    <View style={[styles.statusIcon, { backgroundColor: meta.bg }]}>
                        <meta.icon size={16} color={meta.color} />
                    </View>
                    <View>
                        <Text style={styles.historyDate}>
                            {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                        <Text style={[styles.statusLabel, { color: meta.color }]}>{item.status.toUpperCase()}</Text>
                    </View>
                </View>
                <Text style={styles.historyAmount}>₹{item.amount}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.root} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Earnings & Payouts</Text>
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <View style={styles.container}>
                    {/* Wallet Card */}
                    <View style={styles.walletCard}>
                        <View style={styles.walletHeader}>
                            <Banknote size={20} color="#FFF" opacity={0.8} />
                            <Text style={styles.walletLabel}>AVAILABLE BALANCE</Text>
                        </View>
                        <Text style={styles.balanceText}>₹{balance.toLocaleString('en-IN')}</Text>
                        <View style={styles.walletFooter}>
                            <Text style={styles.walletFooterText}>Settlements usually take 24-48 hours</Text>
                        </View>
                    </View>

                    {/* Withdrawal Section */}
                    <View style={styles.requestSection}>
                        <Text style={styles.sectionTitle}>Request Withdrawal</Text>
                        <View style={styles.inputContainer}>
                            <View style={styles.currencyPrefix}>
                                <IndianRupee size={18} color="#64748B" />
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter amount"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numeric"
                                value={amount}
                                onChangeText={setAmount}
                            />
                        </View>

                        <TouchableOpacity 
                            style={[styles.requestBtn, (!amount || submitting) && styles.requestBtnDisabled]}
                            onPress={handleRequest}
                            disabled={!amount || submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.requestBtnText}>Withdraw to Bank</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* History Section */}
                    <View style={styles.historySection}>
                        <View style={styles.historyHeader}>
                            <History size={18} color="#1E293B" />
                            <Text style={styles.historyTitle}>Payout History</Text>
                        </View>

                        {loading ? (
                            <View style={{ gap: 5 }}>
                                {[1, 2, 3, 4, 5].map(i => <EarningRowSkeleton key={i} />)}
                            </View>
                        ) : (
                            <FlatList
                                data={history}
                                renderItem={renderHistoryItem}
                                keyExtractor={item => item.id}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
                                ListEmptyComponent={
                                    <EmptyState 
                                        title="No Payout History"
                                        description="You haven't made any withdrawal requests yet. Your earnings will appear here once you request a payout."
                                        imageSource={PayoutsEmptyImg}
                                    />
                                }
                            />
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFF' },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 20, 
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9'
    },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    container: { flex: 1, padding: 20 },
    walletCard: { 
        backgroundColor: PRIMARY, 
        borderRadius: 24, 
        padding: 24,
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
        marginBottom: 30
    },
    walletHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    walletLabel: { color: '#FFF', fontSize: 12, fontWeight: '700', letterSpacing: 1, opacity: 0.8 },
    balanceText: { color: '#FFF', fontSize: 40, fontWeight: '900' },
    walletFooter: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    walletFooterText: { color: '#FFF', fontSize: 11, opacity: 0.7 },
    requestSection: { marginBottom: 30 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 15 },
    inputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#F8FAFC', 
        borderRadius: 16, 
        borderWidth: 1.5, 
        borderColor: '#E2E8F0',
        marginBottom: 15
    },
    currencyPrefix: { paddingLeft: 16, paddingRight: 8 },
    input: { flex: 1, height: 56, fontSize: 18, fontWeight: '700', color: '#0F172A' },
    requestBtn: { 
        height: 56, 
        backgroundColor: PRIMARY, 
        borderRadius: 16, 
        justifyContent: 'center', 
        alignItems: 'center',
        shadowColor: PRIMARY,
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4
    },
    requestBtnDisabled: { opacity: 0.6 },
    requestBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    historySection: { flex: 1 },
    historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
    historyTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    historyCard: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9'
    },
    historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    historyDate: { fontSize: 14, fontWeight: '700', color: '#334155' },
    statusLabel: { fontSize: 10, fontWeight: '800' },
    historyAmount: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
    emptyContainer: { padding: 30, alignItems: 'center' },
    emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' }
});
