import React from 'react';
import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

interface EmptyStateProps {
    title: string;
    description: string;
    imageSource?: any;
    ctaLabel?: string;
    onCtaPress?: () => void;
}

export default function EmptyState({
    title,
    description,
    imageSource,
    ctaLabel,
    onCtaPress,
}: EmptyStateProps) {
    return (
        <View style={styles.container}>
            {imageSource && (
                <View style={styles.imageContainer}>
                    <Image
                        source={imageSource}
                        style={styles.image}
                        resizeMode="contain"
                    />
                </View>
            )}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
            {ctaLabel && onCtaPress && (
                <TouchableOpacity style={styles.ctaButton} onPress={onCtaPress}>
                    <Text style={styles.ctaText}>{ctaLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        paddingVertical: 60,
    },
    imageContainer: {
        width: width * 0.6,
        height: width * 0.6,
        marginBottom: 24,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 8,
    },
    description: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    ctaButton: {
        backgroundColor: '#1A3FFF',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    ctaText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
