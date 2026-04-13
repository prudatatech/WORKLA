import { XCircle } from 'lucide-react-native';
import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const REASONS = [
  "Change of plans",
  "Found another worker",
  "Worker is taking too long",
  "Booked by mistake",
  "Other"
];

interface CancelModalProps {
  visible: boolean;
  bookingId: string | null;
  cancelReason: string;
  customReason: string;
  cancelling: boolean;
  onClose: () => void;
  onSelectReason: (reason: string) => void;
  onCustomReasonChange: (text: string) => void;
  onConfirm: () => void;
}

export default function CancelModal({
  visible, bookingId, cancelReason, customReason, cancelling,
  onClose, onSelectReason, onCustomReasonChange, onConfirm
}: CancelModalProps) {
  const [quote, setQuote] = React.useState<{ penalty: number; reason: string; grace_remaining_seconds?: number } | null>(null);
  const [loadingQuote, setLoadingQuote] = React.useState(false);

  React.useEffect(() => {
    if (visible && bookingId) {
      fetchQuote();
    } else {
      setQuote(null);
    }
  }, [visible, bookingId]);

  const fetchQuote = async () => {
    setLoadingQuote(true);
    try {
      const { api } = require('../../lib/api');
      const res = await api.get(`/api/v1/bookings/${bookingId}/cancellation-quote`);
      if (res.data) {
        setQuote(res.data);
      }
    } catch (e) {
      console.error('Failed to fetch cancel quote', e);
    } finally {
      setLoadingQuote(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cancel Service</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <XCircle size={24} color="#90A4AE" />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>Please let us know why you are cancelling.</Text>

          <View style={styles.reasonList}>
            {REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonChip, cancelReason === r && styles.reasonChipActive]}
                onPress={() => onSelectReason(r)}
              >
                <Text style={[styles.reasonChipText, cancelReason === r && styles.reasonChipTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {cancelReason === 'Other' && (
            <TextInput
              style={styles.customReasonInput}
              placeholder="Tell us more..."
              value={customReason}
              onChangeText={onCustomReasonChange}
              multiline
            />
          )}

          {/* Penalty Info */}
          <View style={styles.penaltyInfo}>
            {loadingQuote ? (
              <Text style={styles.penaltyLoading}>Calculating fee...</Text>
            ) : quote ? (
              <View style={[styles.penaltyBadge, quote.penalty === 0 && styles.penaltyFree]}>
                <Text style={[styles.penaltyText, quote.penalty === 0 && { color: '#059669' }]}>
                  {quote.penalty === 0 ? 'FREE CANCELLATION' : `PENALTY: ₹${quote.penalty}`}
                </Text>
                <Text style={styles.penaltySubText}>{quote.reason}</Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.confirmCancelBtn, (!cancelReason || cancelling) && { opacity: 0.5 }]}
            disabled={!cancelReason || cancelling}
            onPress={onConfirm}
          >
            <Text style={styles.confirmCancelBtnText}>
              {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 100 },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  modalSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  reasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  reasonChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  reasonChipActive: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  reasonChipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  reasonChipTextActive: { color: '#EF4444', fontWeight: '700' },
  customReasonInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  confirmCancelBtn: { backgroundColor: '#EF4444', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  confirmCancelBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  penaltyInfo: { marginBottom: 20 },
  penaltyBadge: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FEE2E2' },
  penaltyFree: { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' },
  penaltyText: { fontSize: 15, fontWeight: '900', color: '#B91C1C', marginBottom: 2 },
  penaltySubText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  penaltyLoading: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center' }
});
