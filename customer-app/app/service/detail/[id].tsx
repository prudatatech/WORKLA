import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock, Info, LayoutGrid, Share2, Star, Zap } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ServiceDetailSkeleton } from '../../../components/SkeletonLoader';
import { supabase } from '../../../lib/supabase';
import BucketFAB from '../../../components/BucketFAB'; // Force rebuild

const { width } = Dimensions.get('window');
const PRIMARY = '#1A3FFF';

export default function ServiceDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [subservice, setSubservice] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedFaqs, setExpandedFaqs] = useState<number[]>([]);

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        const { data, error: _error } = await supabase
            .from('service_subcategories')
            .select('*, services(name, image_url)')
            .eq('id', id)
            .maybeSingle();

        if (data) setSubservice(data);
        setLoading(false);
    }, [id]);

    useEffect(() => {
        if (id) fetchDetail();
    }, [id, fetchDetail]);

    const toggleFaq = (index: number) => {
        setExpandedFaqs(prev =>
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        );
    };

    if (loading) {
        return <ServiceDetailSkeleton />;
    }

    if (!subservice) {
        return (
            <View style={styles.errorContainer}>
                <Text>Service details not found.</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtnText}><Text>Go Back</Text></TouchableOpacity>
            </View>
        );
    }

    const benefits = subservice.benefits || [];
    const exclusions = subservice.exclusions || [];
    const faqs = subservice.faqs || [];
    const gallery = subservice.gallery_urls || [];
    const mainImage = subservice.image_url || subservice.services?.image_url;

    return (
        <View style={styles.root}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Hero Gallery / Header */}
                <View style={styles.heroSection}>
                    {gallery.length > 0 ? (
                        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                            {gallery.map((url: string, i: number) => (
                                <Image key={i} source={{ uri: url }} style={styles.heroImage} />
                            ))}
                        </ScrollView>
                    ) : (
                        <Image source={{ uri: mainImage }} style={styles.heroImage} />
                    )}

                    <SafeAreaView style={styles.headerOverlay} edges={['top']}>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
                            <ArrowLeft size={20} color="#000" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn}>
                            <Share2 size={18} color="#000" />
                        </TouchableOpacity>
                    </SafeAreaView>

                    {gallery.length > 1 && (
                        <View style={styles.imageCount}>
                            <LayoutGrid size={12} color="#FFF" />
                            <Text style={styles.imageCountText}>1/{gallery.length}</Text>
                        </View>
                    )}
                </View>

                {/* Info Card */}
                <View style={styles.infoContent}>
                    <View style={styles.titleRow}>
                        <View style={{ flex: 1 }}>
                            {subservice.is_recommended && (
                                <View style={styles.bestSellerBadge}>
                                    <Star size={10} color="#B45309" fill="#B45309" />
                                    <Text style={styles.bestSellerText}>Recommended</Text>
                                </View>
                            )}
                            <Text style={styles.title}>{subservice.name}</Text>
                            <Text style={styles.parentName}>{subservice.services?.name}</Text>
                        </View>
                        <View style={styles.ratingBadge}>
                            <Star size={14} color="#FFF" fill="#FFF" />
                            <Text style={styles.ratingText}>4.8</Text>
                        </View>
                    </View>

                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}>
                            <Clock size={16} color="#6B7280" />
                            <Text style={styles.metricText}>45-60 min</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.metricItem}>
                            <Zap size={16} color="#6B7280" />
                            <Text style={styles.metricText}>Expert Pro</Text>
                        </View>
                    </View>

                    <Text style={styles.priceText}>₹{subservice.base_price}</Text>

                    {subservice.description && (
                        <View style={styles.descBox}>
                            <Text style={styles.desc}>{subservice.description}</Text>
                        </View>
                    )}
                </View>

                {/* About Section */}
                {subservice.long_description && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>About this Service</Text>
                        <Text style={styles.longDesc}>{subservice.long_description}</Text>
                    </View>
                )}

                {/* What's Included */}
                {benefits.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>What&apos;s Included</Text>
                        <View style={styles.benefitList}>
                            {benefits.map((b: string, i: number) => (
                                <View key={i} style={styles.benefitItem}>
                                    <CheckCircle2 size={18} color="#10B981" />
                                    <Text style={styles.benefitText}>{b}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Exclusions */}
                {exclusions.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Exclusions</Text>
                        <View style={styles.benefitList}>
                            {exclusions.map((e: string, i: number) => (
                                <View key={i} style={styles.benefitItem}>
                                    <Info size={18} color="#EF4444" />
                                    <Text style={styles.benefitText}>{e}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* FAQS */}
                {faqs.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
                        {faqs.map((f: any, i: number) => (
                            <TouchableOpacity key={i} style={styles.faqItem} onPress={() => toggleFaq(i)}>
                                <View style={styles.faqHeader}>
                                    <Text style={styles.faqQuestion}>{f.q}</Text>
                                    {expandedFaqs.includes(i) ? <ChevronUp size={20} color="#6B7280" /> : <ChevronDown size={20} color="#6B7280" />}
                                </View>
                                {expandedFaqs.includes(i) && (
                                    <Text style={styles.faqAnswer}>{f.a}</Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={styles.footer}>
                <View>
                    <Text style={styles.footerPrice}>₹{subservice.base_price}</Text>
                    <Text style={styles.footerSub}>Final price shared during booking</Text>
                </View>
                <TouchableOpacity
                    style={styles.bookBtn}
                    onPress={() => router.push({ pathname: '/book/[id]', params: { id: 'new', service: subservice.services?.name, subservice: subservice.name } } as any)}
                >
                    <Text style={styles.bookBtnText}>Select & Book Now</Text>
                </TouchableOpacity>
            </View>
            <BucketFAB />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFF' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    backBtnText: { marginTop: 20, color: PRIMARY, fontWeight: '700' },

    heroSection: { height: 320, width: width, position: 'relative' },
    heroImage: { width: width, height: 320, resizeMode: 'cover' },
    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10 },
    iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
    imageCount: { position: 'absolute', bottom: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
    imageCountText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

    infoContent: { padding: 20 },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    bestSellerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 8 },
    bestSellerText: { fontSize: 10, fontWeight: '800', color: '#B45309', textTransform: 'uppercase' },
    title: { fontSize: 24, fontWeight: '900', color: '#111827' },
    parentName: { fontSize: 14, color: '#6B7280', marginTop: 2, fontWeight: '500' },
    ratingBadge: { backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    ratingText: { color: '#FFF', fontWeight: '800', fontSize: 14 },

    metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
    metricItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metricText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
    divider: { width: 1, height: 14, backgroundColor: '#E5E7EB' },

    priceText: { fontSize: 28, fontWeight: '900', color: '#111827', marginTop: 16 },
    descBox: { marginTop: 12, padding: 16, backgroundColor: '#F9FAFB', borderRadius: 16 },
    desc: { fontSize: 14, color: '#4B5563', lineHeight: 22 },

    section: { padding: 20, borderTopWidth: 8, borderTopColor: '#F3F4F6' },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
    longDesc: { fontSize: 14, color: '#4B5563', lineHeight: 22, fontWeight: '500' },

    benefitList: { gap: 14 },
    benefitItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    benefitText: { fontSize: 14, color: '#374151', fontWeight: '600' },

    faqItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    faqQuestion: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1, paddingRight: 20 },
    faqAnswer: { fontSize: 14, color: '#6B7280', marginTop: 12, lineHeight: 20, fontWeight: '500' },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 20, paddingBottom: 34, borderTopWidth: 1, borderTopColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 20 },
    footerPrice: { fontSize: 22, fontWeight: '900', color: '#111827' },
    footerSub: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
    bookBtn: { backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
    bookBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
