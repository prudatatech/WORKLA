import { Linking } from 'react-native';

/**
 * Formats a phone number string to Indian standard: +91 XXXXX XXXXX
 * @param phone Raw phone number (e.g. 9876543210, +919876543210)
 */
export const formatIndianPhone = (phone: string | null | undefined): string => {
    if (!phone) return 'N/A';
    
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // If it starts with 91 and has 12 digits, treat it as having prefix
    // If it has 10 digits, it's just the mobile part
    let mobile = digits;
    if (digits.length === 12 && digits.startsWith('91')) {
        mobile = digits.slice(2);
    } else if (digits.length > 10) {
        // Fallback for weird lengths, just take last 10
        mobile = digits.slice(-10);
    }
    
    if (mobile.length !== 10) return phone; // Fallback to raw if logic fails
    
    return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
};

/**
 * Initiates a phone call with +91 prefix and no spaces
 * @param phone Raw phone number
 */
export const initiateCall = (phone: string | null | undefined) => {
    if (!phone) return;
    
    // Clean to digits only
    let digits = phone.replace(/\D/g, '');
    
    // Ensure +91 prefix
    if (digits.length === 10) {
        digits = `91${digits}`;
    } else if (digits.length > 10 && !digits.startsWith('91')) {
        // Handle case where it might have a different prefix, but we force 91
        digits = `91${digits.slice(-10)}`;
    }
    
    Linking.openURL(`tel:+${digits}`);
};
