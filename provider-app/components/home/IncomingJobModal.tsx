import { Clock, MapPin, Zap } from 'lucide-react-native';
import React from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#1A3FFF';
const ONLINE_COLOR = '#059669';

interface IncomingJob {
  offerId: string;
  bookingId: string;
  service: string;
  address: string;
  distance: string;
  estimatedPrice: number;
  customerName: string;
  scheduledDate: string;
  timeSlot: string;
}

interface IncomingJobModalProps {
  incomingJob: IncomingJob | null;
  countdown: number;
  slideAnim: Animated.Value;
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
}

export default function IncomingJobModal({ incomingJob, countdown, slideAnim, onAccept, onReject }: IncomingJobModalProps) {
  return (
    <Modal visible={!!incomingJob} transparent animationType="fade">
      {incomingJob && (
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.jobSheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.jobHandle} />

          <View style={styles.countdownWrap}>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNum}>{countdown}</Text>
              <Text style={styles.countdownSub}>sec</Text>
            </View>
          </View>

          <Text style={styles.jobTitle}>Incoming Request! ⚡</Text>
          <Text style={styles.jobService}>{incomingJob?.service}</Text>

          <View style={styles.jobDetails}>
            <View style={styles.detailItem}>
              <MapPin size={14} color="#6B7280" />
              <Text style={styles.detailText} numberOfLines={1}>{incomingJob?.address}</Text>
            </View>
            <View style={styles.detailItem}>
              <Clock size={14} color="#6B7280" />
              <Text style={styles.detailText}>{incomingJob?.scheduledDate} • {incomingJob?.timeSlot}</Text>
            </View>
          </View>

          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>You will earn</Text>
            <Text style={styles.priceValue}>₹{incomingJob?.estimatedPrice}</Text>
            <Text style={styles.distanceText}>{incomingJob?.distance}</Text>
          </View>

          <View style={styles.jobButtons}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => incomingJob && onReject(incomingJob.offerId)}>
              <Text style={styles.rejectText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => incomingJob && onAccept(incomingJob.offerId)}>
              <Zap size={18} color="#FFF" />
              <Text style={styles.acceptText}>Accept Now</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.85)', justifyContent: 'flex-end' },
  jobSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 24, paddingBottom: 40 },
  jobHandle: { width: 40, height: 5, borderRadius: 10, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 20 },
  countdownWrap: { alignItems: 'center', marginBottom: 20 },
  countdownCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: PRIMARY, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  countdownNum: { fontSize: 28, fontWeight: '900', color: PRIMARY },
  countdownSub: { fontSize: 11, color: PRIMARY, fontWeight: '600' },
  jobTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', textAlign: 'center' },
  jobService: { fontSize: 16, color: PRIMARY, fontWeight: '700', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  jobDetails: { gap: 12, marginBottom: 24 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { fontSize: 14, color: '#64748B', flex: 1 },
  priceBox: { backgroundColor: '#F0FDFA', borderRadius: 24, padding: 20, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#CCFBF1' },
  priceLabel: { fontSize: 13, color: '#14B8A6', fontWeight: '600', textTransform: 'uppercase' },
  priceValue: { fontSize: 36, fontWeight: '900', color: '#0F766E', marginVertical: 4 },
  distanceText: { fontSize: 13, color: '#5EAD9D' },
  jobButtons: { flexDirection: 'row', gap: 12 },
  rejectBtn: { flex: 1, height: 56, borderRadius: 18, borderWidth: 2, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  rejectText: { fontSize: 16, fontWeight: '700', color: '#64748B' },
  acceptBtn: { flex: 2, height: 56, borderRadius: 18, backgroundColor: ONLINE_COLOR, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, shadowColor: ONLINE_COLOR, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8 },
  acceptText: { fontSize: 17, fontWeight: '800', color: '#FFF' },
});
