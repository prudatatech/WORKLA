import {
    ArrowUpRight,
    Award,
    ChevronRight,
    Clock,
    Star,
    TrendingUp,
    Zap
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {
    LineChart
} from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InsightsScorecardSkeleton, MetricCardSkeleton, SkeletonLoader } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';

const InsightsEmptyImg = require('../../assets/images/search-empty.png');

const { width } = Dimensions.get('window');
const PRIMARY = '#1A3FFF';

export default function InsightsScreen() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [chartData, setChartData] = useState<any>(null);
    const [earningsDetails, setEarningsDetails] = useState<any>(null);
    const [period, setPeriod] = useState<string>('weekly');
    const hasMountedRef = useRef(false);
    const fetchInsights = useCallback(async () => {
        setLoading(true);
        try {
            // 🕒 5-second safety timeout for session check
            const sessionPromise = supabase.auth.getSession();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth Timeout')), 5000));
            
            await Promise.race([sessionPromise, timeoutPromise]);
            
            console.log('[INSIGHTS DEBUG] Fetching analytics...');
            const [statsRes, earningsRes] = await Promise.all([
                api.get('/api/v1/providers/analytics'),
                api.get(`/api/v1/providers/analytics/earnings?period=${period}`)
            ]);

            if (statsRes.data) {
                setStats(statsRes.data);
                const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                setChartData({
                    labels,
                    datasets: [{
                        data: statsRes.data.weeklyData || [0, 0, 0, 0, 0, 0, 0]
                    }]
                });
            }

            if (earningsRes.data) {
                setEarningsDetails(earningsRes.data);
            }
        } catch (e: any) {
            console.error('[INSIGHTS ERROR]:', e.message || e);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);

    // Silent refresh when tab is re-focused
    useFocusEffect(
        useCallback(() => {
            if (hasMountedRef.current) {
                fetchInsights();
            }
            hasMountedRef.current = true;
        }, [fetchInsights])
    );



    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await fetchInsights();
        setRefreshing(false);
    }, [fetchInsights]);

    if (loading && !stats && !refreshing) {
        return (
            <SafeAreaView style={s.root} edges={['top']}>
                <StatusBar barStyle="dark-content" />
                <View style={s.header}>
                    <Text style={s.headerTitle}>Insights Hub</Text>
                </View>
                <ScrollView contentContainerStyle={s.scroll}>
                    <InsightsScorecardSkeleton />
                    <View style={{ marginBottom: 24 }}>
                        <SkeletonLoader width="60%" height={18} borderRadius={6} />
                        <SkeletonLoader width="100%" height={220} borderRadius={24} style={{ marginTop: 16 }} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
                        <MetricCardSkeleton />
                        <MetricCardSkeleton />
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" />
            <View style={s.header}>
                <Text style={s.headerTitle}>Insights Hub</Text>
                <View style={s.statusPill}>
                    <View style={s.statusDot} />
                    <Text style={s.statusText}>Live Stats</Text>
                </View>
            </View>

            <ScrollView 
                contentContainerStyle={s.scroll} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
            >

                {/* 1. Main Scorecard */}
                <View style={s.scorecard}>
                    <View style={s.row}>
                        <View style={s.scoreBox}>
                            <Text style={s.scoreLabel}>Rating</Text>
                            <View style={s.row}>
                                <Text style={s.scoreVal}>{stats?.rating?.toFixed(1) || '0.0'}</Text>
                                <Star size={16} color="#F59E0B" fill="#F59E0B" style={{ marginLeft: 4 }} />
                            </View>
                            <Text style={s.scoreSub}>{stats?.reviewCount || '0'} reviews</Text>
                        </View>
                        <View style={s.vDivider} />
                        <View style={s.scoreBox}>
                            <Text style={s.scoreLabel}>Comp. Rate</Text>
                            <Text style={s.scoreVal}>{stats?.completionRate || '100'}%</Text>
                        </View>
                        <View style={s.vDivider} />
                        <View style={s.scoreBox}>
                            <Text style={s.scoreLabel}>Points</Text>
                            <Text style={s.scoreVal}>450</Text>
                        </View>
                    </View>
                </View>

                {/* 2. Earnings Trend Chart */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <View style={s.row}>
                            <TrendingUp size={20} color="#111827" />
                            <Text style={s.sectionTitle}>Earnings Trend</Text>
                        </View>
                        <View style={s.periodPicker}>
                            {['daily', 'weekly', 'monthly'].map((p) => (
                                <TouchableOpacity 
                                    key={p} 
                                    onPress={() => setPeriod(p)}
                                    style={[s.periodBtn, period === p && s.periodBtnActive]}
                                >
                                    <Text style={[s.periodText, period === p && s.periodTextActive]}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {chartData ? (
                        <LineChart
                            data={chartData}
                            width={width - 40}
                            height={220}
                            chartConfig={{
                                backgroundColor: '#FFF',
                                backgroundGradientFrom: '#FFF',
                                backgroundGradientTo: '#FFF',
                                decimalPlaces: 0,
                                color: (opacity = 1) => `rgba(26, 63, 255, ${opacity})`,
                                labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                                style: { borderRadius: 16 },
                                propsForDots: { r: '4', strokeWidth: '2', stroke: PRIMARY }
                            }}
                            bezier
                            style={s.chart}
                        />
                    ) : (
                        <View style={[s.chart, { height: 220, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }]}>
                            <Text style={s.emptyHistory}>Loading chart data...</Text>
                        </View>
                    )}
                </View>

                {/* 2.1 Earnings History Breakdown */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>Earnings History</Text>
                        <Text style={s.totalEarnings}>₹{earningsDetails?.totalEarnings || 0}</Text>
                    </View>
                    <View style={s.historyList}>
                        {earningsDetails?.history?.length > 0 ? (
                            earningsDetails.history.map((item: any) => (
                                <View key={item.id} style={s.historyItem}>
                                    <View style={s.historyIcon}>
                                        <ArrowUpRight size={18} color="#10B981" />
                                    </View>
                                    <View style={s.historyMain}>
                                        <Text style={s.historyTitle}>{item.service_name_snapshot}</Text>
                                        <Text style={s.historyDate}>{new Date(item.updated_at).toLocaleDateString()} • {new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                    </View>
                                    <Text style={s.historyAmount}>+₹{item.total_amount}</Text>
                                </View>
                            ))
                        ) : (
                            <EmptyState 
                                title="No Data Available"
                                description="We don't have any earnings history for this period yet. Complete more jobs to see your insights!"
                                imageSource={InsightsEmptyImg}
                            />
                        )}
                    </View>
                </View>

                {/* 3. Performance Metrics */}
                <View style={s.metricsGrid}>
                    <View style={s.metricCard}>
                        <View style={[s.iconBg, { backgroundColor: '#ECFDF5' }]}>
                            <Zap size={20} color="#059669" />
                        </View>
                        <Text style={s.mLabel}>Response Time</Text>
                        <Text style={s.mVal}>{stats?.responseTime || '0'} mins</Text>
                        <View style={s.row}>
                            <ArrowUpRight size={12} color="#059669" />
                            <Text style={s.mChange}>Average</Text>
                        </View>
                    </View>

                    <View style={s.metricCard}>
                        <View style={[s.iconBg, { backgroundColor: '#EFF6FF' }]}>
                            <Clock size={20} color="#2563EB" />
                        </View>
                        <Text style={s.mLabel}>Peak Hours</Text>
                        <Text style={s.mVal}>{stats?.peakHours || 'N/A'}</Text>
                        <Text style={s.mHint}>High demand</Text>
                    </View>
                </View>

                {/* 4. Achievements */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <View style={s.row}>
                            <Award size={20} color="#111827" />
                            <Text style={s.sectionTitle}>Recent Achievements</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={s.badgeRow}>
                        <View style={s.badgeCircle}>
                            <Star size={24} color="#D97706" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.badgeTitle}>5-Star Streak</Text>
                            <Text style={s.badgeSub}>10 consecutive perfect ratings!</Text>
                        </View>
                        <ChevronRight size={20} color="#D1D5DB" />
                    </TouchableOpacity>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
    loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14, fontWeight: '600' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFF'
    },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#111827' },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20
    },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
    statusText: { fontSize: 12, fontWeight: '700', color: '#059669' },
    scroll: { padding: 20 },
    row: { flexDirection: 'row', alignItems: 'center' },
    // Scorecard
    scorecard: {
        backgroundColor: PRIMARY, borderRadius: 24, padding: 24, marginBottom: 24,
        shadowColor: PRIMARY, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10
    },
    scoreBox: { flex: 1, alignItems: 'center' },
    scoreLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 4 },
    scoreVal: { color: '#FFF', fontSize: 22, fontWeight: '900' },
    scoreSub: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600', marginTop: 2 },
    vDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
    // Sections
    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginLeft: 8 },
    sectionLink: { fontSize: 14, fontWeight: '700', color: PRIMARY },
    periodPicker: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 },
    periodBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    periodBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    periodText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
    periodTextActive: { color: PRIMARY },
    chart: { borderRadius: 24, marginVertical: 8 },
    // History
    historyList: { gap: 12 },
    historyItem: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
        borderRadius: 20, padding: 12, borderWidth: 1, borderColor: '#F3F4F6'
    },
    historyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    historyMain: { flex: 1 },
    historyTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
    historyDate: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
    historyAmount: { fontSize: 15, fontWeight: '800', color: '#10B981' },
    totalEarnings: { fontSize: 18, fontWeight: '900', color: '#111827' },
    emptyHistory: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 10, fontStyle: 'italic' },
    // Grid
    metricsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    metricCard: {
        flex: 1, backgroundColor: '#FFF', borderRadius: 24, padding: 16,
        borderWidth: 1, borderColor: '#F3F4F6'
    },
    iconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    mLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
    mVal: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 },
    mChange: { fontSize: 11, fontWeight: '700', color: '#059669', marginLeft: 2 },
    mHint: { fontSize: 11, fontWeight: '600', color: '#2563EB' },
    // Achievements
    badgeRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
        borderRadius: 24, padding: 16, gap: 16, borderWidth: 1, borderColor: '#F3F4F6'
    },
    badgeCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center' },
    badgeTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 2 },
    badgeSub: { fontSize: 13, color: '#6B7280' }
});
