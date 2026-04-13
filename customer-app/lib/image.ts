import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

/**
 * Opens the image picker and compresses the selected image
 * @param quality 0 to 1 (default 0.7)
 * @param maxWidth maximum width in pixels (default 1080)
 * @returns Compressed image object or null if cancelled
 */
export async function pickAndCompressImage(
    quality: number = 0.7,
    maxWidth: number = 1080
) {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
        throw new Error('Camera roll permissions are required to upload images.');
    }

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio is good for profiles/proofs
        quality: 1, // Start with max quality, compress later
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
        return null; // User cancelled
    }

    const asset = result.assets[0];

    // Compress and Resize
    try {
        const compressed = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: Math.min(asset.width, maxWidth) } }],
            { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
        );
        return compressed;
    } catch (e) {
        console.error('Image compression failed:', e);
        // Fallback to original if compression fails
        return asset;
    }
}

/**
 * Helps format the image file for Supabase storage uploading
 * @param uri Local file URI from ImageManipulator
 */
export function prepareImageForSupabase(uri: string) {
    const ext = uri.substring(uri.lastIndexOf('.') + 1);
    const fileName = uri.replace(/^.*[\\\/]/, '');

    // Form data needs URI, type, and name
    return {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        name: fileName,
    };
}
