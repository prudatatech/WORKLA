/**
 * ActiveBookingBanner.tsx — Smart multi-booking tracking widget
 * Shows up to 3 active bookings. Single → large card. Multiple → horizontal scroll.
 */
import { useRouter } from 'expo-router';
import { Navigation, X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PRIMARY } from '../../lib/ui-constants';

const STATUS_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  requested:   { label: 'Finding Worker…',  color: PRIMARY,    dot: '#6366F1' },
  searching:   { label: 'Searching nearby', color: PRIMARY,    dot: '#6366F1' },
  confirmed:   { label: 'Worker Assigned',  color: '#7C3AED',  dot: '#7C3AED' },
  en_route:    { label: 'On the Way 🚗',    color: '#0369A1',  dot: '#0EA5E9' },
  arrived:     { label: 'Worker Arrived',   color: '#059669',  dot: '#10B981' },
  in_progress: { label: 'Work in Progress', color: '#D97706',  dot: '#F59E0B' },
  disputed:    { label: 'Disputed ⚠️',      color: '#DC2626',  dot: '#EF4444' },
};

interface Props {
  activeBookings: any[];          // up to 3
  bannerSlide: Animated.Value;
  onDismiss: () => void;
}

export default function ActiveBookingBanner({ activeBookings, bannerSlide, onDismiss }: Props) {
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.delay(1800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  if (!activeBookings || activeBookings.length === 0) return null;

  const navigateTo = (booking: any) => {
    if (booking.batch_id && activeBookings.length > 1) {
      router.push({ pathname: '/track/batch/[batchId]', params: { batchId: booking.batch_id } } as any);
    } else {
      router.push({ pathname: '/track/[id]', params: { id: booking.id } } as any);
    }
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: bannerSlide }] }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.liveRow}>
          <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.headerTitle}>
          {activeBookings.length === 1
            ? `${STATUS_LABEL[activeBookings[0].status]?.label ?? 'Active'}`
            : `${activeBookings.length} Active Services`}
        </Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={15} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Booking cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsScroll}
      >
        {activeBookings.map((booking) => {
          const meta = STATUS_LABEL[booking.status] ?? STATUS_LABEL['searching'];
          return (
            <TouchableOpacity
              key={booking.id}
              style={[styles.card, activeBookings.length === 1 && styles.cardFull]}
              activeOpacity={0.82}
              onPress={() => navigateTo(booking)}
            >
              {/* Color accent bar */}
              <View style={[styles.cardAccent, { backgroundColor: meta.dot }]} />
              <View style={styles.cardContent}>
                <Text style={styles.cardService} numberOfLines={1}>{booking.service_name_snapshot}</Text>
                <View style={styles.cardStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: meta.dot }]} />
                  <Text style={[styles.cardStatus, { color: meta.dot }]}>{meta.label}</Text>
                </View>
                <Text style={styles.cardBookingNum}>#{booking.booking_number}</Text>
              </View>
              <View style={styles.trackBtn}>
                <Navigation size={11} color="#FFF" />
                <Text style={styles.trackText}>Track</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 2,
    backgroundColor: '#0F172A',
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28, shadowRadius: 20, elevation: 14,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '900', color: '#10B981', letterSpacing: 1.5 },
  headerTitle: { fontSize: 13, fontWeight: '800', color: '#F1F5F9', flex: 1, textAlign: 'center' },
  cardsScroll: { paddingHorizontal: 12, paddingBottom: 14, gap: 10 },
  card: {
    width: 200, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row', alignItems: 'center',
  },
  cardFull: { width: '100%' },
  cardAccent: { width: 3, alignSelf: 'stretch' },
  cardContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  cardService: { fontSize: 13, fontWeight: '800', color: '#F8FAFC', marginBottom: 3 },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  cardStatus: { fontSize: 11, fontWeight: '700' },
  cardBookingNum: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PRIMARY, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginRight: 10,
  },
  trackText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
});
