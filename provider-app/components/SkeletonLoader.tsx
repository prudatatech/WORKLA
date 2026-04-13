/**
 * SkeletonLoader.tsx — Provider App
 * Reusable shimmer skeleton components for loading states.
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

/** Skeleton matching a JobCard */
export function JobCardSkeleton() {
    return (
        <View style={sk.jobCard}>
            <View style={sk.cardTop}>
                <SkeletonLoader width={140} height={16} borderRadius={6} />
                <SkeletonLoader width={80} height={24} borderRadius={12} />
            </View>
            <SkeletonLoader width="80%" height={13} borderRadius={5} style={{ marginTop: 10 }} />
            <SkeletonLoader width="60%" height={13} borderRadius={5} style={{ marginTop: 6 }} />
            <View style={sk.cardActions}>
                <SkeletonLoader width={110} height={38} borderRadius={12} />
                <SkeletonLoader width={110} height={38} borderRadius={12} />
            </View>
        </View>
    );
}

/** Skeleton for a stat card (2-per-row) */
export function StatCardSkeleton() {
    return (
        <View style={sk.statCard}>
            <SkeletonLoader width={32} height={32} borderRadius={16} />
            <SkeletonLoader width={60} height={20} borderRadius={6} style={{ marginTop: 10 }} />
            <SkeletonLoader width={80} height={10} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
    );
}

/** Skeleton for an earnings transaction row */
export function EarningRowSkeleton() {
    return (
        <View style={sk.earningRow}>
            <SkeletonLoader width={36} height={36} borderRadius={18} />
            <View style={{ flex: 1, gap: 5 }}>
                <SkeletonLoader width={140} height={14} borderRadius={5} />
                <SkeletonLoader width={100} height={11} borderRadius={4} />
            </View>
            <SkeletonLoader width={60} height={16} borderRadius={6} />
        </View>
    );
}

/** Skeleton for insights scorecard */
export function InsightsScorecardSkeleton() {
    return (
        <View style={sk.scorecard}>
            <View style={sk.scoreRow}>
                <View style={sk.scoreBox}>
                    <SkeletonLoader width={50} height={10} borderRadius={4} />
                    <SkeletonLoader width={40} height={22} borderRadius={6} style={{ marginTop: 6 }} />
                </View>
                <View style={sk.scoreDivider} />
                <View style={sk.scoreBox}>
                    <SkeletonLoader width={60} height={10} borderRadius={4} />
                    <SkeletonLoader width={40} height={22} borderRadius={6} style={{ marginTop: 6 }} />
                </View>
                <View style={sk.scoreDivider} />
                <View style={sk.scoreBox}>
                    <SkeletonLoader width={40} height={10} borderRadius={4} />
                    <SkeletonLoader width={30} height={22} borderRadius={6} style={{ marginTop: 6 }} />
                </View>
            </View>
        </View>
    );
}

/** Skeleton for insights metric card */
export function MetricCardSkeleton() {
    return (
        <View style={sk.metricCard}>
            <SkeletonLoader width={40} height={40} borderRadius={12} />
            <SkeletonLoader width={80} height={12} borderRadius={4} style={{ marginTop: 12 }} />
            <SkeletonLoader width={50} height={16} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
    );
}

/** Skeleton for wallet banner */
export function WalletBannerSkeleton() {
    return (
        <View style={sk.walletBanner}>
            <View style={{ flex: 1.2, gap: 8 }}>
                <SkeletonLoader width={100} height={12} borderRadius={4} />
                <SkeletonLoader width={80} height={28} borderRadius={8} />
                <SkeletonLoader width={70} height={32} borderRadius={12} />
            </View>
            <View style={sk.walletDivider} />
            <View style={{ flex: 0.8, gap: 6 }}>
                <SkeletonLoader width={80} height={11} borderRadius={4} />
                <SkeletonLoader width={50} height={18} borderRadius={6} />
            </View>
        </View>
    );
}

/** Skeleton for schedule/availability slots */
export function ScheduleSkeleton() {
    return (
        <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <SkeletonLoader width={140} height={20} borderRadius={6} />
                <SkeletonLoader width={60} height={20} borderRadius={6} />
            </View>
            {[1, 2, 3, 4].map(i => (
                <View key={i} style={sk.scheduleRow}>
                    <SkeletonLoader width={80} height={14} borderRadius={5} />
                    <SkeletonLoader width={120} height={44} borderRadius={12} />
                    <SkeletonLoader width={40} height={24} borderRadius={12} />
                </View>
            ))}
        </View>
    );
}

const sk = StyleSheet.create({
    jobCard: {
        backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 12,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    statCard: {
        width: '48%', backgroundColor: '#F8FAFC', borderRadius: 20, padding: 16,
        alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9',
    },
    earningRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    scorecard: {
        backgroundColor: '#E0E7FF', borderRadius: 24, padding: 24, marginBottom: 24,
    },
    scoreRow: { flexDirection: 'row', alignItems: 'center' },
    scoreBox: { flex: 1, alignItems: 'center' },
    scoreDivider: { width: 1, height: 40, backgroundColor: 'rgba(0,0,0,0.05)' },
    metricCard: {
        flex: 1, backgroundColor: '#FFF', borderRadius: 24, padding: 16,
        borderWidth: 1, borderColor: '#F3F4F6',
    },
    walletBanner: {
        flexDirection: 'row', margin: 16, backgroundColor: '#1E293B', borderRadius: 24,
        padding: 20, alignItems: 'center',
    },
    walletDivider: { width: 1, height: '80%', backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 20 },
    scheduleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, backgroundColor: '#FFF', borderRadius: 16,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
});
