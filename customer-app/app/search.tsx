import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Clock, Search, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ServiceGridSkeleton } from '../components/SkeletonLoader';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { PRIMARY, getBgForCategory, getColorForCategory, getIconForCategory } from '../lib/ui-constants';
const RECENT_SEARCHES_KEY = '@workla_recent_searches';

const { width } = Dimensions.get('window');

function ServiceCategoryImage({ imageUrl, slug, size, borderRadius }: {
    imageUrl?: string;
    slug: string;
    size: number;
    borderRadius: number;
}) {
    const [imgError, setImgError] = useState(false);
    const IconComponent = getIconForCategory(slug);
    const bg = getBgForCategory(slug);
    const color = getColorForCategory(slug);

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
            backgroundColor: bg, justifyContent: 'center', alignItems: 'center'
        }}>
            <IconComponent color={color} size={size * 0.45} />
        </View>
    );
}

export default function SearchScreen() {
    const router = useRouter();
    const [searchText, setSearchText] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [allServices, setAllServices] = useState<any[]>([]);
    const [_loading, setLoading] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        // 1. Load Recent Searches
        const saved = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        if (saved) setRecentSearches(JSON.parse(saved));

        // 2. Load Services for "Need help with?"
        const { data: srvs } = await supabase
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('priority_number', { ascending: false });
        if (srvs) setAllServices(srvs);

        // 3. Load Subcategories (Index)
        // Note: Removed local index as we use server-side /api/v1/search for geo-ranked results
        // const { data: subs } = await supabase...;
    };

    const searchTimeout = React.useRef<NodeJS.Timeout | null>(null);

    const handleSearch = (text: string) => {
        setSearchText(text);
        if (!text.trim()) {
            setResults([]);
            if (searchTimeout.current) clearTimeout(searchTimeout.current);
            return;
        }

        // ⚡ Debounce: wait 300ms after user stops typing before hitting backend
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        
        searchTimeout.current = setTimeout(async () => {
            setLoading(true);
            try {
                // Get location for geo-ranked search
                const loc = await Location.getLastKnownPositionAsync({});

                const res = await api.get(`/api/v1/search?q=${encodeURIComponent(text)}&lat=${loc?.coords.latitude || ''}&lng=${loc?.coords.longitude || ''}`);

                if (res.data) {
                    setResults(res.data);
                }
            } finally {
                setLoading(false);
            }
        }, 300);
    };

    const saveToRecent = async (query: string) => {
        const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
        setRecentSearches(updated);
        await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    };

    const clearRecent = async () => {
        setRecentSearches([]);
        await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
    };

    const onSelectResult = (item: any) => {
        saveToRecent(item.name);
        if (item.type === 'sub-service') {
            router.push({ pathname: '/service/detail/[id]', params: { id: item.id } } as any);
        } else {
            router.push({ pathname: '/service/[id]', params: { id: item.id } } as any);
        }
    };

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

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {searchText.length > 0 ? (
                    <View style={styles.resultsList}>
                        {results.length > 0 ? (
                            results.map(item => {
                                const slug = item.type === 'sub-service' ? (item.services as any)?.slug : item.slug;
                                const IconComp = getIconForCategory(slug || '');
                                const bg = getBgForCategory(slug || '');
                                const color = getColorForCategory(slug || '');
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={styles.resultRow}
                                        onPress={() => onSelectResult(item)}
                                    >
                                        <View style={[styles.resultIconWrap, { backgroundColor: bg }]}>
                                            <IconComp size={16} color={color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.resultName}>{item.name}</Text>
                                            <Text style={styles.resultSub}>
                                                {item.type === 'sub-service' ? `${(item.services as any)?.name} · Task` : 'Category'}
                                            </Text>
                                        </View>
                                        <ChevronRight color="#D1D5DB" size={16} />
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <View style={styles.emptySearch}>
                                <EmptyState 
                                    title="No results found"
                                    description={`We couldn&apos;t find anything for &quot;${searchText}&quot;. Try a different term or browse our services.`}
                                    imageSource={require('../assets/images/search-empty.png')}
                                    ctaLabel="Browse All Services"
                                    onCtaPress={() => router.push('/all-services' as any)}
                                />
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
                                    {recentSearches.map((s, i) => (
                                        <TouchableOpacity
                                            key={i}
                                            style={styles.recentChip}
                                            onPress={() => handleSearch(s)}
                                        >
                                            <Clock size={12} color="#6B7280" />
                                            <Text style={styles.recentChipText}>{s}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Need help with? */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitleLarge}>Need help with?</Text>
                            <View style={styles.grid}>
                                {allServices.length > 0 ? (
                                    allServices.map(s => {
                                        const IconComp = getIconForCategory(s.slug);
                                        const bg = getBgForCategory(s.slug);
                                        const color = getColorForCategory(s.slug);
                                        return (
                                            <TouchableOpacity
                                                key={s.id}
                                                style={styles.gridItem}
                                                onPress={() => router.push({ pathname: '/service/[id]', params: { id: s.id } } as any)}
                                            >
                                                <View style={[styles.gridIconWrap, { backgroundColor: bg }]}>
                                                    <IconComp size={width * 0.1} color={color} />
                                                </View>
                                                <Text style={styles.gridLabel} numberOfLines={1}>{s.name}</Text>
                                            </TouchableOpacity>
                                        );
                                    })
                                ) : (
                                    Array.from({ length: 9 }).map((_, i) => (
                                        <View key={i} style={styles.skeletonItem}>
                                            <ServiceGridSkeleton />
                                        </View>
                                    ))
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
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF',
        borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8
    },
    recentChipText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridItem: { alignItems: 'center', width: (width - 32 - 24) / 3, marginBottom: 20 },
    gridIconWrap: { width: width * 0.22, height: width * 0.22, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    skeletonItem: { width: (width - 32 - 24) / 3, marginBottom: 20 },
    gridLabel: { fontSize: 13, fontWeight: '700', color: '#374151', textAlign: 'center' },
    resultsList: { paddingHorizontal: 16 },
    resultRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6'
    },
    resultIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    resultName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    resultSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    emptySearch: { paddingVertical: 60, alignItems: 'center', gap: 16 },
    emptyText: { color: '#9CA3AF', fontSize: 14, fontWeight: '500' },
    browseBtn: { backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
    browseBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' }
});
