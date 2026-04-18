import { useRouter } from 'expo-router';
import {
  Calendar, CheckCircle2, Clock, MapPin, MessageCircle,
  Navigation2, Phone, Play, Wrench, XCircle
} from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatPhone } from '../../lib/format';

const PRIMARY = '#1A3FFF';

const STATUS_FLOW: Record<string, { label: string; color: string; bg: string; nextStatus?: string; nextLabel?: string; Icon: any }> = {
  confirmed: { label: 'Accepted', color: PRIMARY, bg: '#EEF2FF', Icon: CheckCircle2, nextStatus: 'en_route', nextLabel: 'Start Navigation' },
  en_route: { label: 'En Route', color: '#0369A1', bg: '#E0F2FE', Icon: Navigation2, nextStatus: 'arrived', nextLabel: "I've Arrived" },
  arrived: { label: 'Arrived', color: '#7C3AED', bg: '#EDE9FE', Icon: MapPin, nextStatus: 'in_progress', nextLabel: 'Start Job' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: '#FEF3C7', Icon: Play, nextStatus: 'completed', nextLabel: 'Complete Job' },
  completed: { label: 'Completed', color: '#059669', bg: '#D1FAE5', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEE2E2', Icon: XCircle },
  disputed: { label: 'Disputed', color: '#E11D48', bg: '#FFF1F2', Icon: XCircle, nextStatus: 'completed', nextLabel: 'Resolve & Complete' },
};

interface JobCardProps {
  item: any;
  actionLoading: string | null;
  confirmJobId: string | null;
  onAdvance: (job: any, nextStatus: string, nextLabel: string) => void;
  onConfirmComplete: (job: any) => void;
  onCancelConfirm: () => void;
}

export default function JobCard({ item, actionLoading, confirmJobId, onAdvance, onConfirmComplete, onCancelConfirm }: JobCardProps) {
  const router = useRouter();
  const meta = STATUS_FLOW[item.status] ?? STATUS_FLOW.confirmed;
  const customer = item.profiles;
  const isActionLoading = actionLoading === item.id;

  return (
    <View style={styles.jobCard}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.bookingNum}>#{item.id?.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.serviceType}>{item.service_subcategories?.name ?? 'Service'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <meta.Icon size={12} color={meta.color} />
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.customerBox}>
        <View style={styles.customerMain}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(customer?.full_name || 'C').charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.customerName}>{customer?.full_name || 'Customer'}</Text>
            <Text style={styles.customerPhone}>{formatPhone(customer?.phone)}</Text>
          </View>
        </View>
        <View style={styles.contactActions}>
          <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${customer?.phone}`)}>
            <Phone size={16} color={PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactBtn} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } } as any)}>
            <MessageCircle size={16} color={PRIMARY} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <MapPin size={14} color="#94A3B8" />
          <Text style={styles.infoText} numberOfLines={1}>{item.customer_address}</Text>
        </View>
        <View style={styles.infoItemsRow}>
          <View style={styles.infoSubItem}><Calendar size={14} color="#94A3B8" /><Text style={styles.infoText}>{item.scheduled_date}</Text></View>
          <View style={styles.infoSubItem}><Clock size={14} color="#94A3B8" /><Text style={styles.infoText}>{item.scheduled_time_slot}</Text></View>
          <View style={styles.infoSubItem}><Wrench size={14} color="#94A3B8" /><Text style={[styles.infoText, { fontWeight: '700', color: '#1E293B' }]}>₹{item.total_amount}</Text></View>
        </View>
      </View>

      {meta.nextStatus && confirmJobId !== item.id && (
        <TouchableOpacity
          style={[styles.mainBtn, (isActionLoading) && { opacity: 0.8, backgroundColor: '#64748B' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAdvance(item, meta.nextStatus!, meta.nextLabel!);
          }}
          disabled={!!isActionLoading}
          activeOpacity={0.7}
        >
          {isActionLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              {item.status === 'confirmed' && <Navigation2 size={18} color="#FFF" />}
              <Text style={styles.mainBtnText}>{meta.nextLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {confirmJobId === item.id && (
        <View style={styles.confirmBox}>
          <Text style={[styles.confirmText, item.payment_method === 'cod' && { fontSize: 16, color: '#B45309' }]}>
            {item.payment_method === 'cod'
              ? `Collect ₹${item.total_amount} in Cash before marking completed!`
              : 'Mark this job as completed?'}
          </Text>
          <View style={styles.confirmRow}>
            <TouchableOpacity style={styles.confirmNo} onPress={onCancelConfirm}>
              <Text style={styles.confirmNoText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmYes} onPress={() => onConfirmComplete(item)}>
              <CheckCircle2 size={16} color="#FFF" />
              <Text style={styles.confirmYesText}>{item.payment_method === 'cod' ? 'Cash Collected' : 'Yes, Done!'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  jobCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  bookingNum: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' },
  serviceType: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '900' },
  customerBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 14, borderRadius: 16, marginBottom: 16 },
  customerMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#64748B' },
  customerName: { fontSize: 15, fontWeight: '700', color: '#334155' },
  customerPhone: { fontSize: 12, color: '#94A3B8' },
  contactActions: { flexDirection: 'row', gap: 8 },
  contactBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  infoGrid: { gap: 10 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoItemsRow: { flexDirection: 'row', gap: 15, flexWrap: 'wrap' },
  infoSubItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#64748B' },
  mainBtn: { marginTop: 20, height: 52, backgroundColor: PRIMARY, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: PRIMARY, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  mainBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  confirmBox: { marginTop: 16, backgroundColor: '#FFF7ED', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#FED7AA' },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 12, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmNo: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  confirmNoText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  confirmYes: { flex: 2, height: 44, borderRadius: 12, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  confirmYesText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
});
