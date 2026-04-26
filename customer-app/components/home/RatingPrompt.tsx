import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PRIMARY } from '../../lib/ui-constants';

interface RatingPromptProps {
  booking: any;
  onClose: () => void;
}

export default function RatingPrompt({ booking, onClose }: RatingPromptProps) {
  const router = useRouter();

  if (!booking) return null;

  return (
    <View style={styles.ratingPrompt}>
      <View style={styles.ratingPromptLeft}>
        <View style={styles.ratingEmoji}>
          <Text style={{ fontSize: 20 }}>⭐</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ratingPromptTitle}>Rate your last service</Text>
          <Text style={styles.ratingPromptSub} numberOfLines={1}>
            How was {booking.service_name_snapshot} by {booking.provider_details?.business_name || 'Worker'}?
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.ratingPromptBtn}
        onPress={() => router.push(`/rate/${booking.id}` as any)}
      >
        <Text style={styles.ratingPromptBtnText}>Rate Now</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} style={styles.ratingDismiss}>
        <X size={14} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  ratingPrompt: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
  },
  ratingPromptLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingEmoji: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  ratingPromptTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  ratingPromptSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  ratingPromptBtn: { backgroundColor: PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  ratingPromptBtnText: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  ratingDismiss: { padding: 4, marginLeft: 8 },
});
