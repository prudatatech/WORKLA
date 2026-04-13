import { Calendar, Clock, MapPin } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#1A3FFF';

interface JobOfferCardProps {
  item: any;
  actionLoading: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export default function JobOfferCard({ item, actionLoading, onAccept, onReject }: JobOfferCardProps) {
  return (
    <View style={[styles.jobCard, { borderColor: PRIMARY, borderWidth: 2, backgroundColor: '#F0F4FF' }]}>
      <View style={styles.cardTop}>
        <View>
          <View style={styles.offerBadge}>
            <Clock size={12} color="#FFF" />
            <Text style={styles.offerBadgeText}>NEW JOB OFFER</Text>
          </View>
          <Text style={styles.serviceType}>{item.bookings?.service_subcategories?.name ?? 'Service'}</Text>
        </View>
        <Text style={styles.priceTag}>₹{item.bookings?.total_amount}</Text>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <MapPin size={14} color="#94A3B8" />
          <Text style={styles.infoText} numberOfLines={1}>{item.bookings?.customer_address}</Text>
        </View>
        <View style={styles.infoItemsRow}>
          <View style={styles.infoSubItem}><Calendar size={14} color="#94A3B8" /><Text style={styles.infoText}>{item.bookings?.scheduled_date}</Text></View>
          <View style={styles.infoSubItem}><Clock size={14} color="#94A3B8" /><Text style={styles.infoText}>{item.bookings?.scheduled_time_slot}</Text></View>
        </View>
      </View>

      <View style={styles.offerActions}>
        <TouchableOpacity style={styles.rejectBtn} onPress={() => onReject(item.id)} disabled={actionLoading === item.id}>
          <Text style={styles.rejectBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(item.id)} disabled={actionLoading === item.id}>
          {actionLoading === item.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.acceptBtnText}>Accept Job</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  jobCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  serviceType: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginTop: 2 },
  priceTag: { fontSize: 20, fontWeight: '900', color: PRIMARY },
  offerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PRIMARY, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 6 },
  offerBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFF' },
  infoGrid: { gap: 10 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoItemsRow: { flexDirection: 'row', gap: 15, flexWrap: 'wrap' },
  infoSubItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#64748B' },
  offerActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  rejectBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  acceptBtn: { flex: 2, height: 48, borderRadius: 12, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
});
