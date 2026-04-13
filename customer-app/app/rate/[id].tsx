import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Star, ThumbsUp } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#1A3FFF';

// Star label by rating
const STAR_LABELS: Record<number, { label: string; emoji: string; color: string }> = {
    1: { label: 'Poor', emoji: '😞', color: '#EF4444' },
    2: { label: 'Fair', emoji: '😐', color: '#F97316' },
    3: { label: 'Good', emoji: '🙂', color: '#EAB308' },
    4: { label: 'Great', emoji: '😊', color: '#22C55E' },
    5: { label: 'Excellent', emoji: '🤩', color: '#1A3FFF' },
};

// Quick tag chips the user can tap instead of writing a review
const PRAISE_TAGS = [
    'Professional', 'On Time', 'Clean Work', 'Friendly',
    'Good Value', 'Skilled', 'Communicative', 'Would Rebook',
];

export default function RatingScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [booking, setBooking] = useState<any>(null);
    const [rating, setRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [review, setReview] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await api.get(`/api/v1/bookings/${id}`);
            if (res.data) setBooking(res.data);
        })();
    }, [id]);

    const toggleTag = (tag: string) => {
        setSelectedTags(curr =>
            curr.includes(tag) ? curr.filter(t => t !== tag) : [...curr, tag]
        );
    };

    const submitRating = async () => {
        if (rating === 0) {
            Alert.alert('Required', 'Please tap a star to rate your experience.');
            return;
        }
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const fullReview = [
                selectedTags.length > 0 ? selectedTags.join(', ') : null,
                review.trim() || null,
            ].filter(Boolean).join(' · ');

            const reviewData = {
                bookingId: id,
                providerId: booking?.provider_id,
                rating: rating,
                reviewText: fullReview || null
            };

            const res = await api.post('/api/v1/reviews', reviewData);
            if (res.error) throw new Error(res.error);

            setSubmitted(true);
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setLoading(false);
        }
    };

    const providerName = booking?.provider_details?.business_name ?? booking?.provider_details?.profiles?.full_name ?? 'Your Worker';
    const displayRating = hoveredRating || rating;
    const starMeta = STAR_LABELS[displayRating];

    // ── SUCCESS STATE ──────────────────────────────────────────────────────────
    if (submitted) {
        return (
            <SafeAreaView style={styles.successRoot} edges={['top', 'bottom']}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
                <View style={styles.successContent}>
                    <View style={styles.successEmoji}>
                        <Text style={{ fontSize: 56 }}>🎉</Text>
                    </View>
                    <Text style={styles.successTitle}>Thank You!</Text>
                    <Text style={styles.successSub}>
                        Your feedback helps workers improve and helps other customers find the best.
                    </Text>
                    <View style={styles.ratingDisplay}>
                        {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} size={28} color={s <= rating ? '#F59E0B' : '#E5E7EB'} fill={s <= rating ? '#F59E0B' : 'transparent'} />
                        ))}
                    </View>
                    <TouchableOpacity
                        style={styles.doneBtn}
                        onPress={() => router.replace('/(tabs)/bookings')}
                    >
                        <Text style={styles.doneBtnText}>Back to Bookings</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Rate Your Experience</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Worker card */}
                <View style={styles.workerCard}>
                    <View style={styles.workerAvatar}>
                        <Text style={styles.workerInitial}>{providerName.charAt(0)}</Text>
                    </View>
                    <View>
                        <Text style={styles.workerName}>{providerName}</Text>
                        <Text style={styles.workerService}>
                            {booking?.service_name_snapshot ?? 'Service'} · #{booking?.booking_number ?? '—'}
                        </Text>
                    </View>
                </View>

                {/* Question */}
                <Text style={styles.question}>How was your experience?</Text>

                {/* Stars */}
                <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(s => (
                        <TouchableOpacity
                            key={s}
                            onPress={() => setRating(s)}
                            onPressIn={() => setHoveredRating(s)}
                            onPressOut={() => setHoveredRating(0)}
                            activeOpacity={0.8}
                        >
                            <Star
                                size={52}
                                color={s <= displayRating ? '#F59E0B' : '#E5E7EB'}
                                fill={s <= displayRating ? '#F59E0B' : 'transparent'}
                                style={{ marginHorizontal: 4 }}
                            />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Animated label */}
                {starMeta && (
                    <View style={[styles.ratingLabel, { borderColor: `${starMeta.color}40` }]}>
                        <Text style={styles.ratingEmoji}>{starMeta.emoji}</Text>
                        <Text style={[styles.ratingLabelText, { color: starMeta.color }]}>{starMeta.label}</Text>
                    </View>
                )}

                {/* Tags */}
                {rating >= 3 && (
                    <View style={styles.tagsSection}>
                        <View style={styles.tagsHeader}>
                            <ThumbsUp size={16} color={PRIMARY} />
                            <Text style={styles.tagsTitle}>What did they do well?</Text>
                        </View>
                        <View style={styles.tagsWrap}>
                            {PRAISE_TAGS.map(tag => {
                                const selected = selectedTags.includes(tag);
                                return (
                                    <TouchableOpacity
                                        key={tag}
                                        style={[styles.tag, selected && styles.tagActive]}
                                        onPress={() => toggleTag(tag)}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[styles.tagText, selected && styles.tagTextActive]}>
                                            {tag}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Written review */}
                <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Add a comment (optional)</Text>
                    <TextInput
                        style={styles.reviewInput}
                        placeholder="Tell others about your experience..."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        numberOfLines={4}
                        value={review}
                        onChangeText={setReview}
                        textAlignVertical="top"
                        maxLength={500}
                    />
                    <Text style={styles.charCount}>{review.length}/500</Text>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Footer submit */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
                    onPress={submitRating}
                    disabled={loading || rating === 0}
                    activeOpacity={0.85}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.submitBtnText}>Submit Feedback</Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFF' },
    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
    scroll: { paddingHorizontal: 20, paddingTop: 24 },
    // Worker card
    workerCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16,
        marginBottom: 28, borderWidth: 1, borderColor: '#E5E7EB',
    },
    workerAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    workerInitial: { fontSize: 22, fontWeight: '800', color: PRIMARY },
    workerName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
    workerService: { fontSize: 12, color: '#9CA3AF' },
    // Stars
    question: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 20 },
    starsRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
    ratingLabel: {
        flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center',
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        borderWidth: 1.5, marginBottom: 24,
    },
    ratingEmoji: { fontSize: 20 },
    ratingLabelText: { fontSize: 16, fontWeight: '700' },
    // Tags
    tagsSection: { marginBottom: 24 },
    tagsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    tagsTitle: { fontSize: 14, fontWeight: '700', color: '#374151' },
    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
    tagActive: { backgroundColor: '#EEF2FF', borderColor: PRIMARY },
    tagText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    tagTextActive: { color: PRIMARY, fontWeight: '700' },
    // Review input
    reviewSection: { marginBottom: 16 },
    reviewLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
    reviewInput: {
        backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5,
        borderColor: '#E5E7EB', padding: 14, fontSize: 14, color: '#111827',
        minHeight: 110,
    },
    charCount: { fontSize: 11, color: '#D1D5DB', textAlign: 'right', marginTop: 4 },
    // Footer
    footer: { padding: 16, paddingBottom: 32, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FFF' },
    submitBtn: {
        height: 54, borderRadius: 14, backgroundColor: PRIMARY,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    submitBtnDisabled: { backgroundColor: '#C7D2FE', shadowOpacity: 0 },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
    // Success state
    successRoot: { flex: 1, backgroundColor: '#FFF' },
    successContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
    successEmoji: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    successTitle: { fontSize: 28, fontWeight: '900', color: '#111827', marginBottom: 10 },
    successSub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    ratingDisplay: { flexDirection: 'row', gap: 6, marginBottom: 32 },
    doneBtn: { width: '100%', height: 52, borderRadius: 14, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },
    doneBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
