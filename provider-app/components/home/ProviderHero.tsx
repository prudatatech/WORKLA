import { Zap, Power } from 'lucide-react-native';
import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const ONLINE_COLOR = '#059669';
const OFFLINE_COLOR = '#6B7280';

interface ProviderHeroProps {
  isOnline: boolean;
  toggling: boolean;
  providerName: string;
  pulseAnim: Animated.Value;
  onToggle: () => void;
  onBellPress: () => void;
}

export default function ProviderHero({ isOnline, toggling, providerName, pulseAnim, onToggle, onBellPress }: ProviderHeroProps) {
  return (
    <View style={[styles.hero, { backgroundColor: isOnline ? ONLINE_COLOR : '#374151' }]}>
      <View style={styles.heroTop}>
        <View>
          <Text style={styles.heroGreeting}>Welcome back,</Text>
          <Text style={styles.heroName}>{providerName}</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn} onPress={onBellPress}>
          <Zap size={20} color="#FFF" fill="#FFF" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.toggleCard, toggling && { opacity: 0.7 }]}
        onPress={onToggle}
        disabled={toggling}
        activeOpacity={0.9}
      >
        <Animated.View style={[styles.togglePulse, { transform: [{ scale: pulseAnim }], backgroundColor: '#FFF' }]} />
        <View style={[styles.toggleDot, { backgroundColor: '#FFF' }]}>
          <Power size={18} color={isOnline ? ONLINE_COLOR : OFFLINE_COLOR} strokeWidth={3} />
        </View>
        <View>
          <Text style={styles.toggleStatus}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          <Text style={styles.toggleSub}>{isOnline ? 'You are visible to customers' : 'Tap to go online to earn'}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heroGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  heroName: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  bellBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 18, position: 'relative', overflow: 'hidden' },
  togglePulse: { position: 'absolute', width: 60, height: 60, borderRadius: 30, left: 14, opacity: 0.1 },
  toggleDot: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  toggleStatus: { fontSize: 16, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  toggleSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
});
