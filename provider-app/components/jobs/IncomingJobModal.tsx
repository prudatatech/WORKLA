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

interface IncomingJob {
    offerId: string;
    bookingId: string;
    service: string;
    address: string;
    amount: number;
    customerName?: string;
}

interface IncomingJobModalProps {
    visible: boolean;
    jobData: any;
    onClose: () => void;
    onAccept: (bookingId: string) => void;
    onReject?: () => void;
}

export default function IncomingJobModal({ visible, jobData, onClose, onAccept, onReject }: IncomingJobModalProps) {
    const [loading, setLoading] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const [pulse] = useState(new Animated.Value(1));
    const TIMEOUT_MS = 60000;

    useEffect(() => {
        let timer: any;
        if (visible) {
            setCountdown(60);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            // Pulse animation for urgency
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 1.05, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true })
                ])
            ).start();

            timer = setInterval(() => {
                setCountdown(prev => Math.max(0, prev - 1));
            }, 1000);
        } else {
            pulse.setValue(1);
        }
        return () => clearInterval(timer);
    }, [visible, pulse]);

    useEffect(() => {
        if (visible && countdown === 0) {
            onClose();
        }
    }, [visible, countdown, onClose]);

    const handleAccept = async () => {
        setLoading(true);
        try {
            onAccept(jobData.bookingId || jobData.id);
        } finally {
            setLoading(false);
        }
    };

    if (!jobData) return null;

    // Normalize data keys
    const serviceName = jobData.service || jobData.serviceName || 'Service Request';
    const address = jobData.address || jobData.customer_address || 'Nearby Location';
    const amount = jobData.amount || jobData.estimatedPrice || '0';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
        >
            <View style={styles.overlay}>
                <Animated.View style={[styles.content, { transform: [{ scale: pulse }] }]}>
                    <View style={styles.countdownContainer}>
                        <View style={styles.countdownCircle}>
                            <Text style={styles.countdownText}>{countdown}</Text>
                        </View>
                    </View>

                    <View style={styles.header}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>NEW JOB REQUEST</Text>
                        </View>
                    </View>

                    <Text style={styles.serviceName}>{serviceName}</Text>
                    
                    <View style={styles.infoRow}>
                        <MapPin size={16} color="#64748B" />
                        <Text style={styles.address} numberOfLines={2}>{address}</Text>
                    </View>

                    <View style={styles.priceContainer}>
                        <Text style={styles.priceLabel}>ESTIMATED EARNING</Text>
                        <View style={styles.priceRow}>
                            <IndianRupee size={24} color="#059669" />
                            <Text style={styles.priceValue}>{amount}</Text>
                        </View>
                    </View>

                    <View style={styles.actions}>
                        <TouchableOpacity 
                            style={styles.rejectBtn} 
                            onPress={onReject || onClose}
                            disabled={loading}
                        >
                            <Text style={styles.rejectText}>Decline</Text>
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
                                    <Check size={20} color="#FFF" />
                                    <Text style={styles.acceptText}>ACCEPT JOB</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        justifyContent: 'center',
        padding: 20,
    },
    content: {
        backgroundColor: '#FFF',
        borderRadius: 32,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.2,
        shadowRadius: 30,
        elevation: 15,
    },
    countdownContainer: {
        marginTop: -60,
        marginBottom: 20,
    },
    countdownCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: PRIMARY,
        borderWidth: 6,
        borderColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
    },
    countdownText: {
        color: '#FFF',
        fontSize: 28,
        fontWeight: '900',
    },
    header: {
        marginBottom: 12
    },
    badge: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20
    },
    badgeText: {
        color: '#64748B',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.5
    },
    serviceName: {
        fontSize: 26,
        fontWeight: '900',
        color: '#1E293B',
        textAlign: 'center',
        marginBottom: 8
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
        paddingHorizontal: 10
    },
    address: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center'
    },
    priceContainer: {
        backgroundColor: '#F0FDFA',
        width: '100%',
        padding: 20,
        borderRadius: 24,
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#CCFBF1'
    },
    priceLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#14B8A6',
        letterSpacing: 1,
        marginBottom: 4
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    priceValue: {
        fontSize: 32,
        fontWeight: '900',
        color: '#0F766E'
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    },
    rejectBtn: {
        flex: 1,
        height: 60,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#F1F5F9',
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center'
    },
    rejectText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#94A3B8'
    },
    acceptBtn: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'center',
        height: 60,
        borderRadius: 16,
        backgroundColor: '#059669',
        shadowColor: '#059669',
        shadowOpacity: 0.4,
        shadowRadius: 15,
        elevation: 10
    },
    acceptText: {
        color: '#FFF',
        fontSize: 17,
        fontWeight: '900'
    }
});
