import { Zap } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Extrapolate,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming
} from 'react-native-reanimated';

const PRIMARY = '#1A3FFF';

function Pulse({ delay }: { delay: number }) {
    const animation = useSharedValue(0);

    useEffect(() => {
        animation.value = withDelay(
            delay,
            withRepeat(
                withTiming(1, { duration: 2500 }),
                -1,
                false
            )
        );
    }, [delay, animation]);

    const animatedStyle = useAnimatedStyle(() => {
        const scale = interpolate(animation.value, [0, 1], [1, 3.5]);
        const opacity = interpolate(
            animation.value,
            [0, 0.2, 0.8, 1],
            [0, 0.4, 0.1, 0],
            Extrapolate.CLAMP
        );

        return {
            transform: [{ scale }],
            opacity,
        };
    });

    return <Animated.View style={[styles.pulse, animatedStyle]} />;
}

export default function SearchingProvider({ serviceName }: { serviceName: string }) {
    return (
        <View style={styles.container}>
            <View style={styles.radarContainer}>
                <Pulse delay={0} />
                <Pulse delay={800} />
                <Pulse delay={1600} />

                <Animated.View style={styles.centerCircle}>
                    <Zap size={34} color="#FFF" fill="#FFF" />
                </Animated.View>
            </View>

            <View style={styles.textContainer}>
                <Text style={styles.title}>Searching for service partners...</Text>
                <Text style={styles.subtitle}>
                    Sit back and relax. We&apos;re matching your <Text style={styles.bold}>{serviceName}</Text> request with the highest-rated service partners nearby.
                </Text>
            </View>

            <View style={styles.tipContainer}>
                <View style={styles.tipBadge}>
                    <Zap size={12} color="#FFF" fill="#FFF" />
                    <Text style={styles.tipBadgeText}>QUICK CONNECT</Text>
                </View>
                <Text style={styles.tipText}>The first available service partner to accept will be assigned immediately to ensure the fastest ETA.</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    radarContainer: {
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 60,
    },
    pulse: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: PRIMARY,
    },
    centerCircle: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
        elevation: 12,
        zIndex: 10,
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -0.8,
    },
    subtitle: {
        fontSize: 16,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 10,
    },
    bold: {
        fontWeight: '700',
        color: PRIMARY,
    },
    tipContainer: {
        backgroundColor: '#F8FAFC',
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        alignItems: 'center',
    },
    tipBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: PRIMARY,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 10,
    },
    tipBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFF',
        letterSpacing: 1,
    },
    tipText: {
        fontSize: 13,
        color: '#64748B',
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 19,
    },
});
