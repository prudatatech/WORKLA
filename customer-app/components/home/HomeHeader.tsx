import { useRouter } from 'expo-router';
import {
  Bell,
  Briefcase,
  ChevronDown,
  Home,
  MapPin,
  Search,
  User,
} from 'lucide-react-native';
import React, { useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PRIMARY } from '../../lib/ui-constants';

interface HomeHeaderProps {
  selectedAddress: any;
  rawLocationName: string;
  loyaltyCoins: number;
  unreadCount: number;
  notifPulse: Animated.Value;
}

export default function HomeHeader({
  selectedAddress,
  rawLocationName,
  loyaltyCoins,
  unreadCount,
  notifPulse,
}: HomeHeaderProps) {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.headerBg}>
      <View style={styles.topBar}>
        <View style={styles.greetingWrap}>
          <TouchableOpacity style={styles.locationRow} onPress={() => router.push('/addresses?selectable=true')}>
            {selectedAddress?.label === 'Home' ? <Home color="#FFF" size={20} strokeWidth={2.5} />
              : selectedAddress?.label === 'Work' ? <Briefcase color="#FFF" size={20} strokeWidth={2.5} />
                : <MapPin color="#FFF" size={20} strokeWidth={2.5} />}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.locationAddress} numberOfLines={1}>
                  {selectedAddress ? selectedAddress.name : rawLocationName}
                </Text>
                <ChevronDown color="rgba(255,255,255,0.7)" size={16} />
              </View>
              <Text style={styles.locationSub}>{selectedAddress ? selectedAddress.address : 'Explore services around you'}</Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.coinsWidget}>
            <View style={styles.coinDot}><Text style={styles.coinDotText}>W</Text></View>
            <Text style={styles.coinValueText}>{loyaltyCoins}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/notifications' as any)}>
            <Animated.View style={{ transform: [{ scale: notifPulse }] }}>
              <Bell color="#FFF" size={22} />
            </Animated.View>
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar} onPress={() => router.navigate('/(tabs)/profile' as any)}>
            <User color="#FFF" size={18} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrapper}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.searchBar}
          onPress={() => router.push('/search' as any)}
        >
          <Search color={PRIMARY} size={20} strokeWidth={2.5} />
          <Text style={styles.searchStaticText}>Search for services (e.g. Plumbing, AC)</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBg: { backgroundColor: PRIMARY, zIndex: 100, elevation: 12, paddingBottom: 0 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6 },
  greetingWrap: { flex: 1, paddingRight: 10 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationAddress: { color: '#FFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  locationSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifBtn: { position: 'relative', padding: 4 },
  notifBadge: {
    position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: PRIMARY,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  coinsWidget: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'
  },
  coinDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FBBF24', justifyContent: 'center', alignItems: 'center' },
  coinDotText: { fontSize: 10, fontWeight: '900', color: '#B45309' },
  coinValueText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  searchWrapper: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 0, position: 'relative', zIndex: 100 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },
  searchStaticText: { flex: 1, fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
});
