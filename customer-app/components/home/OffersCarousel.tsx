import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Banner } from '../BannerCarousel';
import { PRIMARY } from '../../lib/ui-constants';

interface OffersCarouselProps {
  banners: Banner[];
  loading: boolean;
}

export default function OffersCarousel({ banners, loading }: OffersCarouselProps) {
  const router = useRouter();
  const offersScrollRef = useRef<ScrollView>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex(prev => {
        const next = (prev + 1) % banners.length;
        offersScrollRef.current?.scrollTo({ x: next * (260 + 12), animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [banners]);

  return (
    <View style={styles.offersSection}>
      <View style={styles.offersTitleRow}>
        <Text style={styles.offersTitle}>Offers for you</Text>
        <TouchableOpacity onPress={() => router.push('/coupons' as any)}>
          <Text style={styles.offersViewAll}>View all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        ref={offersScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.offersScroll}
      >
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <View key={i} style={[styles.offerCard, { backgroundColor: '#E5E7EB' }]} />
          ))
        ) : banners.map((b: any) => (
          <TouchableOpacity
            key={b.id}
            style={styles.offerCard}
            activeOpacity={0.9}
            onPress={() => { if (b.deep_link) router.push(b.deep_link as any); }}
          >
            <Image source={{ uri: b.image_url }} style={styles.offerImage} />
            <View style={styles.offerOverlay}>
              {b.badge_text && (
                <View style={styles.offerBadge}>
                  <Text style={styles.offerBadgeText}>{b.badge_text}</Text>
                </View>
              )}
              <Text style={styles.offerName}>{b.title}</Text>
              <Text style={styles.offerDesc}>{b.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  offersSection: { marginTop: 4 },
  offersTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6 },
  offersTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  offersViewAll: { fontSize: 12, fontWeight: '700', color: PRIMARY },
  offersScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
  offerCard: { width: 260, borderRadius: 20, overflow: 'hidden', position: 'relative', backgroundColor: PRIMARY },
  offerImage: { width: 260, height: 130 },
  offerOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  offerBadge: { backgroundColor: '#FBBF24', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 4 },
  offerBadgeText: { fontSize: 10, fontWeight: '900', color: '#1C1917' },
  offerName: { fontSize: 13, fontWeight: '800', color: '#FFF', marginBottom: 2 },
  offerDesc: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
});
