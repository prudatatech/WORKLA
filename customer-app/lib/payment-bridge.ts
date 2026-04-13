import { supabase } from './supabase';

/**
 * Workla Payment Bridge
 * Handles transaction initiation and status updates with the backend.
 * No gimmicks - every call affects the 'payments' table.
 */
export const PaymentBridge = {
    /**
     * Initializes a payment record in the 'payments' table.
     * Returns a local transaction ID for tracking.
     */
    async initializePayment(bookingId: string, amount: number, customerId: string, providerId?: string) {
        const { data, error } = await supabase
            .from('payments')
            .insert({
                booking_id: bookingId,
                customer_id: customerId,
                provider_id: providerId,
                amount: amount,
                status: 'pending',
            })
            .select('id')
            .single();

        if (error) throw error;
        return data.id;
    },

    /**
     * Updates a payment status after a Razorpay response.
     */
    async completePayment(paymentId: string, details: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
        method: string;
        status: 'captured' | 'failed';
    }) {
        const { error } = await supabase
            .from('payments')
            .update({
                ...details,
                updated_at: new Date().toISOString(),
            })
            .eq('id', paymentId);

        if (error) throw error;

        // If captured, we could trigger a server-side credit to the provider's wallet here
        // But better to do that via a DB Trigger on 'payments' status check.
        return true;
    }
};
