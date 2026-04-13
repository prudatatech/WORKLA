import { useRouter } from 'expo-router';
import { Clock, Crown, RefreshCw, Star } from 'lucide-react-native';
import React, { useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PRIMARY } from '../../lib/ui-constants';

function AnimatedTile({ onPress, style, children }: { onPress: () => void; style?: any; children: React.ReactNode }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scaleAnim, { toValue: 0.91, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

interface QuickRebookProps {
  recentBookings: any[];
}

export default function QuickRebook({ recentBookings }: QuickRebookProps) {
  const router = useRouter();

  return (
    <View style={styles.quoteSection}>
      <View style={styles.quoteTitleRow}>
        <RefreshCw size={14} color={PRIMARY} />
        <Text style={styles.quoteTitle}>Quick Re-book</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quoteScrollContent}>
        {recentBookings.length > 0 ? (
          recentBookings.map(rb => {
            const dateStr = rb.completed_at
              ? new Date(rb.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              : new Date(rb.scheduled_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            return (
              <AnimatedTile
                key={rb.id}
                onPress={() => router.push({ pathname: '/book/[id]', params: { id: 'new', service: rb.service_name_snapshot } } as any)}
                style={styles.reBookChip}
              >
                <View style={styles.reBookChipInner}>
                  <Clock size={12} color={PRIMARY} />
                  <Text style={styles.reBookService} numberOfLines={1}>{rb.service_name_snapshot}</Text>
                  <Text style={styles.reBookDate}>{dateStr}</Text>
                </View>
              </AnimatedTile>
            );
          })
        ) : (
          <View style={styles.reBookEmpty}>
            <Text style={styles.reBookEmptyText}>Your completed bookings will appear here</Text>
          </View>
        )}
        <AnimatedTile onPress={() => router.push('/workla-gold' as any)} style={styles.goldChip}>
          <View style={styles.goldChipInner}>
            <Crown size={14} color="#D97706" />
            <Text style={styles.goldChipText}>Get Gold</Text>
          </View>
        </AnimatedTile>
        <AnimatedTile onPress={() => router.push('/referral' as any)} style={styles.referralChip}>
          <View style={styles.referralChipInner}>
            <Star size={14} color="#7C3AED" />
            <Text style={styles.referralChipText}>Refer & Earn</Text>
          </View>
        </AnimatedTile>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  quoteSection: { marginHorizontal: 16, marginTop: 4 },
  quoteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  quoteTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },
  quoteScrollContent: { gap: 8, paddingBottom: 4 },
  reBookChip: { borderRadius: 20 },
  reBookChipInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: `${PRIMARY}30`, maxWidth: 160,
  },
  reBookService: { fontSize: 13, fontWeight: '700', color: PRIMARY, flexShrink: 1 },
  reBookDate: { fontSize: 11, color: '#9CA3AF' },
  reBookEmpty: { paddingVertical: 6, paddingHorizontal: 2 },
  reBookEmptyText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  goldChip: { borderRadius: 20 },
  goldChipInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  goldChipText: { fontSize: 13, fontWeight: '700', color: '#D97706' },
  referralChip: { borderRadius: 20 },
  referralChipInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5F3FF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  referralChipText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
});
