import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Bell,
    BellOff,
    Check,
    CreditCard,
    Package,
    Star,
    Tag,
    Trash2,
    Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    FlatList,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { NotificationRowSkeleton } from '../components/SkeletonLoader';
import { api } from '../lib/api';

const NotifEmptyImg = require('../assets/images/notifications-empty.png');

const PRIMARY = '#1A3FFF';

const NOTIF_ICON: Record<string, any> = {
    booking_update: Package,
    payment: CreditCard,
    promo: Tag,
    system: Zap,
    rating: Star,
};

const NOTIF_COLOR: Record<string, string> = {
    booking_update: '#1A3FFF',
    payment: '#059669',
    promo: '#D97706',
    system: '#7C3AED',
    rating: '#F59E0B',
};

export default function NotificationsScreen() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        const res = await api.get('/api/v1/notifications?limit=50');
        if (res.data) setNotifications(res.data);
        setLoading(false);

        // Mark all as read after opening
        await api.patch('/api/v1/notifications/read-all', {});
    }, []);

    const onRefresh = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await fetchNotifications();
    }, [fetchNotifications]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const markRead = async (id: string) => {
        await api.patch(`/api/v1/notifications/${id}/read`, {});
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const deleteNotif = async (id: string) => {
        await api.delete(`/api/v1/notifications/${id}`);
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const markAllRead = async () => {
        await api.patch('/api/v1/notifications/read-all', {});
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <ArrowLeft size={22} color="#111827" />
                </TouchableOpacity>
                <View>
                    <Text style={s.headerTitle}>Notifications</Text>
                    {unreadCount > 0 && <Text style={s.headerSub}>{unreadCount} unread</Text>}
                </View>
                {unreadCount > 0 && (
                    <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
                        <Check size={14} color={PRIMARY} />
                        <Text style={s.markAllText}>Mark all read</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={{ paddingVertical: 10 }}>
                    {[1, 2, 3, 4, 5, 6].map(i => <NotificationRowSkeleton key={i} />)}
                </View>
            ) : notifications.length === 0 ? (
                <EmptyState 
                    title="All Caught Up!"
                    description="We'll notify you about bookings, payments, and offers here."
                    imageSource={NotifEmptyImg}
                />
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
                    renderItem={({ item }) => {
                        const Icon = NOTIF_ICON[item.type] ?? Bell;
                        const iconColor = NOTIF_COLOR[item.type] ?? PRIMARY;
                        return (
                            <TouchableOpacity
                                style={[s.notifRow, !item.is_read && s.notifUnread]}
                                activeOpacity={0.7}
                                onPress={() => {
                                    markRead(item.id);
                                    // Navigate based on type
                                    if (item.type === 'booking_update' && item.data?.booking_id) {
                                        router.push({ pathname: '/track/[id]', params: { id: item.data.booking_id } } as any);
                                    }
                                }}
                            >
                                <View style={[s.notifIcon, { backgroundColor: `${iconColor}15` }]}>
                                    <Icon size={18} color={iconColor} />
                                </View>
                                <View style={s.notifBody}>
                                    <Text style={s.notifTitle}>{item.title}</Text>
                                    <Text style={s.notifBodyText} numberOfLines={2}>{item.body}</Text>
                                    <Text style={s.notifTime}>{formatTime(item.created_at)}</Text>
                                </View>
                                {!item.is_read && <View style={s.unreadDot} />}
                                <TouchableOpacity onPress={() => deleteNotif(item.id)} style={s.deleteBtn}>
                                    <Trash2 size={14} color="#D1D5DB" />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF',
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
    headerSub: { fontSize: 12, color: PRIMARY, fontWeight: '600', marginTop: 1 },
    markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    markAllText: { fontSize: 13, fontWeight: '600', color: PRIMARY },
    // Notification rows
    notifRow: {
        flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12,
        backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    notifUnread: { backgroundColor: '#EEF2FF' },
    notifIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    notifBody: { flex: 1, gap: 3 },
    notifTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
    notifBodyText: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
    notifTime: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY, marginTop: 4 },
    deleteBtn: { padding: 6 },
    // Empty state
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: '#374151' },
    emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
});
