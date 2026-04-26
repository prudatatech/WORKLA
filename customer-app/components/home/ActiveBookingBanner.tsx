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
              const providerName = booking.profiles?.full_name || booking.provider_details?.business_name || booking.provider_details?.profiles?.full_name;
              const title = providerName || booking.service_name_snapshot || 'Service';
              const initial = title.charAt(0).toUpperCase();
              const subTitle = providerName ? booking.service_name_snapshot : 'Finding the best partner...';

              return (
                <TouchableOpacity
                  key={booking.id}
                  style={[styles.card, activeBookings.length === 1 && styles.cardFull]}
                  activeOpacity={0.82}
                  onPress={() => navigateTo(booking)}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.providerRow}>
                      <View style={[styles.avatarCircle, { borderColor: meta.dot }]}>
                        <Text style={styles.avatarInitial}>{initial}</Text>
                      </View>
                      <View style={styles.textContainer}>
                        <Text style={styles.cardService} numberOfLines={1}>{title}</Text>
                        <View style={styles.cardStatusRow}>
                          <View style={[styles.statusDot, { backgroundColor: meta.dot }]} />
                          <Text style={[styles.cardStatus, { color: meta.dot }]}>{meta.label}</Text>
                          {booking.status === 'en_route' && <Text style={{ fontSize: 11 }}>🚗</Text>}
                        </View>
                        <Text style={styles.subTitleText} numberOfLines={1}>{subTitle}</Text>
                      </View>
                    </View>
                    {/* Progress Bar Placeholder */}
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { backgroundColor: meta.dot, width: getProgressWidth(booking.status) }]} />
                    </View>
                  </View>
                  <View style={styles.trackBtn}>
                    <Navigation size={12} color="#FFF" />
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
    bottom: 94, // Fixed above the tab bar
    left: 14,
    right: 14,
    backgroundColor: '#0F172A',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 24,
    zIndex: 9999,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '900', color: '#10B981', letterSpacing: 1.5 },
  headerTitle: { fontSize: 12, fontWeight: '700', color: '#94A3B8', flex: 1, textAlign: 'center' },
  scrollWrapper: { paddingBottom: 14 },
  cardsScroll: { paddingHorizontal: 12, gap: 10 },
  card: {
    width: 280,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 14,
  },
  cardFull: { width: Dimensions.get('window').width - 48 },
  cardContent: { flex: 1, paddingLeft: 14, paddingVertical: 14 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  textContainer: { flex: 1, gap: 1 },
  cardService: { fontSize: 16, fontWeight: '900', color: '#FFF', letterSpacing: -0.4 },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  cardStatus: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  subTitleText: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 1 },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PRIMARY,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  trackText: { fontSize: 12, fontWeight: '900', color: '#FFF' },
  progressBarBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    marginTop: 10,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});

function getProgressWidth(status: string): string {
  switch (status) {
    case 'requested': return '15%';
    case 'searching': return '30%';
    case 'confirmed': return '50%';
    case 'en_route': return '75%';
    case 'arrived': return '90%';
    case 'in_progress': return '95%';
    default: return '0%';
  }
}
