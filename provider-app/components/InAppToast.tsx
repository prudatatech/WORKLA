import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet, TouchableOpacity, Platform } from 'react-native';

interface ToastProps {
    visible: boolean;
    title: string;
    body: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
    onDismiss: () => void;
}

const COLORS: Record<string, { bg: string; border: string; title: string; icon: string }> = {
    info: { bg: '#EFF6FF', border: '#3B82F6', title: '#1D4ED8', icon: '🔔' },
    success: { bg: '#F0FDF4', border: '#22C55E', title: '#15803D', icon: '✅' },
    warning: { bg: '#FFFBEB', border: '#F59E0B', title: '#B45309', icon: '⚠️' },
    error: { bg: '#FEF2F2', border: '#EF4444', title: '#B91C1C', icon: '🚨' },
};

export default function InAppToast({ visible, title, body, type = 'info', duration = 4000, onDismiss }: ToastProps) {
    const translateY = useRef(new Animated.Value(-120)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onDismissRef = useRef(onDismiss);

    useEffect(() => {
        onDismissRef.current = onDismiss;
    }, [onDismiss]);

    const hideToast = (notifyParent = true) => {
        Animated.parallel([
            Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(({ finished }) => {
            if (finished && notifyParent) {
                onDismissRef.current();
            }
        });
    };

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
                Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();

            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                hideToast(true);
            }, duration);
        } else {
            // Parent turned visible to false or it's hiding. Just animate out, don't ping parent again.
            hideToast(false);
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [visible, duration, translateY, opacity, hideToast]);

    if (!visible && !title) return null;

    const color = COLORS[type] || COLORS.info;

    return (
        <Animated.View
            style={[
                styles.container,
                { backgroundColor: color.bg, borderLeftColor: color.border },
                { transform: [{ translateY }], opacity },
            ]}
        >
            <TouchableOpacity
                style={styles.inner}
                activeOpacity={0.8}
                onPress={() => hideToast(true)}
            >
                <Text style={styles.icon}>{color.icon}</Text>
                <View style={styles.textContainer}>
                    <Text style={[styles.title, { color: color.title }]} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text style={styles.body} numberOfLines={2}>
                        {body}
                    </Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 36,
        left: 16,
        right: 16,
        borderRadius: 16,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        zIndex: 9999,
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    icon: {
        fontSize: 22,
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    body: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
        fontWeight: '500',
        lineHeight: 16,
    },
});
