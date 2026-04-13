import { useRouter } from 'expo-router';
import {
  Calendar, CheckCircle2, Clock, Loader, MapPin, Repeat, Star, XCircle
} from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

const PRIMARY = '#1A3FFF';

const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  requested: { label: 'Finding Worker…', color: '#D97706', bg: '#FEF3C7', Icon: Loader },
  searching: { label: 'Searching Nearby', color: '#7C3AED', bg: '#EDE9FE', Icon: Loader },
  confirmed: { label: 'Worker Assigned', color: PRIMARY, bg: '#EEF2FF', Icon: CheckCircle2 },
  en_route: { label: 'On the Way', color: '#0369A1', bg: '#E0F2FE', Icon: MapPin },
  arrived: { label: 'Worker Arrived', color: '#059669', bg: '#D1FAE5', Icon: MapPin },
  in_progress: { label: 'In Progress', color: '#7C3AED', bg: '#EDE9FE', Icon: Loader },
  completed: { label: 'Completed', color: '#059669', bg: '#D1FAE5', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEE2E2', Icon: XCircle },
  disputed: { label: 'Disputed', color: '#E11D48', bg: '#FFF1F2', Icon: XCircle },
};

interface BookingCardProps {
  item: any;
  onCancel: (id: string) => void;
}

