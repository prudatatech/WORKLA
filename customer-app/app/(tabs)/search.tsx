import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { 
    ChevronLeft, 
    ChevronRight, 
    Grid, 
    Search, 
    X,
    Hammer, 
    Paintbrush, 
    Shield, 
    Snowflake, 
    Sprout, 
    Wrench, 
    Zap 
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Dimensions,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ServiceGridSkeleton } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import { supabase } from '../../lib/supabase';

const SearchEmptyImg = require('../../assets/images/search-empty.png');

const { width } = Dimensions.get('window');
const PRIMARY = '#1A3FFF';

// Icon Helper
const getIconForCategory = (slug: string) => {
    const map: Record<string, any> = {
        'cleaning': 'Sprout', 'plumbing': 'Wrench', 'electrician': 'Zap',
        'ac-service': 'Snowflake', 'pest-control': 'Shield',
        'appliance-repair': 'Hammer', 'paint': 'Paintbrush',
    };
    return map[slug] || 'Grid';
};

// Merged into top imports
const ICON_MAP: Record<string, any> = {
    Sprout, Wrench, Zap, Snowflake, Shield, Hammer, Paintbrush, Grid
};

function ServiceCategoryImage({ imageUrl, slug, size, borderRadius }: {
    imageUrl?: string;
    slug: string;
    size: number;
    borderRadius: number;
}) {
    const [imgError, setImgError] = useState(false);
    const IconComponent = ICON_MAP[getIconForCategory(slug)] || Grid;

    if (imageUrl && !imgError) {
        return (
            <View style={{ width: size, height: size, borderRadius, overflow: 'hidden' }}>
                <Image
                    source={{ uri: imageUrl }}
                    style={{ width: size, height: size }}
                    onError={() => setImgError(true)}
                    resizeMode="cover"
                />
            </View>
        );
    }
    return (
        <View style={{
            width: size, height: size, borderRadius,
            backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center'
        }}>
            <IconComponent color="#6B7280" size={size * 0.45} />
        </View>
    );
}

