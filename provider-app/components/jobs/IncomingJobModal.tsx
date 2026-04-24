import React, { useEffect, useState, useRef } from 'react';
import { 
    Modal, 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    Animated, 
    Dimensions,
    ActivityIndicator,
    PanResponder,
} from 'react-native';
import { MapPin, IndianRupee, X, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PRIMARY = '#1A3FFF';
const SUCCESS = '#059669';

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
    const [containerWidth, setContainerWidth] = useState(0);
    
    const pulse = useRef(new Animated.Value(1)).current;
    const translateX = useRef(new Animated.Value(0)).current;
    
    const HANDLE_SIZE = 56;
    const PADDING = 4;
    const threshold = containerWidth ? (containerWidth - HANDLE_SIZE - PADDING * 2) * 0.85 : 150;

    // Use refs to avoid stale closures in PanResponder
    const stateRef = useRef({ loading, jobData, onAccept, threshold });
    
    useEffect(() => {
        stateRef.current = { loading, jobData, onAccept, threshold };
    }, [loading, jobData, onAccept, threshold]);

    const handleAcceptInternal = async () => {
        const { loading: isCurrentlyLoading, jobData: currentJobData, onAccept: currentOnAccept } = stateRef.current;
        if (isCurrentlyLoading || !currentJobData) return;
        
        setLoading(true);
        try {
            const bookingId = currentJobData.bookingId || currentJobData.id;
            await currentOnAccept(bookingId);
        } catch (e) {
            console.error('[IncomingJobModal] Accept failed:', e);
            setLoading(false);
            Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
            }).start();
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gestureState) => {
                if (stateRef.current.loading) return;
                const newX = Math.max(0, Math.min(gestureState.dx, stateRef.current.threshold + 20));
                translateX.setValue(newX);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (stateRef.current.loading) return;
                
                if (gestureState.dx >= stateRef.current.threshold) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Animated.timing(translateX, {
                        toValue: stateRef.current.threshold + 10,
                        duration: 150,
                        useNativeDriver: true,
                    }).start(() => {
                        handleAcceptInternal();
                    });
                } else {
                    Animated.spring(translateX, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 50,
                        friction: 8,
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        let timer: any;
        if (visible) {
            setCountdown(60);
            setLoading(false);
            translateX.setValue(0);
            
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
    }, [visible]);

    useEffect(() => {
        if (visible && countdown === 0) {
            onClose();
        }
    }, [visible, countdown, onClose]);

    if (!jobData) return null;

    const serviceName = jobData.service || jobData.serviceName || 'Service Request';
    const address = jobData.address || jobData.customer_address || 'Nearby Location';
    const amount = jobData.amount || jobData.estimatedPrice || '0';

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>
                <Animated.View style={[styles.content, { transform: [{ scale: pulse }] }]}>
                    <View style={styles.countdownContainer}>
                        <View style={styles.countdownCircle}>
                            <Text style={styles.countdownText}>{countdown}</Text>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={styles.closeBtn} 
                        onPress={onReject || onClose}
                        disabled={loading}
                    >
                        <X size={20} color="#94A3B8" />
                    </TouchableOpacity>

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

                    <View 
                        style={styles.swipeTrack}
                        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
                    >
                        <Animated.Text style={[
                            styles.swipeText, 
                            { 
                                opacity: translateX.interpolate({
                                    inputRange: [0, threshold / 2],
                                    outputRange: [1, 0],
                                    extrapolate: 'clamp'
                                })
                            }
                        ]}>
                            Slide to Accept
                        </Animated.Text>
                        
                        <Animated.View 
                            style={[
                                styles.swipeHandle,
                                { transform: [{ translateX }] }
                            ]}
                            {...panResponder.panHandlers}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                                <ChevronRight size={32} color="#FFF" />
                            )}
                        </Animated.View>
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
        paddingTop: 40,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.2,
        shadowRadius: 30,
        elevation: 15,
        position: 'relative'
    },
    closeBtn: {
        position: 'absolute',
        top: 20,
        right: 20,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center'
    },
    countdownContainer: {
        position: 'absolute',
        top: -40,
        alignSelf: 'center'
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
        marginBottom: 32,
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
    swipeTrack: {
        width: '100%',
        height: 64,
        backgroundColor: '#F1F5F9',
        borderRadius: 32,
        justifyContent: 'center',
        padding: 4,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        position: 'relative'
    },
    swipeHandle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: SUCCESS,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: SUCCESS,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    swipeText: {
        position: 'absolute',
        alignSelf: 'center',
        fontSize: 16,
        fontWeight: '800',
        color: '#94A3B8',
    }
});
