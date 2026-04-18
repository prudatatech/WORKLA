/**
 * Formats a phone number to show country code +91 with a space.
 * Example: +91 9876543210
 */
export function formatPhone(phone: string | null | undefined): string {
    if (!phone) return 'No phone';
    
    // Remove all non-numeric characters for processing
    let digits = phone.replace(/\D/g, '');
    
    // Handle India country code correctly
    if (digits.startsWith('91') && digits.length > 10) {
        return `+91 ${digits.slice(2)}`;
    }
    
    if (digits.length === 10) {
        return `+91 ${digits}`;
    }
    
    // Return original if it doesn't match standard 10-digit formats
    return phone;
}