export default function BookingCard({ item, onCancel }: BookingCardProps) {
  const router = useRouter();
  const meta = STATUS_META[item.status] ?? STATUS_META.requested;
  const StatusIcon = meta.Icon;
  const isActive = ['confirmed', 'en_route', 'arrived', 'in_progress'].includes(item.status);
  const isCompleted = item.status === 'completed';

  const renderRightActions = () => {
    if (item.status !== 'requested' && item.status !== 'searching') return null;
    return (
      <TouchableOpacity style={styles.swipeCancelBtn} onPress={() => onCancel(item.id)}>
        <XCircle size={24} color="#FFF" />
        <Text style={styles.swipeCancelText}>Cancel</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} containerStyle={{ marginBottom: 12 }}>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardService}>{item.service_subcategories?.name || 'Service Request'}</Text>
            <Text style={styles.cardBookingId}>#{item.booking_number || item.id.slice(0, 8).toUpperCase()}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <StatusIcon size={12} color={meta.color} />
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {item.provider_details?.business_name && (
          <Text style={styles.cardProvider}>Worker: {item.provider_details.business_name}</Text>
        )}

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Calendar size={13} color="#9CA3AF" />
            <Text style={styles.metaText}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
          <View style={styles.metaItem}>
            <Clock size={13} color="#9CA3AF" />
            <Text style={styles.metaText}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>₹{item.total_amount}</Text>
          </View>
        </View>

        {isActive && (
          <View style={styles.internalProgressContainer}>
            <View style={styles.internalProgressBarBg}>
              <View 
                style={[
                  styles.internalProgressBarFill, 
                  { 
                    width: `${((['confirmed', 'en_route', 'arrived', 'in_progress'].indexOf(item.status) + 1) / 4) * 100}%` 
                  }
                ]} 
              />
            </View>
            <View style={styles.internalProgressLabels}>
              <Text style={[styles.internalProgressLabel, item.status === 'confirmed' && styles.activeInternalLabel]}>Assigned</Text>
              <Text style={[styles.internalProgressLabel, (item.status === 'en_route' || item.status === 'arrived') && styles.activeInternalLabel]}>On Way</Text>
              <Text style={[styles.internalProgressLabel, item.status === 'in_progress' && styles.activeInternalLabel]}>Started</Text>
            </View>
          </View>
        )}

        {isCompleted && item.price_breakdown && (
          <View style={styles.receiptBox}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Base Price</Text>
              <Text style={styles.receiptValue}>₹{item.price_breakdown.base_price || item.total_amount}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Tax & Fees</Text>
              <Text style={styles.receiptValue}>₹{item.price_breakdown.tax || 0}</Text>
            </View>
            {item.price_breakdown.discount > 0 && (
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: '#059669' }]}>Discount</Text>
                <Text style={[styles.receiptValue, { color: '#059669' }]}>-₹{item.price_breakdown.discount}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.cardActions}>
          {!['cancelled'].includes(item.status) && !isCompleted && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {isActive && (
                <TouchableOpacity style={styles.actionBtnSecondary} onPress={() => router.push(`/chat/${item.id}` as any)}>
                  <Text style={styles.actionBtnTextSecondary}>Chat</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtnSecondary} onPress={() => router.push(`/track/${item.id}` as any)}>
                <MapPin size={15} color={PRIMARY} />
                <Text style={styles.actionBtnTextSecondary}>
                  {isActive ? 'Track' : 'View Details'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isCompleted && (
            <View style={styles.completedActions}>
              <TouchableOpacity style={styles.actionBtnSecondarySmall} onPress={() => router.push(`/track/${item.id}` as any)}>
                <Text style={styles.actionBtnTextSecondarySmall}>Receipt</Text>
              </TouchableOpacity>
              
              {!item.customer_rating ? (
                <TouchableOpacity style={styles.rateBtnSmall} onPress={() => router.push(`/rate/${item.id}` as any)}>
                  <Text style={styles.actionBtnTextPrimarySmall}>Rate</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.ratedBadgeSmall}>
                  <Star size={12} color="#F59E0B" fill="#F59E0B" />
                  <Text style={styles.ratedTextSmall}>{item.customer_rating}/5</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.rebookBtnSmall}
                onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.provider_id, service: item.service_subcategories?.name } } as any)}
              >
                <Repeat size={14} color={PRIMARY} />
                <Text style={styles.rebookBtnTextSmall}>Rebook</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3, marginBottom: 16
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  cardService: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardBookingId: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardProvider: { fontSize: 13, color: PRIMARY, marginBottom: 8, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#6B7280' },
  priceTag: { marginLeft: 'auto', backgroundColor: '#F0F9FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priceText: { fontSize: 13, fontWeight: '800', color: PRIMARY },
  receiptBox: { marginTop: 4, marginBottom: 16, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E7EB' },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  receiptLabel: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  receiptValue: { fontSize: 11, fontWeight: '700', color: '#374151' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  actionBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: PRIMARY },
  actionBtnTextSecondary: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  rateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: PRIMARY },
  actionBtnTextPrimary: { fontSize: 13, color: '#FFF', fontWeight: '700' },
  ratedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FEF3C7' },
  ratedText: { fontSize: 12, fontWeight: '700', color: '#B45309' },
  swipeCancelBtn: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 80, height: '100%', borderRadius: 16, marginLeft: 12 },
  swipeCancelText: { color: '#FFF', fontSize: 11, fontWeight: '800', marginTop: 4 },
  completedActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  actionBtnSecondarySmall: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: PRIMARY },
  actionBtnTextSecondarySmall: { fontSize: 13, color: PRIMARY, fontWeight: '700' },
  rateBtnSmall: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, backgroundColor: PRIMARY },
  actionBtnTextPrimarySmall: { fontSize: 13, color: '#FFF', fontWeight: '800' },
  ratedBadgeSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FEF3C7' },
  ratedTextSmall: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  rebookBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, backgroundColor: '#F3F4F6' },
  rebookBtnTextSmall: { fontSize: 13, color: PRIMARY, fontWeight: '800' },
  internalProgressContainer: { marginTop: 4, marginBottom: 16 },
  internalProgressBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, marginBottom: 8 },
  internalProgressBarFill: { height: '100%', backgroundColor: PRIMARY, borderRadius: 3 },
  internalProgressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  internalProgressLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8' },
  activeInternalLabel: { color: PRIMARY, fontWeight: '800' },
});
