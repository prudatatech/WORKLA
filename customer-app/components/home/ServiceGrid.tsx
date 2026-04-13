import { useRouter } from 'expo-router';
import { Grid } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Animated, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ServiceGridSkeleton } from '../SkeletonLoader';

const { width } = Dimensions.get('window');

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

interface ServiceGridProps {
  services: any[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onLayout?: (y: number) => void;
}

export default function ServiceGrid({ services, loading, error, onRetry, onLayout }: ServiceGridProps) {
  const router = useRouter();

  return (
    <View style={styles.section} onLayout={e => onLayout?.(e.nativeEvent.layout.y)}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>Explore all services</Text>
        <TouchableOpacity onPress={() => router.push('/all-services' as any)}>
          <Text style={styles.seeAll}>View All</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => <ServiceGridSkeleton key={i} />)}
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Grid size={36} color="#EF4444" />
          <Text style={styles.emptyTitle}>Couldn&apos;t load services</Text>
          <Text style={styles.emptySub}>{error}</Text>
          {onRetry && (
            <TouchableOpacity
              style={{ marginTop: 12, backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
              onPress={onRetry}
            >
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : services.length === 0 ? (
        <View style={styles.emptyState}>
          <Grid size={36} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No Services Yet</Text>
          <Text style={styles.emptySub}>Check back later!</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 10, gap: 10 }}
          decelerationRate="normal"
        >
          {Array.from({ length: Math.ceil(services.length / 6) }).map((_, pageIndex) => (
            <View key={pageIndex} style={styles.gridPage}>
              <View style={styles.gridRow}>
                {services.slice(pageIndex * 6, pageIndex * 6 + 3).map((s: any) => (
                  <AnimatedTile
                    key={s.id}
                    onPress={() => router.push({ pathname: '/service/[id]', params: { id: s.id } } as any)}
                    style={styles.gridItemPaged}
                  >
                    <ServiceCategoryImage imageUrl={s.image_url} FallbackIcon={s.Icon} bg={s.bg} color={s.color} size={width * 0.2} borderRadius={20} />
                    <Text style={styles.gridLabel} numberOfLines={2}>{s.name}</Text>
                  </AnimatedTile>
                ))}
              </View>
              <View style={styles.gridRow}>
                {services.slice(pageIndex * 6 + 3, pageIndex * 6 + 6).map((s: any) => (
                  <AnimatedTile
                    key={s.id}
                    onPress={() => router.push({ pathname: '/service/[id]', params: { id: s.id } } as any)}
                    style={styles.gridItemPaged}
                  >
                    <ServiceCategoryImage imageUrl={s.image_url} FallbackIcon={s.Icon} bg={s.bg} color={s.color} size={width * 0.2} borderRadius={20} />
                    <Text style={styles.gridLabel} numberOfLines={2}>{s.name}</Text>
                  </AnimatedTile>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const PRIMARY = '#1A3FFF';

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginTop: 14 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, marginBottom: 8, marginTop: 0 },
  sectionHeader: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 0 },
  seeAll: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridPage: { width: width * 0.75, flexDirection: 'column', gap: 16 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  gridItemPaged: { alignItems: 'center', width: (width * 0.75 - 20) / 3 },
  gridLabel: { fontSize: 12, color: '#374151', fontWeight: '600', textAlign: 'center', marginTop: 6 },
  emptyState: { alignItems: 'center', padding: 30, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
});
