import { useRouter } from 'expo-router';
import { Navigation, X } from 'lucide-react-native';
import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PRIMARY } from '../../lib/ui-constants';

const ACTIVE_STATUS_LABEL: Record<string, string> = {
  requested: 'Finding Worker…',
  searching: 'Searching nearby…',
  confirmed: 'Worker Assigned',
  en_route: 'Worker On the Way',
  arrived: 'Worker Arrived',
  in_progress: 'Work in Progress',
  disputed: 'Disputed ⚠️',
};

interface ActiveBookingBannerProps {
  activeBooking: any;
  bannerSlide: Animated.Value;
  onDismiss: () => void;
}

export default function ActiveBookingBanner({ activeBooking, bannerSlide, onDismiss }: ActiveBookingBannerProps) {
  const router = useRouter();

  if (!activeBooking) return null;

  return (
    <Animated.View style={[styles.activeBanner, { transform: [{ translateY: bannerSlide }] }]}>
      <TouchableOpacity 
        style={styles.activeBannerLeft} 
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/track/[id]', params: { id: activeBooking.id } } as any)}
      >
        <View style={styles.activeDotContainer}>
          <View style={styles.activeDot} />
          <View style={[styles.activeDot, { position: 'absolute', opacity: 0.4, transform: [{ scale: 1.5 }] }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.activeBannerLabel}>
            {ACTIVE_STATUS_LABEL[activeBooking.status] ?? 'Active Booking'}
          </Text>
          <Text style={styles.activeBannerSub} numberOfLines={1}>
            {activeBooking.service_name_snapshot} · #{activeBooking.booking_number}
          </Text>
        </View>
      </TouchableOpacity>
      
      <View style={styles.activeBannerActions}>
        <TouchableOpacity
          style={styles.trackBtn}
          onPress={() => router.push({ pathname: '/track/[id]', params: { id: activeBooking.id } } as any)}
        >
          <Navigation size={12} color="#FFF" />
          <Text style={styles.trackBtnText}>Track</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
          <X size={14} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  activeBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0F172A', // Deeper black/navy
    marginHorizontal: 16, 
    marginTop: 8,
    marginBottom: 0,
    borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 15,
  },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  activeDotContainer: { width: 10, height: 10, justifyContent: 'center', alignItems: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  activeBannerLabel: { fontSize: 13, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  activeBannerSub: { fontSize: 11, color: '#94A3B8', marginTop: 1, fontWeight: '500' },
  activeBannerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  trackBtnText: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  dismissBtn: { padding: 6 },
});
