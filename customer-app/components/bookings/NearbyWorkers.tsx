import React, { useEffect, useRef } from 'react';
import { Animated, FlatList, StyleSheet, Text, View, Dimensions } from 'react-native';
import { PRIMARY } from '../../lib/ui-constants';

const { width } = Dimensions.get('window');

interface WorkerOffer {
  id: string;
  distance_km: number;
  provider_details: {
    business_name?: string;
    avg_rating?: number;
    profiles?: {
      full_name: string;
    };
  };
}

export default function NearbyWorkers({ offers }: { offers: WorkerOffer[] }) {
  const scrollX = useRef(new Animated.Value(0)).current;

  // Pulse animation for the "Connecting" status
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  if (!offers || offers.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Workers matching your request:</Text>
      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={width * 0.7 + 12}
        decelerationRate="fast"
        renderItem={({ item }) => {
          const name = item.provider_details.business_name || item.provider_details.profiles?.full_name || 'Nearby Expert';
          const distance = item.distance_km ? `${item.distance_km.toFixed(1)} km` : 'Calculating…';
          const initial = name.charAt(0).toUpperCase();

          return (
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
                <Animated.View style={[styles.statusPulse, { transform: [{ scale: pulseAnim }] }]} />
                <View style={[styles.statusDot]} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text style={styles.sub}>{distance} • Connecting…</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: {
    paddingHorizontal: 8,
    gap: 12,
  },
  card: {
    width: width * 0.7,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: PRIMARY,
  },
  statusPulse: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: `${PRIMARY}40`,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PRIMARY,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  sub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
});
