/**
 * SearchingProvider.tsx — Premium redesign
 * Full-screen dark gradient background, more spacious layout,
 * 4-ring radar, animated worker dots orbiting the center.
 */
import { Zap } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const PRIMARY = '#1A3FFF';

// ─── Pulse ring ───────────────────────────────────────────────────────────────
function PulseRing({ delay, maxScale }: { delay: number; maxScale: number }) {
  const anim = useSharedValue(0);
  useEffect(() => {
    anim.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.cubic) }), -1, false)
    );
  }, [anim, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(anim.value, [0, 1], [1, maxScale], Extrapolate.CLAMP) }],
    opacity: interpolate(anim.value, [0, 0.15, 0.8, 1], [0, 0.35, 0.05, 0], Extrapolate.CLAMP),
  }));
  return <Animated.View style={[styles.ring, style]} />;
}

// ─── Orbiting worker dot ──────────────────────────────────────────────────────
function OrbitDot({ delay, radius, duration, color }: { delay: number; radius: number; duration: number; color: string }) {
  const angle = useSharedValue(0);
  useEffect(() => {
    angle.value = withDelay(delay, withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false));
  }, [angle, delay, duration]);
  const style = useAnimatedStyle(() => {
    const rad = (angle.value * Math.PI) / 180;
    return {
      transform: [
        { translateX: Math.cos(rad) * radius },
        { translateY: Math.sin(rad) * radius },
      ],
    };
  });
  return (
    <Animated.View style={[styles.orbitDot, style, { backgroundColor: color }]} />
  );
}

export default function SearchingProvider({ serviceName }: { serviceName: string }) {
  return (
    <View style={styles.container}>
      {/* Gradient background simulation with layered views */}
      <View style={styles.bgDark} />
      <View style={styles.bgGlow} />

      {/* Radar section */}
      <View style={styles.radarWrap}>
        <PulseRing delay={0} maxScale={3.2} />
        <PulseRing delay={700} maxScale={2.6} />
        <PulseRing delay={1400} maxScale={2.0} />
        <PulseRing delay={2100} maxScale={1.5} />

        {/* Orbiting worker dots */}
        <OrbitDot delay={0} radius={85} duration={4000} color="#60A5FA" />
        <OrbitDot delay={1333} radius={85} duration={4000} color="#34D399" />
        <OrbitDot delay={2666} radius={85} duration={4000} color="#FBBF24" />

        {/* Center icon */}
        <View style={styles.center}>
          <Zap size={36} color="#FFF" fill="#FFF" />
        </View>
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <View style={styles.serviceChip}>
          <Text style={styles.serviceChipText}>{serviceName}</Text>
        </View>
        <Text style={styles.title}>Finding your expert</Text>
        <Text style={styles.subtitle}>
          Matching with the best nearby service professionals — usually under 60 seconds.
        </Text>
      </View>

      {/* Bottom badge */}
      <View style={styles.badge}>
        <View style={styles.badgeDot} />
        <Text style={styles.badgeText}>Live matching in progress</Text>
      </View>
    </View>
  );
}

const RING_SIZE = 110;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bgDark: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0B1120' },
  bgGlow: {
    position: 'absolute', width: width * 1.4, height: width * 1.4,
    borderRadius: width * 0.7, top: -width * 0.5,
    backgroundColor: 'rgba(26, 63, 255, 0.18)',
  },

  radarWrap: {
    width: RING_SIZE, height: RING_SIZE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 56,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
    borderWidth: 1.5, borderColor: 'rgba(99,138,255,0.6)',
    backgroundColor: 'rgba(99,138,255,0.04)',
  },
  center: {
    width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
    backgroundColor: PRIMARY,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55, shadowRadius: 28, elevation: 18,
    zIndex: 10,
  },
  orbitDot: {
    position: 'absolute',
    width: 11, height: 11, borderRadius: 6,
    shadowColor: '#FFF', shadowOpacity: 0.5, shadowRadius: 6,
  },

  textWrap: { alignItems: 'center', paddingHorizontal: 36, gap: 12 },
  serviceChip: {
    backgroundColor: 'rgba(99,138,255,0.18)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(99,138,255,0.3)',
  },
  serviceChipText: { fontSize: 13, fontWeight: '700', color: '#93C5FD' },
  title: { fontSize: 26, fontWeight: '900', color: '#F8FAFC', textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },

  badge: {
    position: 'absolute', bottom: 52,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 30,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
});
