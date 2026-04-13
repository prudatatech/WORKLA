import { useRouter } from 'expo-router';
import { ArrowLeft, Clock, CreditCard, Receipt } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { EarningRowSkeleton } from '../components/SkeletonLoader';
import { api } from '../lib/api';

const WalletEmptyImg = require('../assets/images/wallet-empty.png');

const PRIMARY = '#1A3FFF';
const GREEN = '#059669';

type PaymentItem = {
    id: string;
    booking_number: string;
    total_amount: number;
    status: string;
    payment_method: string;
    created_at: string;
    service_subcategories?: any;
};

export default function PaymentHistoryScreen() {
    const router = useRouter();
    const [payments, setPayments] = useState<PaymentItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/v1/bookings');
            if (res.data) {
                // Filter to payment-relevant statuses
                const relevantStatuses = ['completed', 'cancelled', 'in_progress', 'confirmed'];
                const filtered = Array.isArray(res.data)
                    ? res.data.filter((b: any) => relevantStatuses.includes(b.status))
                    : [];
                setPayments(filtered);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    const renderItem = ({ item }: { item: PaymentItem }) => {
        const isCompleted = item.status === 'completed';
        const date = new Date(item.created_at).toLocaleDateString('en-IN', {
            month: 'short', day: 'numeric', year: 'numeric'
        });

        return (
            <View style={s.card}>
                <View style={s.cardTop}>
                    <View style={s.iconWrap}>
                        <Receipt size={16} color={PRIMARY} />
                    </View>
                    <View style={s.details}>
                        <Text style={s.serviceName}>{item.service_subcategories?.name || 'Service Booking'}</Text>
                        <Text style={s.dateText}>{date} · #{item.booking_number}</Text>
                    </View>
                    <View style={s.amountWrap}>
                        <Text style={s.amount}>₹{item.total_amount?.toFixed(0) || '0'}</Text>
                        <Text style={[s.status, { color: isCompleted ? GREEN : '#D97706' }]}>
                            {item.status.toUpperCase()}
                        </Text>
                    </View>
                </View>

                <View style={s.divider} />

                <View style={s.cardBottom}>
                    <View style={s.methodBadge}>
                        <CreditCard size={12} color="#6B7280" />
                        <Text style={s.methodText}>{item.payment_method?.toUpperCase() || 'UNKNOWN'}</Text>
                    </View>
                    <TouchableOpacity
                        style={s.viewDetailsBtn}
                        onPress={() => router.navigate(`/(tabs)/bookings` as any)}
                    >
                        <Text style={s.viewDetailsText}>View Receipt</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Payment History</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={{ padding: 16 }}>
                    {[1, 2, 3, 4, 5, 6, 7].map(i => <EarningRowSkeleton key={i} />)}
                </View>
            ) : (
                <FlatList
                    data={payments}
                    keyExtractor={p => p.id}
                    renderItem={renderItem}
                    contentContainerStyle={s.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <EmptyState 
                            title="No Payment History"
                            description="You haven't made any transactions yet. Your payment receipts will appear here."
                            imageSource={WalletEmptyImg}
                        />
                    }
                />
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    list: { padding: 16, paddingBottom: 40, gap: 12 },
    card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    cardTop: { flexDirection: 'row', alignItems: 'center' },
    iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F9FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    details: { flex: 1 },
    serviceName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
    dateText: { fontSize: 12, color: '#6B7280' },
    amountWrap: { alignItems: 'flex-end' },
    amount: { fontSize: 16, fontWeight: '800', color: '#111827' },
    status: { fontSize: 10, fontWeight: '800', marginTop: 4 },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    methodBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    methodText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
    viewDetailsBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    viewDetailsText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
    empty: { alignItems: 'center', marginTop: 60, opacity: 0.5 },
    emptyText: { marginTop: 12, fontSize: 14, fontWeight: '600', color: '#6B7280' }
});
