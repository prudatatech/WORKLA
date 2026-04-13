import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../lib/supabase';
import { Buffer } from 'buffer';
import QRCode from 'qrcode';

export class InvoiceService {
    /**
     * Generates a GST-compliant PDF invoice/credit note and uploads it to Supabase Storage.
     * @param bookingId The ID of the completed booking.
     * @param type The type of document (INVOICE or CREDIT_NOTE).
     */
    static async generateInvoice(bookingId: string, type: 'INVOICE' | 'CREDIT_NOTE' = 'INVOICE') {
        console.warn(`[InvoiceService] Initiating ${type} generation for booking: ${bookingId}`);

        try {
            // 1. Fetch normalized data from the helper RPC
            const { data: invoiceData, error: fetchError } = await supabaseAdmin.rpc('get_invoice_data', {
                p_booking_id: bookingId
            });

            // If entry doesn't exist, we create it. 
            // NOTE: In a Credit Note scenario, we might want to create a separate record.
            // For now, if we are upgrading an existing invoice to a Credit Note (refund case).
            if (fetchError || !invoiceData) {
                console.warn(`[InvoiceService] Record not found. Creating a new one for booking: ${bookingId}`);
                
                const { data: booking, error: bError } = await supabaseAdmin
                    .from('bookings')
                    .select('customer_id, provider_id, total_amount, tax_amount, platform_fee, scheduled_date')
                    .eq('id', bookingId)
                    .single();

                if (bError || !booking) throw new Error('BOOKING_NOT_FOUND');

                const tax = Number(booking.tax_amount || 0);
                const { data: invNum } = await supabaseAdmin.rpc('generate_invoice_number');

                const { error: invError } = await supabaseAdmin
                    .from('invoices')
                    .upsert({
                        booking_id: bookingId,
                        scheduled_date: booking.scheduled_date,
                        invoice_number: invNum,
                        customer_id: booking.customer_id,
                        provider_id: booking.provider_id,
                        total_amount: booking.total_amount,
                        tax_amount: tax,
                        cgst_amount: (tax / 2).toFixed(2),
                        sgst_amount: (tax / 2).toFixed(2),
                        platform_fee: booking.platform_fee || 0,
                        invoice_type: type,
                        status: 'generated'
                    }, { onConflict: 'booking_id', ignoreDuplicates: false });

                if (invError) throw invError;
                
                const { data: finalData, error: fError } = await supabaseAdmin.rpc('get_invoice_data', {
                    p_booking_id: bookingId
                });
                
                if (fError) throw fError;
                return await this.processPDF(finalData, bookingId);
            }

            // Update type if mismatched (e.g. was INVOICE, now needs CREDIT_NOTE)
            if (invoiceData.invoice_type !== type) {
                await supabaseAdmin.from('invoices').update({ invoice_type: type }).eq('booking_id', bookingId);
                invoiceData.invoice_type = type;
            }

            return await this.processPDF(invoiceData, bookingId);
        } catch (err) {
            console.error(`🚨 [InvoiceService] Fatal error in invoice flow:`, err);
            throw err;
        }
    }