export default function SearchScreen() {
    const router = useRouter();
    const [searchText, setSearchText] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [recentSearches, setRecentSearches] = useState<any[]>([]);
    const [allServices, setAllServices] = useState<any[]>([]);
    const [allSubcategories, setAllSubcategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        // 1. Get User
        const { data: { user: u } } = await supabase.auth.getUser();
        setUser(u);

        // 2. Load Recent Searches from DB
        if (u) {
            const { data: history } = await supabase
                .from('user_search_history')
                .select('*')
                .eq('user_id', u.id)
                .order('created_at', { ascending: false })
                .limit(6);
            if (history) setRecentSearches(history);
        }

        // 3. Load Services for "Need help with?"
        const { data: srvs } = await supabase
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('priority_number', { ascending: false });
        if (srvs) setAllServices(srvs);

        // 4. Load Subcategories for search index
        const { data: subs } = await supabase
            .from('service_subcategories')
            .select('id, name, description, service_id, services(name, slug)')
            .eq('is_active', true);
        if (subs) setAllSubcategories(subs);
        setLoading(false);
    };

    const handleSearch = (text: string) => {
        setSearchText(text);
        if (!text.trim()) {
            setResults([]);
            return;
        }
        const q = text.toLowerCase();
        const filtered = allSubcategories.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.description && s.description.toLowerCase().includes(q)) ||
            (s.services as any)?.name?.toLowerCase().includes(q)
        ).slice(0, 15);
        setResults(filtered);
    };

    const saveToRecent = async (query: string, slug?: string) => {
        if (!user) return;

        // Upsert search history
        const { data: newEntry, error } = await supabase
            .from('user_search_history')
            .upsert({
                user_id: user.id,
                query,
                category_slug: slug,
                created_at: new Date().toISOString()
            }, { onConflict: 'user_id, query' })
            .select()
            .single();

        if (!error && newEntry) {
            setRecentSearches(prev => [newEntry, ...prev.filter(s => s.query !== query)].slice(0, 6));
        }
    };

    const deleteRecentItem = async (id: string) => {
        const { error } = await supabase
            .from('user_search_history')
            .delete()
            .eq('id', id);

        if (!error) {
            setRecentSearches(prev => prev.filter(s => s.id !== id));
        }
    };

    const clearRecent = async () => {
        if (!user) return;
        const { error } = await supabase
            .from('user_search_history')
            .delete()
            .eq('user_id', user.id);

        if (!error) setRecentSearches([]);
    };

    const onSelectResult = (item: any) => {
        saveToRecent(item.name, (item.services as any)?.slug);
        router.push({ pathname: '/book/[id]', params: { id: 'new', serviceId: item.service_id, service: item.name } } as any);
    };

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await loadInitialData();
        setRefreshing(false);
    }, []);

    return (
        <View style={styles.root}>
            <SafeAreaView edges={['top']} style={styles.header}>
                <View style={styles.searchBarRow}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <ChevronLeft color="#111827" size={24} />
                    </TouchableOpacity>
                    <View style={styles.inputContainer}>
                        <Search color="#9CA3AF" size={18} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search for &apos;Fan Repair&apos;..."
                            value={searchText}
                            onChangeText={handleSearch}
                            autoFocus
                            placeholderTextColor="#9CA3AF"
                        />
                        {searchText.length > 0 && (
                            <TouchableOpacity onPress={() => handleSearch('')}>
                                <X color="#9CA3AF" size={18} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </SafeAreaView>

            <ScrollView 
                contentContainerStyle={styles.scrollContent} 
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
            >
                {searchText.length > 0 ? (
                    <View style={styles.resultsList}>
                        {results.length > 0 ? (
                            results.map(item => {
                                const IconComp = ICON_MAP[getIconForCategory((item.services as any)?.slug || '')] || Wrench;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={styles.resultRow}
                                        onPress={() => onSelectResult(item)}
                                    >
                                        <View style={styles.resultIconWrap}>
                                            <IconComp size={16} color={PRIMARY} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.resultName}>{item.name}</Text>
                                            <Text style={styles.resultSub}>{(item.services as any)?.name} · Expert</Text>
                                        </View>
                                        <ChevronRight color="#D1D5DB" size={16} />
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <View style={styles.emptySearch}>
                                <Text style={styles.emptyText}>No results found for &quot;{searchText}&quot;</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <>
                        {/* Recent Searches */}
                        {recentSearches.length > 0 && (
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>Recent Searches</Text>
                                    <TouchableOpacity onPress={clearRecent}>
                                        <Text style={styles.clearText}>Clear</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.recentGrid}>
                                    {recentSearches.map((s) => {
                                        const IconComp = ICON_MAP[getIconForCategory(s.category_slug || '')] || Search;
                                        return (
                                            <View key={s.id} style={styles.recentChip}>
                                                <TouchableOpacity
                                                    style={styles.recentChipContent}
                                                    onPress={() => handleSearch(s.query)}
                                                >
                                                    <IconComp size={12} color={PRIMARY} />
                                                    <Text style={styles.recentChipText} numberOfLines={1}>{s.query}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => deleteRecentItem(s.id)}
                                                    style={styles.recentDelete}
                                                >
                                                    <X size={10} color="#9CA3AF" />
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Need help with? */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitleLarge}>Need help with?</Text>
                            <View style={styles.grid}>
                                {loading ? (
                                    Array.from({ length: 9 }).map((_, i) => (
                                        <View key={i} style={styles.skeletonItem}>
                                            <ServiceGridSkeleton />
                                        </View>
                                    ))
                                ) : allServices.length > 0 ? (
                                    allServices.map(s => (
                                        <TouchableOpacity
                                            key={s.id}
                                            style={styles.gridItem}
                                            onPress={() => router.push({ pathname: '/service/[id]', params: { id: s.id } } as any)}
                                        >
                                            <ServiceCategoryImage
                                                imageUrl={s.image_url}
                                                slug={s.slug}
                                                size={width * 0.22}
                                                borderRadius={18}
                                            />
                                            <Text style={styles.gridLabel} numberOfLines={1}>{s.name}</Text>
                                        </TouchableOpacity>
                                    ))
                                ) : (
                                    !loading && searchText.length > 2 ? (
                                        <EmptyState 
                                            title="No Experts Found"
                                            description="We couldn't find any experts matching your search. Try adjusting your filters or location."
                                            imageSource={SearchEmptyImg}
                                        />
                                    ) : null
                                )}
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFF' },
    header: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 12 },
    searchBarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
    backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    inputContainer: {
        flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6',
        borderRadius: 14, paddingHorizontal: 12, height: 46, gap: 10, marginRight: 12
    },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
    scrollContent: { paddingVertical: 16 },
    section: { paddingHorizontal: 16, marginBottom: 28 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionTitleLarge: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 20 },
    clearText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
    recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    recentChip: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
        borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, overflow: 'hidden'
    },
    recentChipContent: {
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 6, paddingVertical: 8
    },
    recentDelete: {
        paddingHorizontal: 8, paddingVertical: 8, borderLeftWidth: 1, borderLeftColor: '#F3F4F6',
        backgroundColor: '#FAFAFA'
    },
    recentChipText: { fontSize: 13, fontWeight: '600', color: '#4B5563', maxWidth: width * 0.3 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridItem: { alignItems: 'center', width: (width - 32 - 24) / 3, marginBottom: 20 },
    skeletonItem: { width: (width - 32 - 24) / 3, marginBottom: 20 },
    gridLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textAlign: 'center', marginTop: 8 },
    resultsList: { paddingHorizontal: 16 },
    resultRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6'
    },
    resultIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    resultName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    resultSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    emptySearch: { paddingVertical: 60, alignItems: 'center' },
    emptyText: { color: '#9CA3AF', fontSize: 14, fontWeight: '500' },
    emptyState: { padding: 40, alignItems: 'center' }
});
