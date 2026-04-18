import { useRouter } from 'expo-router';
import { ArrowLeft, Check, CheckSquare, Grid, Info, Search, Square } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ProviderServicesScreen() {
    const [services, setServices] = useState<any[]>([]);
    const [subcategories, setSubcategories] = useState<any[]>([]);

    // Limits
    const MAX_SERVICES = 2;
    const MAX_SUBSERVICES = 4;

    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [selectedSubservices, setSelectedSubservices] = useState<string[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const router = useRouter();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            console.log('[SERVICES DEBUG] Fetching catalog and skills...');
            // 🛡️ 5-second safety timeout for the whole batch
            const sessionPromise = supabase.auth.getUser();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch Timeout')), 5000));
            
            const { data: { user } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
            if (!user) return;

            // Fetch everything in parallel for maximum speed
            const [srvsRes, subsRes, detailsRes] = await Promise.all([
                supabase.from('services').select('*').order('name'),
                supabase.from('service_subcategories').select('*').order('name'),
                supabase.from('provider_details').select('supported_services, supported_subservices').eq('provider_id', user.id).single()
            ]);

            if (srvsRes.error) console.warn('[SERVICES] Catalog error:', srvsRes.error.message);
            
            setServices(srvsRes.data || []);
            setSubcategories(subsRes.data || []);
            setSelectedServices(detailsRes.data?.supported_services || []);
            setSelectedSubservices(detailsRes.data?.supported_subservices || []);
            console.log('[SERVICES DEBUG] Catalog loaded successfully');
        } catch (error: any) {
            console.error('[SERVICES DEBUG] Error:', error.message || error);
            Alert.alert('Network Timeout', 'Could not load service categories. Please check your connection.');
        } finally {
            setLoading(false);
        }
    }, []);

    const onRefresh = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleService = (id: string) => {
        if (selectedServices.includes(id)) {
            // Uncheck service + all its subservices
            setSelectedServices(selectedServices.filter(sId => sId !== id));
            const subIdsToDrop = subcategories.filter(sub => sub.service_id === id).map(sub => sub.id);
            setSelectedSubservices(selectedSubservices.filter(subId => !subIdsToDrop.includes(subId)));
        } else {
            if (selectedServices.length >= MAX_SERVICES) {
                return Alert.alert('Limit Reached', `You can only select up to ${MAX_SERVICES} main Trades.`);
            }
            setSelectedServices([...selectedServices, id]);
        }
    };

    const toggleSubservice = (id: string, serviceId: string) => {
        if (selectedSubservices.includes(id)) {
            setSelectedSubservices(selectedSubservices.filter(sId => sId !== id));
        } else {
            if (selectedSubservices.length >= MAX_SUBSERVICES) {
                return Alert.alert('Limit Reached', `You can only select up to ${MAX_SUBSERVICES} specific tasks across all trades.`);
            }

            // Auto-select parent if not selected
            if (!selectedServices.includes(serviceId)) {
                if (selectedServices.length >= MAX_SERVICES) {
                    return Alert.alert('Trade Limit Reached', `You must select the Trade first, but you already have ${MAX_SERVICES} Trades selected.`);
                }
                setSelectedServices([...selectedServices, serviceId]);
            }

            setSelectedSubservices([...selectedSubservices, id]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Update provider_details array columns
            const { error } = await supabase.from('provider_details')
                .update({
                    supported_services: selectedServices,
                    supported_subservices: selectedSubservices
                })
                .eq('provider_id', user.id);

            if (error) throw error;

            Alert.alert('Success', 'Your skills have been updated successfully!');
            router.back();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredServices = services.filter(srv => {
        if (!search) return true;

        // If service name matches
        if (srv.name.toLowerCase().includes(search.toLowerCase())) return true;

        // Or if ANY of its subservices match
        const hasMatchingSub = subcategories.some(sub =>
            sub.service_id === srv.id && sub.name.toLowerCase().includes(search.toLowerCase())
        );
        return hasMatchingSub;
    });

    if (loading) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color={PRIMARY} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color="#111" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Configure Skills</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
                    {saving ? <ActivityIndicator size="small" color={PRIMARY} /> : <Text style={styles.saveBtnText}>Save</Text>}
                </TouchableOpacity>
            </View>

            {/* Limits Info Base */}
            <View style={styles.limitsRow}>
                <View style={styles.limitBox}>
                    <Text style={styles.limitLabel}>TRADES</Text>
                    <Text style={[styles.limitVal, selectedServices.length === MAX_SERVICES && { color: '#DC2626' }]}>
                        {selectedServices.length} / {MAX_SERVICES}
                    </Text>
                </View>
                <View style={styles.limitBox}>
                    <Text style={styles.limitLabel}>SPECIFIC TASKS</Text>
                    <Text style={[styles.limitVal, selectedSubservices.length === MAX_SUBSERVICES && { color: '#DC2626' }]}>
                        {selectedSubservices.length} / {MAX_SUBSERVICES}
                    </Text>
                </View>
            </View>

            {/* Info Message */}
            <View style={styles.infoBox}>
                <Info size={16} color="#0369A1" style={{ marginTop: 2 }} />
                <Text style={styles.infoText}>You can select up to {MAX_SERVICES} main Trades and {MAX_SUBSERVICES} specific tasks. This ensures you only receive leads for jobs you can fulfill.</Text>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
                <Search size={20} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search trades or tasks..."
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
            >
                {filteredServices.length === 0 ? (
                    <EmptyState 
                        title="No Trades Found"
                        description="Try searching for something else or browse the available trades below."
                        imageSource={require('../assets/images/search-empty.png')}
                        ctaLabel="Clear Search"
                        onCtaPress={() => setSearch('')}
                    />
                ) : filteredServices.map(srv => {
                    const srvSubs = subcategories.filter(s => s.service_id === srv.id);
                    const isServiceSelected = selectedServices.includes(srv.id);

                    // If searching, we might want to only show matched subs, but it's simpler to show all if the group matches
                    const filteredSrvSubs = search
                        ? srvSubs.filter(sub => sub.name.toLowerCase().includes(search.toLowerCase()) || srv.name.toLowerCase().includes(search.toLowerCase()))
                        : srvSubs;

                    if (filteredSrvSubs.length === 0 && search) return null;

                    return (
                        <View key={srv.id} style={[styles.section, isServiceSelected && styles.sectionActive]}>
                            {/* Service Header */}
                            <TouchableOpacity
                                style={[styles.sectionHeader, isServiceSelected && styles.sectionHeaderActive]}
                                onPress={() => toggleService(srv.id)}
                                activeOpacity={0.8}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                    {isServiceSelected ? (
                                        <CheckSquare size={22} color={PRIMARY} />
                                    ) : (
                                        <Square size={22} color="#D1D5DB" />
                                    )}
                                    <View>
                                        <Text style={[styles.sectionTitle, isServiceSelected && styles.sectionTitleActive]}>{srv.name}</Text>
                                        <Text style={styles.sectionSub}>{srvSubs.length} tasks available</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>

                            {/* Subservices List */}
                            <View style={styles.list}>
                                {filteredSrvSubs.map(sub => {
                                    const isSubSelected = selectedSubservices.includes(sub.id);
                                    return (
                                        <TouchableOpacity
                                            key={sub.id}
                                            style={[styles.item, isSubSelected && styles.itemSelected]}
                                            onPress={() => toggleSubservice(sub.id, srv.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.itemLeft}>
                                                <View style={[styles.iconBg, isSubSelected && styles.iconBgSelected]}>
                                                    <Grid size={18} color={isSubSelected ? '#FFF' : '#6B7280'} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.itemName, isSubSelected && styles.itemNameSelected]}>{sub.name}</Text>
                                                    <Text style={styles.itemDesc} numberOfLines={1}>{sub.description || 'General task'}</Text>
                                                </View>
                                            </View>
                                            {isSubSelected ? (
                                                <View style={styles.checkCircle}>
                                                    <Check size={14} color="#FFF" />
                                                </View>
                                            ) : (
                                                <View style={styles.emptyCircle} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    );
                })}
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
    saveBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20 },
    saveBtnText: { color: PRIMARY, fontWeight: '800', fontSize: 16 },

    limitsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
    limitBox: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    limitLabel: { fontSize: 10, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },
    limitVal: { fontSize: 18, fontWeight: '900', color: '#111827', marginTop: 2 },

    infoBox: { flexDirection: 'row', backgroundColor: '#F0F9FF', margin: 16, padding: 12, borderRadius: 12, gap: 10, alignItems: 'flex-start', borderWidth: 1, borderColor: '#E0F2FE' },
    infoText: { flex: 1, fontSize: 12, color: '#0369A1', lineHeight: 18, fontWeight: '500' },

    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, borderRadius: 12, height: 48, borderWidth: 1, borderColor: '#F3F4F6' },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#111' },

    scroll: { padding: 16 },

    section: { marginBottom: 20, backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden' },
    sectionActive: { borderColor: PRIMARY },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    sectionHeaderActive: { backgroundColor: '#EEF2FF', borderBottomColor: '#E0E7FF' },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#374151' },
    sectionTitleActive: { color: PRIMARY },
    sectionSub: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginTop: 2 },

    list: { padding: 12, gap: 8 },
    item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#FFF' },
    itemSelected: { backgroundColor: '#F9FAFB' },
    itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    iconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    iconBgSelected: { backgroundColor: PRIMARY },
    itemName: { fontSize: 14, fontWeight: '700', color: '#374151' },
    itemNameSelected: { color: PRIMARY },
    itemDesc: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

    checkCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },
    emptyCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#E5E7EB' },
});
