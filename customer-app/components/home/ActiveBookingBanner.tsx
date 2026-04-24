/**
 * ActiveBookingBanner.tsx — Smart multi-booking tracking widget
 * Shows up to 3 active bookings. Single → large card. Multiple → horizontal scroll.
 */
import { useRouter } from 'expo-router';
import { Navigation, X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PRIMARY } from '../../lib/ui-constants';

const STATUS_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  requested:   { label: 'Finding Worker…',  color: PRIMARY,    dot: '#6366F1' },
  searching:   { label: 'Searching nearby', color: PRIMARY,    dot: '#6366F1' },
  confirmed:   { label: 'Worker Assigned',  color: '#7C3AED',  dot: '#7C3AED' },
  en_route:    { label: 'On the Way',       color: '#0369A1',  dot: '#0EA5E9' },
  arrived:     { label: 'Worker Arrived',   color: '#059669',  dot: '#10B981' },
  in_progress: { label: 'Work in Progress', color: '#D97706',  dot: '#F59E0B' },
  disputed:    { label: 'Disputed',         color: '#DC2626',  dot: '#EF4444' },
};

interface Props {
  activeBookings: any[];          // up to 3
  bannerSlide: Animated.Value;
  onDismiss: () => void;
}

export default function ActiveBookingBanner({ activeBookings, bannerSlide, onDismiss }: Props) {
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse for dot
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    // Blink for LIVE text
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim, blinkAnim]);

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
          <Animated.Text style={[styles.liveText, { opacity: blinkAnim }]}>LIVE</Animated.Text>
        </View>
        <Text style={styles.headerTitle}>
          {activeBookings.length === 1
            ? `${STATUS_LABEL[activeBookings[0].status]?.label ?? 'Active'}`
            : `${activeBookings.length} Active Services`}
        </Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={15} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* Booking cards */}
      <View style={styles.scrollWrapper}>
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
                </View>
                <View style={styles.trackBtn}>
                  <Navigation size={11} color="#FFF" />
                  <Text style={styles.trackText}>Track</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above tab bar
    left: 12,
    right: 12,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    zIndex: 1000,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '900', color: '#10B981', letterSpacing: 1.2 },
  headerTitle: { fontSize: 12, fontWeight: '800', color: '#F1F5F9', flex: 1, textAlign: 'center' },
  scrollWrapper: { paddingBottom: 12 },
  cardsScroll: { paddingHorizontal: 12, gap: 10 },
  card: {
    width: 220,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardFull: { width: Dimensions.get('window').width - 48 },
  cardAccent: { width: 4, alignSelf: 'stretch' },
  cardContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  cardService: { fontSize: 13, fontWeight: '800', color: '#F8FAFC', marginBottom: 2 },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  cardStatus: { fontSize: 11, fontWeight: '700' },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  trackText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
});
