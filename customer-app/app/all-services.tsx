import { useRouter } from 'expo-router';
import { ChevronLeft, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
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
import { api } from '../lib/api';
import { getBgForCategory, getColorForCategory, getIconForCategory } from '../lib/ui-constants';

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

export default function AllServicesScreen() {
    const router = useRouter();
    const [services, setServices] = useState<any[]>([]);
    const [filteredServices, setFilteredServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    const loadServices = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/v1/services');

            if (res.data) {
                setServices(res.data);
                setFilteredServices(res.data);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadServices();
    }, [loadServices]);

    useEffect(() => {
        if (!searchText.trim()) {
            setFilteredServices(services);
            return;
        }
        const q = searchText.toLowerCase();
        const results = services.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.description && s.description.toLowerCase().includes(q))
        );
        setFilteredServices(results);
    }, [searchText, services]);

    return (
        <View style={styles.root}>
            <SafeAreaView edges={['top']} style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <ChevronLeft color="#111827" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>All Services</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Search color="#9CA3AF" size={18} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="What are you looking for?"
                            value={searchText}
                            onChangeText={setSearchText}
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>
                </View>
            </SafeAreaView>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                    {loading ? (
                        Array.from({ length: 12 }).map((_, i) => (
                            <View key={i} style={styles.skeletonItem}>
                                <ServiceGridSkeleton />
                            </View>
                        ))
                    ) : filteredServices.length > 0 ? (
                        filteredServices.map(s => {
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
                                        <IconComp color={color} size={width * 0.12} />
                                    </View>
                                    <Text style={styles.gridLabel} numberOfLines={2}>{s.name}</Text>
                                </TouchableOpacity>
                            );
                        })
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No services match your search.</Text>
                        </View>
                    )}
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFF' },
    header: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    headerTop: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 8, height: 56
    },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    searchContainer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6',
        borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 10
    },
    searchInput: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500' },
    scrollContent: { padding: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridItem: { alignItems: 'center', width: (width - 32 - 24) / 3, marginBottom: 20 },
    gridIconWrap: { width: width * 0.23, height: width * 0.23, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    skeletonItem: { width: (width - 32 - 24) / 3, marginBottom: 20 },
    gridLabel: { fontSize: 13, fontWeight: '700', color: '#374151', textAlign: 'center' },
    emptyState: { flex: 1, paddingVertical: 80, alignItems: 'center' },
    emptyText: { color: '#9CA3AF', fontSize: 14, fontWeight: '500' }
});
