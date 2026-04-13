import { useRouter } from 'expo-router';
import {
  BellOff,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Star,
  Tag,
  Truck,
  Zap
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#1A3FFF';

type NotifType = 'booking' | 'promo' | 'chat' | 'rating' | 'status' | 'dispatch' | 'payment';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
  metadata?: any;
}

const NOTIF_CONFIG: Record<NotifType, { Icon: any; bg: string; color: string }> = {
  booking: { Icon: BookOpen, bg: '#EEF2FF', color: PRIMARY },
  promo: { Icon: Tag, bg: '#FFFBEB', color: '#D97706' },
  chat: { Icon: MessageSquare, bg: '#F0FDF4', color: '#059669' },
  rating: { Icon: Star, bg: '#FFF7ED', color: '#EA580C' },
  status: { Icon: Truck, bg: '#F5F3FF', color: '#7C3AED' },
  dispatch: { Icon: Zap, bg: '#EFF6FF', color: '#2563EB' },
  payment: { Icon: WalletPlaceholder, bg: '#F0F9FF', color: '#0EA5E9' },
};

function WalletPlaceholder({ size, color }: { size: number; color: string }) {
  return <BookOpen size={size} color={color} />; // Using placeholder until Lucide Wallet is verified
}

const FILTER_TABS = ['All', 'Unread', 'Bookings', 'Promos'];

export default function AlertsScreen() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  const fetchNotifs = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth');
        return;
      }

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) setNotifs(data);
    } catch (e) {
      console.error('Fetch notifications error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  const unreadCount = notifs.filter(n => !n.is_read).length;

  const filtered = notifs.filter(n => {
    if (activeFilter === 'Unread') return !n.is_read;
    if (activeFilter === 'Bookings') return ['booking', 'dispatch', 'status', 'rating'].includes(n.type);
    if (activeFilter === 'Promos') return n.type === 'promo';
    return true;
  });

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setNotifs(curr => curr.map(n => ({ ...n, is_read: true })));
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifs(curr => curr.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const renderNotif = ({ item, index }: { item: Notification; index: number }) => {
    const config = NOTIF_CONFIG[item.type] || NOTIF_CONFIG.booking;
    const Icon = config.Icon;

    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.is_read && styles.notifCardUnread]}
        activeOpacity={0.7}
        onPress={() => {
          markRead(item.id);
          if (item.metadata?.booking_id) {
            router.push(`/bookings` as any);
          }
        }}
      >
        {!item.is_read && <View style={styles.unreadDot} />}

        <View style={[styles.notifIconWrap, { backgroundColor: config.bg }]}>
          <Icon size={18} color={config.color} />
        </View>

        <View style={styles.notifBody}>
          <View style={styles.notifTopRow}>
            <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleBold]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.notifText} numberOfLines={2}>{item.body}</Text>
        </View>

        <ChevronRight size={14} color="#D1D5DB" />
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSub}>{unreadCount} unread</Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
              <CheckCircle2 size={14} color={PRIMARY} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, activeFilter === tab && styles.filterTabActive]}
            onPress={() => setActiveFilter(tab)}
          >
            <Text style={[styles.filterTabText, activeFilter === tab && styles.filterTabTextActive]}>
              {tab}
              {tab === 'Unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderNotif}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifs(); }} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <BellOff size={52} color="#E5E7EB" />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>No {activeFilter.toLowerCase()} notifications</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  markAllText: { fontSize: 12, color: PRIMARY, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row', backgroundColor: '#FFF',
    paddingHorizontal: 16, paddingBottom: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB' },
  filterTabActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterTabTextActive: { color: '#FFF' },
  listContent: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 110 },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
    position: 'relative',
  },
  notifCardUnread: { backgroundColor: '#FAFBFF', borderColor: `${PRIMARY}30` },
  unreadDot: {
    position: 'absolute', top: 16, left: 6,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: PRIMARY,
  },
  notifIconWrap: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  notifBody: { flex: 1 },
  notifTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  notifTitle: { fontSize: 14, fontWeight: '500', color: '#374151', flex: 1 },
  notifTitleBold: { fontWeight: '700', color: '#111827' },
  notifTime: { fontSize: 11, color: '#9CA3AF', flexShrink: 0 },
  notifText: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151' },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF' },
});
