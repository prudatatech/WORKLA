/**
 * SkeletonLoader.tsx
 * Reusable shimmer skeleton component for loading states.
 * Usage: <SkeletonLoader width={200} height={20} borderRadius={8} />
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

interface Props {
    width: number | `${number}%`;
    height: number;
    borderRadius?: number;
    style?: ViewStyle;
}

export function SkeletonLoader({ width, height, borderRadius = 8, style }: Props) {
    const shimmer = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
            ])
        ).start();
    }, [shimmer]);

    const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

    return (
        <Animated.View
            style={[{ width: width as any, height, borderRadius, backgroundColor: '#D1D5DB', opacity }, style]}
        />
    );
}

/** Pre-built skeleton card matching a booking card */
export function BookingCardSkeleton() {
    return (
        <View style={sk.bookingCard}>
            <View style={sk.cardTop}>
                <SkeletonLoader width={120} height={14} borderRadius={6} />
                <SkeletonLoader width={80} height={22} borderRadius={10} />
            </View>
            <SkeletonLoader width={160} height={18} borderRadius={6} style={{ marginTop: 10 }} />
            <SkeletonLoader width="90%" height={13} borderRadius={6} style={{ marginTop: 8 }} />
            <View style={sk.cardActions}>
                <SkeletonLoader width={100} height={36} borderRadius={10} />
                <SkeletonLoader width={100} height={36} borderRadius={10} />
            </View>
        </View>
    );
}

/** Pre-built skeleton matching a home service grid item */
export function ServiceGridSkeleton() {
    return (
        <View style={sk.gridItem}>
            <SkeletonLoader width={52} height={52} borderRadius={26} />
            <SkeletonLoader width={52} height={11} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
    );
}

/** Pre-built skeleton matching a home list row */
export function ListRowSkeleton() {
    return (
        <View style={sk.listRow}>
            <SkeletonLoader width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, gap: 6 }}>
                <SkeletonLoader width={140} height={14} borderRadius={5} />
                <SkeletonLoader width={200} height={11} borderRadius={4} />
            </View>
            <SkeletonLoader width={32} height={32} borderRadius={16} />
        </View>
    );
}

const sk = StyleSheet.create({
    bookingCard: {
        backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10,
        borderWidth: 1, borderColor: '#F3F4F6',
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    gridItem: { alignItems: 'center', padding: 6, width: 80 },
    listRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8,
        borderWidth: 1, borderColor: '#F3F4F6',
    },
    // Added for Address/Notif consistency
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10,
        borderWidth: 1, borderColor: '#F3F4F6',
    },
    notifBody: { flex: 1, gap: 5 },
    serviceHero: { height: 320, backgroundColor: '#F3F4F6', marginBottom: 20 },
    heroOverlay: { position: 'absolute', top: 40, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
});

/** Pre-built skeleton for address rows */
export function AddressRowSkeleton() {
    return (
        <View style={sk.row}>
            <SkeletonLoader width={42} height={42} borderRadius={21} />
            <View style={{ flex: 1, gap: 6 }}>
                <SkeletonLoader width={100} height={14} borderRadius={5} />
                <SkeletonLoader width="90%" height={12} borderRadius={4} />
            </View>
            <View style={{ gap: 8 }}>
                <SkeletonLoader width={28} height={28} borderRadius={14} />
            </View>
        </View>
    );
}

/** Pre-built skeleton for notification rows */
export function NotificationRowSkeleton() {
    return (
        <View style={sk.row}>
            <SkeletonLoader width={44} height={44} borderRadius={22} />
            <View style={sk.notifBody}>
                <SkeletonLoader width={120} height={14} borderRadius={5} />
                <SkeletonLoader width="95%" height={12} borderRadius={4} />
                <SkeletonLoader width={60} height={10} borderRadius={4} style={{ marginTop: 2 }} />
            </View>
        </View>
    );
}

/** Pre-built skeleton for service details page */
export function ServiceDetailSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: '#FFF' }}>
            <View style={sk.serviceHero}>
                <View style={sk.heroOverlay}>
                    <SkeletonLoader width={40} height={40} borderRadius={20} />
                    <SkeletonLoader width={40} height={40} borderRadius={20} />
                </View>
            </View>
            <View style={{ padding: 20 }}>
                <SkeletonLoader width={140} height={18} borderRadius={6} />
                <SkeletonLoader width="70%" height={28} borderRadius={8} style={{ marginTop: 10 }} />
                <View style={{ flexDirection: 'row', gap: 15, marginTop: 15 }}>
                    <SkeletonLoader width={80} height={14} borderRadius={5} />
                    <SkeletonLoader width={80} height={14} borderRadius={5} />
                </View>
                <SkeletonLoader width={100} height={32} borderRadius={8} style={{ marginTop: 20 }} />
                <SkeletonLoader width="100%" height={80} borderRadius={16} style={{ marginTop: 20 }} />
            </View>
        </View>
    );
}
