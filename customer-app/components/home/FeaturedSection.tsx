import { useRouter } from 'expo-router';
import { Star, Zap } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ServiceGridSkeleton, ListRowSkeleton } from '../SkeletonLoader';
import { PRIMARY } from '../../lib/ui-constants';

function ServiceCategoryImage({ imageUrl, FallbackIcon, bg, color, size, borderRadius }: {
  imageUrl?: string; FallbackIcon: any; bg: string; color: string; size: number; borderRadius: number;
}) {
  const [imgError, setImgError] = useState(false);
  if (imageUrl && !imgError) {
    return <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius }} onError={() => setImgError(true)} resizeMode="cover" />;
  }
  return (
    <View style={[{ width: size, height: size, borderRadius, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }]}>
      <FallbackIcon color={color} size={size * 0.45} />
    </View>
  );
}

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

type Layout = 'popular' | 'smart' | 'recommended';

interface FeaturedSectionProps {
  title: string;
  data: any[];
  loading: boolean;
  layout: Layout;
  onLayout?: (y: number) => void;
}

function navigateToService(router: any, s: any) {
  if (s.type === 'sub-service' || s.service_id) {
    router.push({ pathname: '/service/detail/[id]', params: { id: s.id } } as any);
  } else {
    router.push({ pathname: '/service/[id]', params: { id: s.id } } as any);
  }
}

export default function FeaturedSection({ title, data, loading, layout, onLayout }: FeaturedSectionProps) {
  const router = useRouter();
  if (data.length === 0 && !loading) return null;

  return (
    <View style={styles.section} onLayout={e => onLayout?.(e.nativeEvent.layout.y)}>
      {layout === 'recommended' ? (
        <Text style={styles.sectionHeader}>{title}</Text>
      ) : (
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>{title}</Text>
          <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
        </View>
      )}

      {layout === 'popular' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
          {loading ? Array.from({ length: 4 }).map((_, i) => <View key={i} style={{ marginRight: 15 }}><ServiceGridSkeleton /></View>) :
            data.map(s => (
              <TouchableOpacity key={s.id} style={styles.popCard} onPress={() => navigateToService(router, s)}>
                <ServiceCategoryImage imageUrl={s.image_url} FallbackIcon={s.Icon} bg={s.bg} color={s.color} size={100} borderRadius={20} />
                <Text style={styles.popLabel} numberOfLines={1}>{s.name}</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
      )}

      {layout === 'smart' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
          {loading ? Array.from({ length: 3 }).map((_, i) => <View key={i} style={{ marginRight: 15, width: 140 }}><ServiceGridSkeleton /></View>) :
            data.map(s => (
              <TouchableOpacity key={s.id} style={styles.smartCard} onPress={() => navigateToService(router, s)}>
                <View style={styles.smartImageWrap}>
                  <ServiceCategoryImage imageUrl={s.image_url} FallbackIcon={s.Icon} bg={s.bg} color={s.color} size={140} borderRadius={16} />
                  <View style={styles.smartBadge}>
                    <Zap size={10} color="#FFF" fill="#FFF" />
                    <Text style={styles.smartBadgeText}>QUICK</Text>
                  </View>
                </View>
                <Text style={styles.smartLabel} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.smartSub} numberOfLines={1}>{s.description || 'Expert professionals'}</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
      )}

      {layout === 'recommended' && (
        loading ? Array.from({ length: 3 }).map((_, i) => <ListRowSkeleton key={i} />) :
          data.slice(0, 4).map((s: any) => (
            <AnimatedTile key={s.id} onPress={() => navigateToService(router, s)}>
              <View style={styles.listCard}>
                <ServiceCategoryImage imageUrl={s.image_url} FallbackIcon={s.Icon} bg={s.bg} color={s.color} size={48} borderRadius={14} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{s.name}</Text>
                  <Text style={styles.listSub} numberOfLines={1}>{s.description || 'Professional service'}</Text>
                </View>
                <View style={styles.starBadge}>
                  <Star size={11} color="#F59E0B" fill="#F59E0B" />
                  <Text style={styles.starText}>4.8</Text>
                </View>
              </View>
            </AnimatedTile>
          ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginTop: 14 },
  sectionHeader: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 0 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, marginBottom: 8, marginTop: 0 },
  seeAll: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  horizontalScroll: { paddingHorizontal: 16, gap: 16, paddingBottom: 10 },
  popCard: { width: 105, alignItems: 'center' },
  popLabel: { fontSize: 13, fontWeight: '700', color: '#1F2937', marginTop: 8, textAlign: 'center' },
  smartCard: { width: 140, marginRight: 4 },
  smartImageWrap: { position: 'relative', borderRadius: 16, overflow: 'hidden' },
  smartBadge: {
    position: 'absolute', top: 8, left: 8, backgroundColor: '#7C3AED',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, zIndex: 10
  },
  smartBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFF' },
  smartLabel: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 8 },
  smartSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F3F4F6',
  },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  listSub: { fontSize: 12, color: '#9CA3AF' },
  starBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  starText: { fontSize: 11, fontWeight: '700', color: '#D97706' },
});
