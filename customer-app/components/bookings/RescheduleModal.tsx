import { Calendar, CheckCircle2, Clock, XCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, ScrollView } from 'react-native';

const PRIMARY = '#1A3FFF';

const TIME_SLOTS = [
    { id: 'am', label: '8 AM – 12 PM', sub: 'Morning slot' },
    { id: 'pm', label: '12 PM – 4 PM', sub: 'Afternoon slot' },
    { id: 'eve', label: '4 PM – 8 PM', sub: 'Evening slot' },
];

const RESCHEDULE_REASONS = [
    "Plan changed",
    "Emergency at home",
    "Not available at the moment",
    "Found someone else but wanted to delay",
    "Other"
];

interface RescheduleModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (date: string, slot: string, reason: string) => Promise<void>;
    currentDate?: string;
    currentSlot?: string;
}

export default function RescheduleModal({
    visible, onClose, onConfirm, currentDate, currentSlot
}: RescheduleModalProps) {
    const [selectedDate, setSelectedDate] = useState<'Today' | 'Tomorrow'>('Today');
    const [selectedSlot, setSelectedSlot] = useState(TIME_SLOTS[0]);
    const [selectedReason, setSelectedReason] = useState(RESCHEDULE_REASONS[0]);
    const [submitting, setSubmitting] = useState(false);

    const handleConfirm = async () => {
        setSubmitting(true);
        try {
            const dateISO = selectedDate === 'Today'
                ? new Date().toISOString().split('T')[0]
                : new Date(Date.now() + 86400000).toISOString().split('T')[0];
            
            await onConfirm(dateISO, selectedSlot.label, selectedReason);
            onClose();
        } catch (error) {
            console.error('[RescheduleModal] Error:', error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Reschedule Booking</Text>
                        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                            <XCircle size={24} color="#9BA3AF" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                        <Text style={styles.modalSubtitle}>Select a new date and time for your service.</Text>

                        {/* Date Selector */}
                        <Text style={styles.sectionLabel}>Date</Text>
                        <View style={styles.dateRow}>
                            {['Today', 'Tomorrow'].map((d) => (
                                <TouchableOpacity
                                    key={d}
                                    style={[styles.dateChip, selectedDate === d && styles.dateChipActive]}
                                    onPress={() => setSelectedDate(d as any)}
                                >
                                    <Calendar size={14} color={selectedDate === d ? '#FFF' : '#6B7280'} />
                                    <Text style={[styles.dateChipText, selectedDate === d && styles.dateChipTextActive]}>
                                        {d}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Time Slots */}
                        <Text style={styles.sectionLabel}>Preferred Time</Text>
                        <View style={styles.slotsContainer}>
                            {TIME_SLOTS.map((slot) => {
                                const active = selectedSlot.id === slot.id;
                                return (
                                    <TouchableOpacity
                                        key={slot.id}
                                        style={[styles.slotRow, active && styles.slotRowActive]}
                                        onPress={() => setSelectedSlot(slot)}
                                        activeOpacity={0.8}
                                    >
                                        <Clock size={16} color={active ? PRIMARY : '#9CA3AF'} />
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={[styles.slotLabel, active && styles.slotLabelActive]}>
                                                {slot.label}
                                            </Text>
                                            <Text style={styles.slotSub}>{slot.sub}</Text>
                                        </View>
                                        {active && <CheckCircle2 size={18} color={PRIMARY} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Reason Selection */}
                        <Text style={styles.sectionLabel}>Reason</Text>
                        <View style={styles.reasonList}>
                            {RESCHEDULE_REASONS.map(r => (
                                <TouchableOpacity
                                    key={r}
                                    style={[styles.reasonChip, selectedReason === r && styles.reasonChipActive]}
                                    onPress={() => setSelectedReason(r)}
                                >
                                    <Text style={[styles.reasonChipText, selectedReason === r && styles.reasonChipTextActive]}>
                                        {r}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.warningBox}>
                            <Text style={styles.warningText}>
                                Note: Rescheduling confirmed bookings will re-assign the job to search for available providers.
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.confirmBtn, submitting && { opacity: 0.7 }]}
                            onPress={handleConfirm}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.confirmBtnText}>Confirm Reschedule</Text>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: 20,
        maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    dateRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    dateChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#F9FAFB',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        gap: 8,
    },
    dateChipActive: {
        backgroundColor: PRIMARY,
        borderColor: PRIMARY,
    },
    dateChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
    },
    dateChipTextActive: {
        color: '#FFF',
    },
    slotsContainer: {
        gap: 12,
        marginBottom: 24,
    },
    slotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        backgroundColor: '#F9FAFB',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
    },
    slotRowActive: {
        borderColor: PRIMARY,
        backgroundColor: `${PRIMARY}05`,
    },
    slotLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#374151',
    },
    slotLabelActive: {
        color: PRIMARY,
    },
    slotSub: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 1,
    },
    reasonList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 24,
    },
    reasonChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    reasonChipActive: {
        borderColor: PRIMARY,
        backgroundColor: `${PRIMARY}10`,
    },
    reasonChipText: {
        fontSize: 13,
        color: '#374151',
        fontWeight: '500',
    },
    reasonChipTextActive: {
        color: PRIMARY,
        fontWeight: '700',
    },
    warningBox: {
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FEF3C7',
        marginBottom: 24,
    },
    warningText: {
        fontSize: 12,
        color: '#92400E',
        fontWeight: '500',
        lineHeight: 18,
    },
    confirmBtn: {
        backgroundColor: PRIMARY,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    confirmBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
    },
});
