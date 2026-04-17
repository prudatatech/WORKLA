import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { CheckCircle2, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';



interface VerificationSuccessModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function VerificationSuccessModal({ visible, onClose }: VerificationSuccessModalProps) {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true
                }),
                Animated.loop(
                    Animated.timing(rotateAnim, {
                        toValue: 1,
                        duration: 3000,
                        useNativeDriver: true
                    }),
                    { iterations: -1 }
                )
            ]).start();
        } else {
            scaleAnim.setValue(0);
            opacityAnim.setValue(0);
            rotateAnim.setValue(0);
        }
    }, [visible, opacityAnim, rotateAnim, scaleAnim]);

    const spin = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Animated.View style={[
                    styles.modalContainer,
                    { 
                        opacity: opacityAnim,
                        transform: [{ scale: scaleAnim }]
                    }
                ]}>
                    <View style={styles.iconBackground}>
                        <Animated.View style={{ transform: [{ rotate: spin }] }}>
                            <Zap size={60} color="#FFD700" fill="#FFD700" style={styles.bgZap} />
                        </Animated.View>
                        <View style={styles.checkWrapper}>
                            <CheckCircle2 size={70} color="#10B981" />
                        </View>
                    </View>

                    <Text style={styles.title}>You&apos;re Verified! 🎉</Text>
                    <Text style={styles.subtitle}>
                        Congratulations! Your account has been approved by our team. You are now authorized to start accepting jobs and earning with Workla.
                    </Text>

                    <View style={styles.perksContainer}>
                        <View style={styles.perkRow}>
                            <Zap size={18} color="#10B981" />
                            <Text style={styles.perkText}>Go online anytime</Text>
                        </View>
                        <View style={styles.perkRow}>
                            <Zap size={18} color="#10B981" />
                            <Text style={styles.perkText}>Receive high-priority job offers</Text>
                        </View>
                        <View style={styles.perkRow}>
                            <Zap size={18} color="#10B981" />
                            <Text style={styles.perkText}>Instant payouts enabled</Text>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={styles.button} 
                        onPress={onClose}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>Let&apos;s Get Started</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    modalContainer: {
        width: '100%',
        backgroundColor: '#FFF',
        borderRadius: 32,
        padding: 32,
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20
    },
    iconBackground: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#ECFDF5',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        position: 'relative'
    },
    bgZap: {
        position: 'absolute',
        opacity: 0.2
    },
    checkWrapper: {
        position: 'absolute'
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#111',
        marginBottom: 12,
        textAlign: 'center'
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 24
    },
    perksContainer: {
        width: '100%',
        backgroundColor: '#F8F9FA',
        borderRadius: 20,
        padding: 20,
        marginBottom: 32
    },
    perkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10
    },
    perkText: {
        fontSize: 14,
        color: '#444',
        fontWeight: '600'
    },
    button: {
        width: '100%',
        height: 60,
        backgroundColor: '#10B981',
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8
    },
    buttonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold'
    }
});
