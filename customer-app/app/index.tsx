import { useRouter } from 'expo-router';
import { ArrowRight, BadgeCheck, Shield, Sparkles } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Premium Services\nat Your Doorstep',
        desc: 'Book verified experts for plumbing, electrical, cleaning, and more in seconds.',
        icon: Sparkles,
        color: '#1A3FFF',
    },
    {
        id: '2',
        title: 'Verified Experts,\nGuaranteed Quality',
        desc: 'Every worker is background checked and skill-verified to ensure top-notch service.',
        icon: BadgeCheck,
        color: '#7C3AED',
    },
    {
        id: '3',
        title: 'Secure Payments\n& Wallet Rewards',
        desc: 'Pay safely via UPI or wallet and earn cashback rewards on every booking.',
        icon: Shield,
        color: '#059669',
    },
];

export default function EntryScreen() {
    const router = useRouter();
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const slidesRef = useRef<FlatList>(null);

    const onScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
        { useNativeDriver: false }
    );

    const viewableItemsChanged = useRef(({ viewableItems }: any) => {
        setCurrentIndex(viewableItems[0]?.index || 0);
    }).current;

    const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const scrollToNext = () => {
        if (currentIndex < SLIDES.length - 1) {
            slidesRef.current?.scrollToIndex({ index: currentIndex + 1 });
        } else {
            router.replace('/auth');
        }
    };

    const renderSlide = ({ item }: { item: typeof SLIDES[0] }) => {
        const Icon = item.icon;
        return (
            <View style={s.slide}>
                <View style={[s.imagePlaceholder, { backgroundColor: item.color + '10' }]}>
                    <View style={[s.iconBg, { backgroundColor: item.color + '20' }]}>
                        <Icon size={120} color={item.color} strokeWidth={1.5} />
                    </View>
                    <View style={[s.orb, { width: 140, height: 140, top: -40, right: -40, backgroundColor: item.color + '10' }]} />
                    <View style={[s.orb, { width: 80, height: 80, bottom: 20, left: -20, backgroundColor: item.color + '10' }]} />
                </View>

                <View style={s.textWrap}>
                    <Text style={s.title}>{item.title}</Text>
                    <Text style={s.desc}>{item.desc}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            <View style={s.topRow}>
                <Text style={s.logo}>Workla</Text>
                <TouchableOpacity onPress={() => router.replace('/auth')}>
                    <Text style={s.skipText}>Skip</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={SLIDES}
                renderItem={renderSlide}
                horizontal
                showsHorizontalScrollIndicator={false}
                pagingEnabled
                bounces={false}
                keyExtractor={(item) => item.id}
                onScroll={onScroll}
                onViewableItemsChanged={viewableItemsChanged}
                viewabilityConfig={viewConfig}
                ref={slidesRef}
            />

            <View style={s.footer}>
                <View style={s.paginator}>
                    {SLIDES.map((_, i) => {
                        const dotWidth = scrollX.interpolate({
                            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
                            outputRange: [10, 24, 10],
                            extrapolate: 'clamp',
                        });
                        const opacity = scrollX.interpolate({
                            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
                            outputRange: [0.3, 1, 0.3],
                            extrapolate: 'clamp',
                        });
                        return (
                            <Animated.View
                                key={i}
                                style={[s.dot, { width: dotWidth, opacity, backgroundColor: SLIDES[i].color }]}
                            />
                        );
                    })}
                </View>

                <TouchableOpacity style={[s.btn, { backgroundColor: SLIDES[currentIndex].color }]} onPress={scrollToNext} activeOpacity={0.8}>
                    <Text style={s.btnText}>{currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}</Text>
                    <ArrowRight size={18} color="#FFF" />
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFF' },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12 },
    logo: { fontSize: 22, fontWeight: '900', color: '#1A3FFF' },
    skipText: { fontSize: 15, fontWeight: '700', color: '#9CA3AF' },
    slide: { width, alignItems: 'center', paddingHorizontal: 40, paddingTop: height * 0.05 },
    imagePlaceholder: {
        width: width * 0.85,
        height: height * 0.35,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
        overflow: 'hidden',
        position: 'relative'
    },
    iconBg: {
        width: 180,
        height: 180,
        borderRadius: 90,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
    },
    orb: { position: 'absolute', borderRadius: 100 },
    textWrap: { alignItems: 'center' },
    title: { fontSize: 28, fontWeight: '900', color: '#111827', textAlign: 'center', lineHeight: 36, marginBottom: 16 },
    desc: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24 },
    footer: { paddingHorizontal: 40, paddingBottom: 60, alignItems: 'center' },
    paginator: { flexDirection: 'row', height: 10, marginBottom: 40 },
    dot: { height: 10, borderRadius: 5, marginHorizontal: 4 },
    btn: { width: '100%', height: 60, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
    btnText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
});
