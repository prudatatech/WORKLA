import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowUpRight, Plus, RefreshCw, Wallet } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

const WalletEmptyImg = require('../assets/images/wallet-empty.png');

const PRIMARY = '#1A3FFF';
const GREEN = '#059669';

type Transaction = {
    id: string;
    amount: number;
    transaction_type: 'credit' | 'debit';
    description: string;
    created_at: string;
};

export default function WalletScreen() {
    const router = useRouter();
    const [balance, setBalance] = useState<number>(0);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchWallet = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch balance
            const walletRes = await api.get('/api/v1/earnings/wallet');
            if (walletRes.data) {
                setBalance(walletRes.data.balance ?? 0);
            }

            // Fetch transactions
            const historyRes = await api.get('/api/v1/earnings/history');
            if (historyRes.data) {
                setTransactions(historyRes.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWallet();
    }, [fetchWallet]);

    const handleTopUp = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
            'Add Money',
            'Choose an amount to add to your wallet.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Add ₹500',
                    onPress: async () => {
                        const res = await api.post('/api/v1/earnings/wallet/topup', {
                            amount: 500,
                            paymentMethod: 'upi',
                        });
                        if (res.error) {
                            Alert.alert('Error', res.error);
                        } else {
                            fetchWallet();
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: { item: Transaction }) => {
        const isCredit = item.transaction_type === 'credit';
        const date = new Date(item.created_at).toLocaleDateString('en-IN', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        return (
            <View style={s.txnCard}>
                <View style={[s.txnIconWrap, { backgroundColor: isCredit ? '#D1FAE5' : '#FEE2E2' }]}>
                    {isCredit
                        ? <Plus size={16} color={GREEN} />
                        : <ArrowUpRight size={16} color="#DC2626" />}
                </View>
                <View style={s.txnDetails}>
                    <Text style={s.txnDesc} numberOfLines={1}>{item.description}</Text>
                    <Text style={s.txnDate}>{date}</Text>
                </View>
                <Text style={[s.txnAmount, { color: isCredit ? GREEN : '#111827' }]}>
                    {isCredit ? '+' : '-'}₹{item.amount.toFixed(0)}
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#F4F4F5" />

            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>My Wallet</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={s.balanceCard}>
                <Text style={s.balanceLabel}>Current Balance</Text>
                <Text style={s.balanceValue}>₹{balance.toFixed(0)}</Text>

                <TouchableOpacity style={s.topUpBtn} onPress={handleTopUp}>
                    <Plus size={16} color="#FFF" />
                    <Text style={s.topUpBtnText}>Add Money</Text>
                </TouchableOpacity>
            </View>

            <View style={s.body}>
                <View style={s.bodyHeader}>
                    <Text style={s.bodyTitle}>Recent Transactions</Text>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={PRIMARY} style={{ marginTop: 40 }} />
                ) : (
                    <FlatList
                        data={transactions}
                        keyExtractor={t => t.id}
                        renderItem={renderItem}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={s.list}
                        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); fetchWallet(); }} tintColor={PRIMARY} colors={[PRIMARY]} />}
                        ListEmptyComponent={
                            <EmptyState 
                                title="No Transactions"
                                description="Your transaction history is empty. Start using services to see them here!"
                                imageSource={WalletEmptyImg}
                                ctaLabel="Add Funds"
                                onCtaPress={() => Alert.alert('Add Funds', 'Wallet top-up coming soon!')}
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F4F4F5' },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    balanceCard: { backgroundColor: '#F4F4F5', padding: 24, paddingBottom: 32, alignItems: 'center' },
    balanceLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    balanceValue: { fontSize: 48, fontWeight: '900', color: '#111827', marginBottom: 24 },
    topUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, shadowColor: PRIMARY, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    topUpBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
    body: { flex: 1, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -16, padding: 20 },
    bodyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    bodyTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
    list: { paddingBottom: 40 },
    txnCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    txnIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    txnDetails: { flex: 1 },
    txnDesc: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 2 },
    txnDate: { fontSize: 12, color: '#9CA3AF' },
    txnAmount: { fontSize: 15, fontWeight: '800' },
    empty: { alignItems: 'center', marginTop: 60, opacity: 0.5 },
    emptyText: { marginTop: 12, fontSize: 14, fontWeight: '600', color: '#6B7280' }
});
