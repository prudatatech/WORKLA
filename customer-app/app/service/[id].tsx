import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, ListTree, Wrench, Zap } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/SkeletonLoader';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ServiceSubcategoriesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [service, setService] = useState<any | null>(null);
    const [subcategories, setSubcategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        // 1. Fetch the selected service
        const { data: srvData } = await supabase
            .from('services')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (srvData) setService(srvData);

        // 2. Fetch its subcategories (tasks)
        const { data: subData } = await supabase
            .from('service_subcategories')
            .select('*')
            .eq('service_id', id)
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (subData) setSubcategories(subData);
        setLoading(false);
    }, [id]);

    useEffect(() => {
        if (!id) return;
        fetchData();
    }, [id, fetchData]);

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ArrowLeft size={22} color="#111827" />
                    </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={[styles.heroCard, { backgroundColor: '#F3F4F6' }]} />
                    <View style={{ padding: 16 }}>
                        <View style={{ width: 150, height: 20, backgroundColor: '#F3F4F6', borderRadius: 6, marginBottom: 15 }} />
                        {[1, 2, 3, 4].map(i => <ListRowSkeleton key={i} />)}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (!service) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ArrowLeft size={22} color="#111827" />
                    </TouchableOpacity>
                </View>
                <View style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
                    <EmptyState 
                        title="Service Not Available"
                        description="This service is currently not available in your area or has been moved."
                        imageSource={require('../../assets/images/search-empty.png')}
                        ctaLabel="Back to Services"
                        onCtaPress={() => router.back()}
                    />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={22} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{service.name}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* Hero section */}
                <View style={styles.heroCard}>
                    {service.image_url ? (
                        <Image source={{ uri: service.image_url }} style={styles.heroImage} resizeMode="cover" />
                    ) : (
                        <View style={[styles.heroImage, { backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' }]}>
                            <Wrench size={40} color={PRIMARY} />
                        </View>
                    )}
                    <View style={styles.heroOverlay}>
                        <Text style={styles.heroTitle}>{service.name}</Text>
                        {service.description ? <Text style={styles.heroDesc} numberOfLines={2}>{service.description}</Text> : null}
                    </View>
                </View>

                {/* Subcategories List */}
                <View style={styles.listSection}>
                    <Text style={styles.sectionTitle}>Select a specific task</Text>

                    {subcategories.length === 0 ? (
                        <EmptyState 
                            title="No Tasks Available"
                            description="We don't have specific tasks listed for this trade yet. Try a custom request below."
                            imageSource={require('../../assets/images/search-empty.png')}
                        />
                    ) : (
                        <View style={styles.gridContainer}>
                            {subcategories.map(sub => (
                                <TouchableOpacity
                                    key={sub.id}
                                    style={styles.subCard}
                                    activeOpacity={0.8}
                                    onPress={() => router.push({ pathname: '/service/detail/[id]', params: { id: sub.id } } as any)}
                                >
                                    <View style={styles.subLeft}>
                                        <View style={styles.subIconWrap}>
                                            {sub.image_url ? (
                                                <Image source={{ uri: sub.image_url }} style={styles.subImage} resizeMode="cover" />
                                            ) : (
                                                <Zap size={16} color={PRIMARY} />
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.subTitleRow}>
                                                <Text style={styles.subTitle}>{sub.name}</Text>
                                                {sub.is_recommended && <View style={styles.recBadge}><Text style={styles.recText}>Rec</Text></View>}
                                            </View>
                                            {sub.description && <Text style={styles.subDesc} numberOfLines={1}>{sub.description}</Text>}
                                            <Text style={styles.subPrice}>Starts at ₹{sub.base_price}</Text>

                                            {/* Modalities */}
                                            <View style={styles.modeRow}>
                                                {sub.is_one_time && <Text style={styles.modePill}>One-Time</Text>}
                                                {sub.is_daily && <Text style={[styles.modePill, { backgroundColor: '#D1FAE5', color: '#065F46' }]}>Daily</Text>}
                                                {sub.is_weekly && <Text style={[styles.modePill, { backgroundColor: '#EDE9FE', color: '#5B21B6' }]}>Weekly</Text>}
                                                {sub.is_monthly && <Text style={[styles.modePill, { backgroundColor: '#FFE4E6', color: '#9F1239' }]}>Monthly</Text>}
                                            </View>
                                        </View>
                                    </View>
                                    <View style={styles.bookBtn}>
                                        <Text style={styles.bookText}>Add</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Custom Request Card */}
                    <TouchableOpacity
                        style={styles.customCard}
                        activeOpacity={0.8}
                        onPress={() => router.push({ pathname: '/book/[id]', params: { id: 'new', service: service.name } } as any)}
                    >
                        <View style={styles.customIconWrap}>
                            <ListTree size={20} color="#FFF" />
                        </View>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.customTitle}>Something else?</Text>
                            <Text style={styles.customDesc}>Don&apos;t see your specific task? Request a custom quote from an expert.</Text>
                        </View>
                        <ArrowRight size={20} color="#D1D5DB" />
                    </TouchableOpacity>

                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFF' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#FFF' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },
    scroll: { paddingBottom: 40 },

    heroCard: { margin: 16, height: 160, borderRadius: 24, overflow: 'hidden', backgroundColor: '#F9FAFB' },
    heroImage: { width: '100%', height: '100%' },
    heroOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'flex-end',
        padding: 20,
    },
    heroTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    heroDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 4, fontWeight: '500' },

    listSection: { paddingHorizontal: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },

    gridContainer: { gap: 12 },
    subCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#F3F4F6', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    subLeft: { flexDirection: 'row', flex: 1, gap: 14, alignItems: 'flex-start' },
    subIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    subImage: { width: '100%', height: '100%' },
    subTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    subTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
    recBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    recText: { fontSize: 9, fontWeight: '800', color: '#B45309', textTransform: 'uppercase' },
    subDesc: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
    subPrice: { fontSize: 13, fontWeight: '800', color: PRIMARY, marginBottom: 6 },

    modeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
    modePill: { fontSize: 9, fontWeight: '800', backgroundColor: '#F3F4F6', color: '#4B5563', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, textTransform: 'uppercase' },

    bookBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
    bookText: { color: PRIMARY, fontSize: 13, fontWeight: '800' },

    customCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 20, padding: 16, marginTop: 16 },
    customIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    customTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 2 },
    customDesc: { fontSize: 12, color: '#6B7280', lineHeight: 18 },

    emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#F9FAFB', borderRadius: 20, borderWidth: 1, borderColor: '#F3F4F6', borderStyle: 'dashed' },
    emptyText: { color: '#6B7280', marginTop: 12, fontWeight: '500', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
});
