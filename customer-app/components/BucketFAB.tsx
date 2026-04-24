/**
 * BucketFAB.tsx
 * Floating action button that shows the current bucket count.
 * Appears at the bottom of the screen when bucket has items.
 * Tapping navigates to configure-bucket screen.
 */
import { useRouter } from 'expo-router';
import { ShoppingBag } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBucketStore } from '../lib/bucketStore';

const PRIMARY = '#1A3FFF';

export default function BucketFAB() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const items = useBucketStore((s) => s.items);
  const total = useBucketStore((s) => s.total());
  const slideAnim = useRef(new Animated.Value(120)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(0);

  // Slide in/out
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: items.length > 0 ? 0 : 120,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [items.length, slideAnim]);

  // Bounce when item added
  useEffect(() => {
    if (items.length > prevCount.current) {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.12, duration: 120, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
      ]).start();
    }
    prevCount.current = items.length;
  }, [items.length, scaleAnim]);

  if (items.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: insets.bottom + 80, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] },
      ]}
    >
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.88}
        onPress={() => router.push('/book/configure-bucket' as any)}
      >
        {/* Left: icon + count */}
        <View style={styles.left}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{items.length}</Text>
          </View>
          <ShoppingBag size={18} color="#FFF" />
          <Text style={styles.label}>
            {items.length} Service{items.length > 1 ? 's' : ''} in Bucket
          </Text>
        </View>
        {/* Right: total */}
        <View style={styles.right}>
          <Text style={styles.totalText}>₹{Math.round(total)}</Text>
          <Text style={styles.arrowText}>›</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
  },
  fab: {
    backgroundColor: PRIMARY,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '900', color: PRIMARY },
  label: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalText: { fontSize: 15, fontWeight: '900', color: '#FFF' },
  arrowText: { fontSize: 22, color: 'rgba(255,255,255,0.7)', lineHeight: 24 },
});
