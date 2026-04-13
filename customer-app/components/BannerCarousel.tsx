import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    Image,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 40) * 0.9;
const HEIGHT = 162;
const SPACING = 12;

export interface Banner {
    id: string;
    title?: string;
    subtitle?: string;
    image_url: string;
    badge_text?: string;
    deep_link?: string;
}

interface Props {
    banners: Banner[];
}

export default function BannerCarousel({ banners }: Props) {
    const router = useRouter();
    const scrollRef = useRef<ScrollView>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        if (banners.length <= 1) return;

        const interval = setInterval(() => {
            const nextIndex = (activeIndex + 1) % banners.length;
            scrollRef.current?.scrollTo({
                x: nextIndex * (CARD_WIDTH + SPACING),
                animated: true
            });
            setActiveIndex(nextIndex);
        }, 5000);

        return () => clearInterval(interval);
    }, [activeIndex, banners.length]);

    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = Math.floor(event.nativeEvent.contentOffset.x / (CARD_WIDTH + SPACING));
        if (index !== activeIndex && index >= 0 && index < banners.length) {
            setActiveIndex(index);
        }
    };

    const handlePress = (banner: Banner) => {
        if (banner.deep_link) {
            router.push(banner.deep_link as any);
        }
    };

    if (!banners || banners.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                snapToInterval={CARD_WIDTH + SPACING}
                decelerationRate="fast"
                onScroll={onScroll}
                scrollEventThrottle={16}
            >
                {banners.map((item) => (
                    <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.9}
                        onPress={() => handlePress(item)}
                        style={styles.card}
                    >
                        <Image source={{ uri: item.image_url }} style={styles.image} />

                        <View style={styles.overlay}>
                            {item.badge_text && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{item.badge_text}</Text>
                                </View>
                            )}
                            <View style={styles.bottomContent}>
                                {item.title && <Text style={styles.title}>{item.title}</Text>}
                                {item.subtitle && <Text style={styles.subtitle}>{item.subtitle}</Text>}
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.pagination}>
                {banners.map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            i === activeIndex && styles.activeDot
                        ]}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: 10,
    },
    scrollContent: {
        paddingHorizontal: 20,
        gap: SPACING,
    },
    card: {
        width: CARD_WIDTH,
        height: HEIGHT,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
    },
    image: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: 20,
        justifyContent: 'space-between',
    },
    badge: {
        alignSelf: 'flex-start',
        backgroundColor: '#FF3B30',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    bottomContent: {
        gap: 4,
    },
    title: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '800',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
        fontWeight: '600',
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#E5E7EB',
    },
    activeDot: {
        width: 20,
        backgroundColor: '#1A3FFF',
    },
});
