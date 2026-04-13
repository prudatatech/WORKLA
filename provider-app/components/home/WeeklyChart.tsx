import { TrendingUp } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const PRIMARY = '#1A3FFF';

interface WeeklyChartProps {
  weeklyData: number[];
}

export default function WeeklyChart({ weeklyData }: WeeklyChartProps) {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(days[d.getDay()]);
  }

  return (
    <View style={styles.weekCard}>
      <View style={styles.weekHeader}>
        <TrendingUp size={16} color={PRIMARY} />
        <Text style={styles.weekTitle}>Last 7 Days Earnings</Text>
      </View>
      <View style={styles.barsRow}>
        {weeklyData.map((val, i) => {
          const max = Math.max(...weeklyData, 100);
          const h = (val / max) * 100;
          const isToday = i === 6;
          return (
            <View key={i} style={styles.barWrap}>
              <View style={[styles.bar, { height: Math.max(h, 4), backgroundColor: isToday ? PRIMARY : '#C7D2FE' }]} />
              <Text style={[styles.barLabel, isToday && { color: PRIMARY, fontWeight: '700' }]}>{labels[i]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#F3F4F6' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  weekTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 120 },
  barWrap: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', borderRadius: 8, minHeight: 4 },
  barLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 8 },
});
