/**
 * track/batch/[batchId].tsx
 * Overview screen for a multi-service batch booking.
 * Shows all bookings in the batch with live statuses.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Navigation } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../lib/api';
import { supabase } from '../../../lib/supabase';

const PRIMARY = '#1A3FFF';

const STATUS_META: Record<string, { label: string; color: string; emoji: string }> = {
  requested:   { label: 'Finding Worker',   color: '#6366F1', emoji: '🔍' },
  searching:   { label: 'Searching',        color: '#6366F1', emoji: '🔍' },
  confirmed:   { label: 'Worker Assigned',  color: '#7C3AED', emoji: '✅' },
  en_route:    { label: 'On the Way',       color: '#0369A1', emoji: '🚗' },
  arrived:     { label: 'Arrived',          color: '#059669', emoji: '📍' },
  in_progress: { label: 'In Progress',      color: '#D97706', emoji: '🔧' },
  completed:   { label: 'Completed',        color: '#059669', emoji: '✅' },
  cancelled:   { label: 'Cancelled',        color: '#DC2626', emoji: '❌' },
};

const CARD_COLORS = ['#6366F1', '#0EA5E9', '#10B981'];

export default function BatchTrackScreen() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!batchId) return;
    const res = await api.get(`/api/v1/bookings/batch/${batchId}`);
    if (res.data) setBookings(res.data);
    setLoading(false);
  }, [batchId]);

  useEffect(() => { load(); }, [load]);

  // Realtime status updates
  useEffect(() => {
    if (!batchId || bookings.length === 0) return;
    const bookingIds = bookings.map(b => b.id);
    const channels = bookingIds.map(id =>
      supabase
        .channel(`batch-booking-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, (payload) => {
          setBookings(prev => prev.map(b => b.id === id ? { ...b, ...payload.new } : b));
        })
        .subscribe()
    );
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [batchId, bookings.length]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)/bookings' as any)}>
          <ArrowLeft size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Multi-Service Order</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.batchLabel}>Batch ID · {batchId?.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.batchSub}>{bookings.length} services dispatched simultaneously</Text>

          {bookings.map((booking, idx) => {
            const meta = STATUS_META[booking.status] ?? STATUS_META['searching'];
            const accent = CARD_COLORS[idx % CARD_COLORS.length];
            return (
              <TouchableOpacity
                key={booking.id}
                style={[styles.card, { borderLeftColor: accent }]}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/track/[id]', params: { id: booking.id } } as any)}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.indexBadge, { backgroundColor: accent }]}>
                    <Text style={styles.indexText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceName}>{booking.service_name_snapshot}</Text>
                    <Text style={styles.bookingNum}>#{booking.booking_number}</Text>
                  </View>
                  <View style={styles.trackBtn}>
                    <Navigation size={13} color="#FFF" />
                    <Text style={styles.trackBtnText}>Track</Text>
                  </View>
                </View>

                <View style={[styles.statusStrip, { backgroundColor: `${meta.color}12` }]}>
                  <Text style={styles.statusEmoji}>{meta.emoji}</Text>
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.amountText}>₹{Math.round(booking.total_amount)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  scroll: { padding: 16, gap: 14 },
  batchLabel: { fontSize: 13, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  batchSub: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2, marginBottom: 8 },
  card: {
    backgroundColor: '#FFF', borderRadius: 18, borderLeftWidth: 4,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  indexBadge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  indexText: { fontSize: 14, fontWeight: '900', color: '#FFF' },
  serviceName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  bookingNum: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  trackBtnText: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  statusStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  statusEmoji: { fontSize: 14 },
  statusText: { fontSize: 13, fontWeight: '700' },
  amountText: { fontSize: 14, fontWeight: '800', color: '#111827' },
});
