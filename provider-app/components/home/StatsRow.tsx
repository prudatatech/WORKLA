import { CheckCircle2, DollarSign, Star } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const PRIMARY = '#1A3FFF';

interface StatsRowProps {
  todayEarnings: number;
  todayJobs: number;
  rating: number;
}

export default function StatsRow({ todayEarnings, todayJobs, rating }: StatsRowProps) {
  const STATS = [
    { label: "Today's Earn", value: `₹${todayEarnings.toFixed(0)}`, Icon: DollarSign, color: '#059669', bg: '#D1FAE5' },
    { label: 'Jobs Done', value: String(todayJobs), Icon: CheckCircle2, color: PRIMARY, bg: '#EEF2FF' },
    { label: 'Rating', value: rating ? rating.toFixed(1) : '–', Icon: Star, color: '#D97706', bg: '#FEF3C7' },
  ];

  return (
    <View style={styles.statsRow}>
      {STATS.map(stat => (
        <View key={stat.label} style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
            <stat.Icon size={14} color={stat.color} />
          </View>
          <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
          <Text style={styles.statLabel}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 20, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  statIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
});
