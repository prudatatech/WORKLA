import NetInfo from '@react-native-community/netinfo';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResilienceStore } from '../lib/resilienceStore';

export default function NetworkBanner() {
    const isRecovering = useResilienceStore(state => state.isRecovering);
    const [isConnected, setIsConnected] = useState<boolean | null>(true);
    const [visible, setVisible] = useState(false);
    const insets = useSafeAreaInsets();
    const slideAnim = useState(new Animated.Value(-100))[0];
    const rotateAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsConnected(state.isConnected);
            if (state.isConnected === false) {
                showBanner();
            } else if (state.isConnected === true && !isRecovering && visible) {
                hideBanner();
            }
        });

        return () => unsubscribe();
    }, [visible, isRecovering]);

    useEffect(() => {
        if (isRecovering) {
            showBanner();
            // Start rotation
            Animated.loop(
                Animated.timing(rotateAnim, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();
        } else if (isConnected !== false && visible) {
            hideBanner();
        }
    }, [isRecovering, isConnected]);

    const showBanner = () => {
        setVisible(true);
        Animated.spring(slideAnim, {
            toValue: insets.top,
            useNativeDriver: true,
            tension: 40,
            friction: 7,
        }).start();
    };

    const hideBanner = () => {
        Animated.timing(slideAnim, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
        }).start(() => setVisible(false));
    };

    if (!visible && isConnected !== false && !isRecovering) return null;

    const spin = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    return (
        <Animated.View style={[
            styles.banner, 
            { transform: [{ translateY: slideAnim }] },
            isRecovering ? styles.recovering : styles.offline
        ]}>
            <View style={styles.content}>
                {isRecovering ? (
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                        <RefreshCw size={16} color="#B45309" />
                    </Animated.View>
                ) : (
                    <WifiOff size={16} color="#FFF" />
                )}
                <Text style={[styles.text, isRecovering && { color: '#B45309' }]}>
                    {isRecovering 
                        ? 'System over capacity. Recovering...' 
                        : 'No internet connection. Using offline mode.'}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 9999,
        borderRadius: 14,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
        borderWidth: 1,
    },
    offline: {
        backgroundColor: '#374151',
        borderColor: '#4B5563',
    },
    recovering: {
        backgroundColor: '#FEF3C7',
        borderColor: '#FDE68A',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    text: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '700',
    },
});
