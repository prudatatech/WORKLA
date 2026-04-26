/**
 * ProviderFoundScreen.tsx
 * Shown after a provider accepts but before they start navigation.
 * Displays a premium "match found" animation with the provider's name.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { Check, Navigation2, Star } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface ProviderFoundScreenProps {
  providerName: string;
  serviceName: string;
  rating?: number;
  onDismiss?: () => void;
}

export default function ProviderFoundScreen({
  providerName,
  serviceName,
  rating,
  onDismiss,
}: ProviderFoundScreenProps) {
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameSlide = useRef(new Animated.Value(24)).current;
  const ringScale1 = useRef(new Animated.Value(0.8)).current;
  const ringOpacity1 = useRef(new Animated.Value(0.6)).current;
  const avatarScale = useRef(new Animated.Value(0)).current;

  const initial = (providerName || 'E').charAt(0).toUpperCase();

  useEffect(() => {
    // Step 1: Avatar pops in
    Animated.spring(avatarScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 5,
    }).start();

    // Step 2: Pulse rings
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale1, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(ringOpacity1, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale1, { toValue: 0.8, duration: 0, useNativeDriver: true }),
          Animated.timing(ringOpacity1, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Step 3: Check icon
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 5 }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }, 300);

    // Step 4: Name slides in
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(nameOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(nameSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }, 500);
  }, [avatarScale, ringScale1, ringOpacity1, checkScale, checkOpacity, nameOpacity, nameSlide]);

  return (
    <View style={styles.container}>
      {/* Dark background */}
      <View style={styles.bg} />
      <View style={styles.bgGlow} />

      {/* Top label */}
      <View style={styles.topBadge}>
        <View style={styles.topBadgeDot} />
        <Text style={styles.topBadgeText}>PARTNER FOUND</Text>
      </View>

      {/* Avatar area */}
      <View style={styles.avatarArea}>
        {/* Pulse rings */}
        <Animated.View
          style={[
            styles.ring,
            { transform: [{ scale: ringScale1 }], opacity: ringOpacity1 },
          ]}
        />
        <Animated.View
          style={[
            styles.ring,
            {
              transform: [{ scale: ringScale1 }],
              opacity: Animated.multiply(ringOpacity1, 0.5),
              width: 200,
              height: 200,
              borderRadius: 100,
            },
          ]}
        />

        {/* Avatar */}
        <Animated.View
          style={[styles.avatar, { transform: [{ scale: avatarScale }] }]}
        >
          <Text style={styles.avatarInitial}>{initial}</Text>

          {/* Check badge */}
          <Animated.View
            style={[
              styles.checkBadge,
              { transform: [{ scale: checkScale }], opacity: checkOpacity },
            ]}
          >
            <Check size={14} color="#FFF" strokeWidth={3} />
          </Animated.View>
        </Animated.View>
      </View>

      {/* Provider details */}
      <Animated.View
        style={[
          styles.detailsWrap,
          { opacity: nameOpacity, transform: [{ translateY: nameSlide }] },
        ]}
      >
        <Text style={styles.acceptedLabel}>has accepted your request</Text>
        <Text style={styles.providerName}>{providerName}</Text>
        <Text style={styles.serviceLabel}>{serviceName}</Text>

        {rating != null && rating > 0 && (
          <View style={styles.ratingRow}>
            <Star size={14} color="#F59E0B" fill="#F59E0B" />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        )}

        <View style={styles.statusStrip}>
          <Navigation2 size={14} color="#60A5FA" />
          <Text style={styles.statusStripText}>
            Getting ready to head your way...
          </Text>
        </View>

        {onDismiss && (
          <TouchableOpacity style={styles.trackButton} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.trackButtonText}>Track Live</Text>
            <Check size={16} color="#FFF" />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const AVATAR_SIZE = 120;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B1120',
  },
  bgGlow: {
    position: 'absolute',
    width: width * 1.6,
    height: width * 1.6,
    borderRadius: width * 0.8,
    top: -width * 0.6,
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
  },
  topBadge: {
    position: 'absolute',
    top: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.3)',
  },
  topBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  topBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 1,
  },
  avatarArea: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#1E293B',
    borderWidth: 3,
    borderColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  checkBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    borderWidth: 2.5,
    borderColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsWrap: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 6,
  },
  acceptedLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  providerName: {
    fontSize: 30,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  serviceLabel: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },
  statusStripText: {
    fontSize: 13,
    color: '#93C5FD',
    fontWeight: '600',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 18,
    marginTop: 32,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  trackButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
});
