import { supabaseAdmin } from '../lib/supabase';

export interface DocumentReviewInput {
    documentId: string;
    status: 'verified' | 'rejected';
    rejectionReason?: string;
}

export class VerificationService {
    /**
     * Fetch all pending document verifications for admin.
     */
    static async getPendingVerifications() {
        const { data, error } = await supabaseAdmin
            .from('admin_pending_verifications')
            .select('*');

        if (error) throw error;

        // Generate signed URLs for each pending document
        const enrichedData = await Promise.all(
            data.map(async (doc: any) => {
                // Extract relative path from stored URL or use if it's already a path
                // If it's a full URL, we extract after 'provider-documents/'
                const pathMatch = doc.document_url.match(/provider-documents\/(.+)$/);
                const path = pathMatch ? pathMatch[1] : doc.document_url;

                const { data: signedData, error: signedError } = await supabaseAdmin.storage
                    .from('provider-documents')
                    .createSignedUrl(path, 3600); // 1 hour link

                return {
                    ...doc,
                    document_url: signedError ? null : signedData?.signedUrl
                };
            })
        );

        return enrichedData;
    }

    /**
     * Submit a document for verification.
     */
    static async submitDocument(providerId: string, type: 'aadhaar' | 'pan', number: string, url: string) {
        // 1. Check for existing document to handle storage cleanup
        const { data: existing } = await supabaseAdmin
            .from('provider_documents')
            .select('document_url')
            .eq('provider_id', providerId)
            .eq('document_type', type)
            .single();

        // 2. Upsert the new record
        const { data, error } = await supabaseAdmin
            .from('provider_documents')
            .upsert({
                provider_id: providerId,
                document_type: type,
                document_number: number,
                document_url: url,
                verified_status: 'pending',
                rejection_reason: null
            }, { onConflict: 'provider_id, document_type' })
            .select()
            .single();

        if (error) throw error;

        // 3. Cleanup: Delete old file if it's different and was a path
        if (existing?.document_url && existing.document_url !== url) {
            const pathMatch = existing.document_url.match(/provider-documents\/(.+)$/);
            const oldPath = pathMatch ? pathMatch[1] : existing.document_url;
            
            // Only delete if it looks like a relative path in our bucket
            if (!oldPath.startsWith('http')) {
                await supabaseAdmin.storage
                    .from('provider-documents')
                    .remove([oldPath]);
            }
        }

        // Ensure provider_details reflects pending status
        await supabaseAdmin
            .from('provider_details')
            .update({ verification_status: 'pending' })
            .eq('provider_id', providerId)
            .neq('verification_status', 'verified');

        return data;
    }

    /**
     * Perform admin review of a document.
     */
    static async reviewDocument(input: DocumentReviewInput) {
        const { data, error } = await supabaseAdmin.rpc('review_provider_document', {
            p_document_id: input.documentId,
            p_status: input.status,
            p_rejection_reason: input.rejectionReason || null
        });

        if (error) throw error;
        return data;
    }

    /**
     * Get verification status for a provider.
     */
    static async getProviderVerificationStatus(providerId: string) {
        const { data: documents, error: docError } = await supabaseAdmin
            .from('provider_documents')
            .select('*')
            .eq('provider_id', providerId);

        if (docError) throw docError;

        const { data: details, error: detError } = await supabaseAdmin
            .from('provider_details')
            .select('verification_status')
            .eq('provider_id', providerId)
            .single();

        if (detError) throw detError;

        return {
            status: details.verification_status,
            documents: documents || []
        };
    }
}