    private static async processPDF(data: any, bookingId: string) {
        const pdfBuffer = await this.createPDF(data);
        const filePath = `invoices/${data.invoice_number}.pdf`;
        
        const { error: uploadError } = await supabaseAdmin.storage
            .from('invoices')
            .upload(filePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw new Error('STORAGE_UPLOAD_FAILED');

        await supabaseAdmin
            .from('invoices')
            .update({ storage_path: filePath, updated_at: new Date().toISOString() })
            .eq('booking_id', bookingId);

        return { invoiceNumber: data.invoice_number, path: filePath };
    }

    private static async createPDF(data: any): Promise<Buffer> {
        // Generate QR Code Buffer
        // In a real app, this would be a validation URL or UPI deep link
        const qrContent = `https://workla.tech/verify/invoice/${data.invoice_number}`;
        const qrBuffer = await QRCode.toBuffer(qrContent, { width: 100, margin: 1 });

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const buffers: Buffer[] = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            const isCreditNote = data.invoice_type === 'CREDIT_NOTE';
            const accentColor = isCreditNote ? '#DC2626' : '#1A3FFF'; // Red for credit note, Blue for invoice

            // --- Header ---
            doc.font('Helvetica-Bold').fillColor(accentColor).fontSize(26).text('WORKLA', 50, 50).font('Helvetica');
            doc.fillColor('#4B5563').fontSize(10).text('Premium On-Demand Services', 50, 80);
            
            doc.font('Helvetica-Bold').fillColor('#111827').fontSize(18).text(isCreditNote ? 'CREDIT NOTE' : 'TAX INVOICE', 400, 50, { align: 'right' }).font('Helvetica');
            doc.fontSize(10).text(`${isCreditNote ? 'CN' : 'Inv'} #: ${data.invoice_number}`, 400, 75, { align: 'right' });
            doc.text(`Date: ${new Date(data.created_at).toLocaleDateString('en-IN')}`, 400, 90, { align: 'right' });

            doc.moveTo(50, 110).lineTo(550, 110).stroke('#E5E7EB');

            // --- Parties ---
            doc.fontSize(10).fillColor('#6B7280').text('FROM:', 50, 130);
            doc.font('Helvetica-Bold').fillColor('#111827').text('Workla Tech Private Limited', 50, 145).font('Helvetica');
            doc.text('GSTIN: 29AAAAA0000A1Z5');
            doc.text('Place of Supply: Karnataka (29)');
            doc.text('Bangalore, Karnataka - 560102');

            doc.fillColor('#6B7280').text('BILL TO:', 350, 130);
            doc.font('Helvetica-Bold').fillColor('#111827').text(data.customer_name, 350, 145).font('Helvetica');
            doc.text(`Phone: ${data.customer_phone}`);
            if (data.customer_gstin) doc.text(`GSTIN: ${data.customer_gstin}`);
            doc.text(`State: ${data.customer_place_of_supply || 'Not Specified'}`);
            doc.text(data.customer_address || 'Address snapshot per booking', { width: 200 });

            // --- Table ---
            const tableTop = 250;
            doc.fillColor('#F9FAFB').rect(50, tableTop, 500, 25).fill();
            doc.fillColor('#4B5563').fontSize(10);
            doc.text('Description', 60, tableTop + 8);
            doc.text('SAC', 300, tableTop + 8);
            doc.text('Amount (INR)', 450, tableTop + 8, { align: 'right' });

            doc.fillColor('#111827');
            const itemY = tableTop + 35;
            doc.text(data.service_name, 60, itemY);
            doc.text(data.sac_code || '9987', 300, itemY);
            const taxableValue = (data.total_amount - data.tax_amount).toFixed(2);
            doc.text(taxableValue, 450, itemY, { align: 'right' });

            doc.moveTo(50, itemY + 20).lineTo(550, itemY + 20).stroke('#F3F4F6');

            // --- Totals ---
            const summaryY = itemY + 40;
            const isIGST = data.customer_place_of_supply && data.customer_place_of_supply.toLowerCase() !== 'karnataka';
            
            doc.text('Taxable Value', 350, summaryY);
            doc.text(taxableValue, 450, summaryY, { align: 'right' });

            if (isIGST) {
                doc.text('IGST (18%)', 350, summaryY + 20);
                doc.text(data.tax_amount.toString(), 450, summaryY + 20, { align: 'right' });
            } else {
                doc.text('CGST (9%)', 350, summaryY + 20);
                doc.text(data.cgst.toString(), 450, summaryY + 20, { align: 'right' });
                doc.text('SGST (9%)', 350, summaryY + 40);
                doc.text(data.sgst.toString(), 450, summaryY + 40, { align: 'right' });
            }

            doc.moveTo(350, summaryY + 55).lineTo(550, summaryY + 55).stroke('#111827');
            
            doc.font('Helvetica-Bold').fontSize(12).fillColor(accentColor).text(isCreditNote ? 'Credit Amount' : 'Total Amount', 350, summaryY + 65).font('Helvetica');
            doc.font('Helvetica-Bold').fontSize(12).text(`INR ${data.total_amount}`, 450, summaryY + 65, { align: 'right' }).font('Helvetica');

            // --- Professional Polish ---
            // QR Code at bottom right
            doc.image(qrBuffer, 460, 680, { width: 80 });
            doc.fontSize(8).fillColor('#9CA3AF').text('Scan to verify invoice authenticity', 450, 765, { align: 'right' });

            // Terms
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#6B7280').text('Notes & Terms:', 50, 680).font('Helvetica');
            doc.text('1. Payment is non-refundable unless specified otherwise.', 50, 695);
            doc.text('2. Please contact support@workla.tech for any discrepancies.', 50, 705);

            doc.fontSize(8).fillColor('#9CA3AF').text(
                'This is a computer-generated document and does not require a physical signature.',
                50, 780, { align: 'center' }
            );

            doc.end();
        });
    }
}
