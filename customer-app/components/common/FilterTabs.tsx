import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#1A3FFF';

interface FilterTabsProps {
  tabs: string[];
  activeTab: string;
  onTabPress: (tab: string) => void;
}

export default function FilterTabs({ tabs, activeTab, onTabPress }: FilterTabsProps) {
  return (
    <View style={styles.filterRow}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.filterTab, activeTab === tab && styles.filterTabActive]}
          onPress={() => onTabPress(tab)}
        >
          <Text style={[styles.filterTabText, activeTab === tab && styles.filterTabTextActive]}>{tab}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 16, paddingBottom: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB' },
  filterTabActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterTabTextActive: { color: '#FFF' },
});
