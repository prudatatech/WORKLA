import React, { useEffect, useState } from 'react';
import { 
    Modal, 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    Animated, 
    Dimensions,
    ActivityIndicator
} from 'react-native';
import { MapPin, IndianRupee, X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const PRIMARY = '#1A3FFF';

interface IncomingJobModalProps {
    visible: boolean;
    jobData: any;
    onClose: () => void;
    onAccept: (bookingId: string) => void;
}

export default function IncomingJobModal({ visible, jobData, onClose, onAccept }: IncomingJobModalProps) {
    const [loading, setLoading] = useState(false);
    const [progress] = useState(new Animated.Value(1));
    const [pulse] = useState(new Animated.Value(1));
    const TIMEOUT_MS = 60000; // 1 minute high-urgency window

    useEffect(() => {
        if (visible) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            // Pulse animation for urgency
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 1.1, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true })
                ])
            ).start();

            // Progress bar and auto-timeout
            Animated.timing(progress, {
                toValue: 0,
                duration: TIMEOUT_MS,
                useNativeDriver: false
            }).start(({ finished }) => {
                if (finished) onClose();
            });
        } else {
            progress.setValue(1);
            pulse.setValue(1);
        }
    }, [visible, onClose, progress, pulse]);

    const handleAccept = async () => {
        setLoading(true);
        try {
            // Find the job offer ID if not provided, or use bookingId to accept
            // Our backend uses /api/v1/job-offers/:id/accept
            // But if we only have bookingId, we might need a different endpoint 
            // OR find the offer ID. For now, let's assume we need to accept the offer.
            // Actually, we can just call onAccept which handles it in the parent
            onAccept(jobData.bookingId);
        } finally {
            setLoading(false);
        }
    };

    if (!jobData) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
        >
            <View style={styles.overlay}>
                <Animated.View style={[styles.content, { transform: [{ scale: pulse }] }]}>
                    <View style={styles.header}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>HIGH PRIORITY REQUEST</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.serviceName}>{jobData.serviceName || 'Service Request'}</Text>
                    
                    <View style={styles.infoRow}>
                        <MapPin size={16} color="#64748B" />
                        <Text style={styles.address} numberOfLines={2}>{jobData.address || 'Check map for location'}</Text>
                    </View>

                    <View style={styles.footer}>
                        <View style={styles.priceContainer}>
                            <Text style={styles.priceLabel}>EARNING</Text>
                            <View style={styles.priceRow}>
                                <IndianRupee size={20} color="#1E293B" />
                                <Text style={styles.priceValue}>{jobData.amount || '0'}</Text>
                            </View>
                        </View>

                        <View style={styles.actions}>
                            <TouchableOpacity 
                                style={styles.rejectBtn} 
                                onPress={onClose}
                                disabled={loading}
                            >
                                <X size={24} color="#64748B" />
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={styles.acceptBtn} 
                                onPress={handleAccept}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <Check size={24} color="#FFF" />
                                        <Text style={styles.acceptText}>ACCEPT</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Progress bar for timeout */}
                    <Animated.View 
                        style={[
                            styles.progressBar, 
                            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }
                        ]} 
                    />
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        justifyContent: 'flex-end',
        padding: 16,
    },
    content: {
        backgroundColor: '#FFF',
        borderRadius: 24,
        padding: 24,
        paddingTop: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        overflow: 'hidden'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
    },
    badge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12
    },
    badgeText: {
        color: PRIMARY,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1
    },
    closeBtn: {
        padding: 4
    },
    serviceName: {
        fontSize: 24,
        fontWeight: '900',
        color: '#1E293B',
        marginBottom: 8
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24
    },
    address: {
        fontSize: 14,
        color: '#64748B',
        flex: 1
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    priceContainer: {
        gap: 4
    },
    priceLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 0.5
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    priceValue: {
        fontSize: 24,
        fontWeight: '900',
        color: '#1E293B'
    },
    actions: {
        flexDirection: 'row',
        gap: 12
    },
    rejectBtn: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center'
    },
    acceptBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 24,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#059669',
        shadowColor: '#059669',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 5
    },
    acceptText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '900'
    },
    progressBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: 6,
        backgroundColor: '#059669',
        opacity: 0.8
    }
});
