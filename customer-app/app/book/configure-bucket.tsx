/**
 * configure-bucket.tsx
 * Multi-service configure & checkout screen.
 * Each bucket item gets its own scheduling card.
 * Max 3 items. Dispatches all in parallel via batch API.
 */
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Calendar, Check, ChevronRight,
  Clock, CreditCard, IndianRupee, MapPin, Trash2, Zap
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBucketStore, BucketItem } from '../../lib/bucketStore';
import { useAddressStore } from '../../lib/addressStore';
import { api } from '../../lib/api';

const PRIMARY = '#1A3FFF';
const TIME_SLOTS = ['8 AM – 12 PM', '12 PM – 4 PM', '4 PM – 8 PM'];
const STATUS_COLORS: Record<string, string> = {
  '0': '#6366F1',
  '1': '#0EA5E9',
  '2': '#10B981',
};

export default function ConfigureBucketScreen() {
  const router = useRouter();
  const { items, updateItem, removeItem, clearBucket } = useBucketStore();
  const { selectedAddress } = useAddressStore();
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null);

  React.useEffect(() => {
    if (items.length === 0) {
      router.replace('/(tabs)/' as any);
    }
  }, [items.length, router]);

  if (items.length === 0) {
    return null;
  }

  const grandTotal = items.reduce((s, i) => s + i.totalAmount, 0);

  const handleBook = async () => {
    if (!selectedAddress) {
      Alert.alert('Address Required', 'Please select a service address first.');
      return;
    }
    setSubmitting(true);
    try {
      const scheduledDateISO = (date: string) =>
        date === 'Today'
          ? new Date().toISOString().split('T')[0]
          : new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const payload = {
        items: items.map((item) => ({
          serviceId: item.serviceId,
          subcategoryId: item.subcategoryId,
          scheduledDate: scheduledDateISO(item.scheduledDate),
          scheduledTimeSlot: item.mode === 'now' ? 'Right Now' : item.scheduledSlot,
          customerLatitude: selectedAddress.latitude,
          customerLongitude: selectedAddress.longitude,
          customerAddress: selectedAddress.address,
          specialInstructions: item.specialInstructions || null,
          paymentMethod: item.paymentMethod,
          totalAmount: item.totalAmount,
          catalogPrice: item.basePrice,
          platformFee: item.platformFee,
          taxAmount: item.taxAmount,
          frequency: 'one_time',
          serviceNameSnapshot: item.serviceName,
          couponId: null,
          couponDiscount: 0,
        })),
      };

      const res = await api.post('/api/v1/bookings/batch', payload);

      // 🗺️ Area not served — guide user to change address
      if ((res as any)?.error === 'AREA_NOT_SERVED') {
        Alert.alert(
          '📍 Area Not Covered',
          'We don\'t serve this location yet. Please select a different address.',
          [{ text: 'Change Address', onPress: () => router.push('/addresses?selectable=true' as any) }, { text: 'Cancel', style: 'cancel' }]
        );
        return;
      }

      if (res.error || !res.data) throw new Error(res.error || 'Booking failed');

      clearBucket();

      const { batchId, bookingIds, failed } = res.data;

      // ⚠️ Partial failure notice — some services found providers, some didn't
      if (failed > 0 && bookingIds.length > 0) {
        Alert.alert(
          '⚠️ Partial Booking',
          `${bookingIds.length} service${bookingIds.length > 1 ? 's' : ''} booked successfully. ${failed} couldn't find a provider right now and has been cancelled.`,
          [{ text: 'View Details', style: 'default' }]
        );
      }

      if (bookingIds.length === 1) {
        router.replace(`/track/${bookingIds[0]}` as any);
      } else {
        router.replace(`/track/batch/${batchId}` as any);
      }
    } catch (err: any) {
      Alert.alert('Something went wrong', err.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Bucket</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Address row */}
        <TouchableOpacity
          style={styles.addressRow}
          onPress={() => router.push('/addresses?selectable=true')}
        >
          <MapPin size={16} color={selectedAddress ? PRIMARY : '#9CA3AF'} />
          <View style={{ flex: 1 }}>
            {selectedAddress ? (
              <>
                <Text style={styles.addressName}>{selectedAddress.name}</Text>
                <Text style={styles.addressSub} numberOfLines={1}>{selectedAddress.address}</Text>
              </>
            ) : (
              <Text style={styles.addressPlaceholder}>Select service address</Text>
            )}
          </View>
          <ChevronRight size={16} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Service cards */}
        {items.map((item, idx) => (
          <ServiceCard
            key={item.id}
            item={item}
            index={idx}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onUpdate={(patch) => updateItem(item.id, patch)}
            onRemove={() => {
              removeItem(item.id);
              if (expandedId === item.id) setExpandedId(items.find(i => i.id !== item.id)?.id ?? null);
            }}
          />
        ))}

        {/* Add more (if < 3) */}
        {items.length < 3 && (
          <TouchableOpacity style={styles.addMoreBtn} onPress={() => router.back()}>
            <Text style={styles.addMoreText}>+ Add Another Service</Text>
          </TouchableOpacity>
        )}

        {/* Total summary */}
        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Estimate</Text>
            <Text style={styles.totalVal}>₹{Math.round(grandTotal)}</Text>
          </View>
          <Text style={styles.totalNote}>{items.length} service{items.length > 1 ? 's' : ''} · Individual billing</Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Book CTA */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={[styles.cta, submitting && { opacity: 0.7 }]}
          onPress={handleBook}
          disabled={submitting}
          activeOpacity={0.88}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Zap size={18} color="#FFF" fill="#FFF" />
              <Text style={styles.ctaText}>Book {items.length} Service{items.length > 1 ? 's' : ''} · ₹{Math.round(grandTotal)}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Service Card ──────────────────────────────────────────────────────────────
function ServiceCard({
  item, index, expanded, onToggle, onUpdate, onRemove,
}: {
  item: BucketItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<BucketItem>) => void;
  onRemove: () => void;
}) {
  const accentColor = STATUS_COLORS[String(index)] ?? PRIMARY;

  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      {/* Card Header */}
      <TouchableOpacity style={styles.cardHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[styles.cardIndex, { backgroundColor: accentColor }]}>
          <Text style={styles.cardIndexText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardService}>{item.serviceName}</Text>
          <Text style={styles.cardTask}>{item.subcategoryName} · ₹{Math.round(item.totalAmount)}</Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Trash2 size={16} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeChip, item.mode === 'now' && { backgroundColor: accentColor }]}
              onPress={() => onUpdate({ mode: 'now' })}
            >
              <Zap size={13} color={item.mode === 'now' ? '#FFF' : '#6B7280'} />
              <Text style={[styles.modeText, item.mode === 'now' && { color: '#FFF' }]}>Right Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeChip, item.mode === 'scheduled' && { backgroundColor: accentColor }]}
              onPress={() => onUpdate({ mode: 'scheduled' })}
            >
              <Calendar size={13} color={item.mode === 'scheduled' ? '#FFF' : '#6B7280'} />
              <Text style={[styles.modeText, item.mode === 'scheduled' && { color: '#FFF' }]}>Schedule</Text>
            </TouchableOpacity>
          </View>

          {item.mode === 'scheduled' && (
            <>
              {/* Date */}
              <View style={styles.chipRow}>
                {['Today', 'Tomorrow'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, item.scheduledDate === d && { backgroundColor: accentColor, borderColor: accentColor }]}
                    onPress={() => onUpdate({ scheduledDate: d })}
                  >
                    <Text style={[styles.chipText, item.scheduledDate === d && { color: '#FFF' }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Slot */}
              <View style={styles.chipRow}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.chip, item.scheduledSlot === slot && { backgroundColor: accentColor, borderColor: accentColor }]}
                    onPress={() => onUpdate({ scheduledSlot: slot })}
                  >
                    <Clock size={11} color={item.scheduledSlot === slot ? '#FFF' : '#6B7280'} />
                    <Text style={[styles.chipText, item.scheduledSlot === slot && { color: '#FFF' }]}>{slot}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Payment */}
          <View style={styles.payRow}>
            {[
              { id: 'cod', label: 'Pay After', Icon: IndianRupee },
              { id: 'online', label: 'Pay Now', Icon: CreditCard },
            ].map(({ id, label, Icon }) => (
              <TouchableOpacity
                key={id}
                style={[styles.payChip, item.paymentMethod === id && { backgroundColor: accentColor, borderColor: accentColor }]}
                onPress={() => onUpdate({ paymentMethod: id as 'cod' | 'online' })}
              >
                <Icon size={13} color={item.paymentMethod === id ? '#FFF' : '#6B7280'} />
                <Text style={[styles.modeText, item.paymentMethod === id && { color: '#FFF' }]}>{label}</Text>
                {item.paymentMethod === id && <Check size={11} color="#FFF" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  scroll: { padding: 16, gap: 12 },

  // Address
  addressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 2,
  },
  addressName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  addressSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  addressPlaceholder: { fontSize: 13, color: '#9CA3AF' },

  // Card
  card: {
    backgroundColor: '#FFF', borderRadius: 18, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  cardIndex: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cardIndexText: { fontSize: 14, fontWeight: '900', color: '#FFF' },
  cardService: { fontSize: 15, fontWeight: '800', color: '#111827' },
  cardTask: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },

  // Mode
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  modeText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  // Payment
  payRow: { flexDirection: 'row', gap: 8 },
  payChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },

  // Add more
  addMoreBtn: {
    borderRadius: 16, borderWidth: 1.5, borderColor: PRIMARY, borderStyle: 'dashed',
    padding: 16, alignItems: 'center',
  },
  addMoreText: { fontSize: 14, fontWeight: '700', color: PRIMARY },

  // Total
  totalCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  totalVal: { fontSize: 22, fontWeight: '900', color: PRIMARY },
  totalNote: { fontSize: 12, color: '#9CA3AF' },

  // CTA
  ctaContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 28, backgroundColor: '#FFF',
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: -4 }, shadowRadius: 12, elevation: 8,
  },
  cta: {
    backgroundColor: PRIMARY, borderRadius: 18, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
  },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
