'use client';

import { 
    X, 
    User, 
    Wrench, 
    Clock, 
    MapPin, 
    IndianRupee, 
    ShieldCheck, 
    Image as ImageIcon,
    Calendar,
    ArrowRight
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface BookingSidebarProps {
    bookingId: string | null;
    onClose: () => void;
    onViewProvider: (providerId: string) => void;
    onViewCustomer: (customerId: string) => void;
}

export default function BookingSidebar({ bookingId, onClose, onViewProvider, onViewCustomer }: BookingSidebarProps) {
    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        if (bookingId) {
            fetchBookingDetail();
        }
    }, [bookingId]);

    const fetchBookingDetail = async () => {
        setLoading(true);
        try {
            // We use the new rich detail endpoint or direct supabase join
            const { data, error } = await supabase
                .from('bookings')
                .select(`
                    *,
                    customer:profiles!bookings_customer_id_fkey(*),
                    provider:profiles!bookings_provider_id_fkey(*, provider_details(*)),
                    review:booking_reviews(*)
                `)
                .eq('id', bookingId)
                .single();

            if (data) setBooking(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!bookingId) return null;

    return (
        <div className={`fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-500 ease-out border-l border-gray-100 ${bookingId ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Booking Detail</span>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
                            #{booking?.booking_number || (typeof bookingId === 'string' ? bookingId.slice(0, 8).toUpperCase() : 'BOOKING')}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all border border-transparent hover:border-gray-200 text-gray-400 hover:text-gray-900">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-4 text-gray-400">
                            <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-bold uppercase tracking-widest">Hydrating Context...</p>
                        </div>
                    ) : booking && (
                        <>
                            {/* 1. Status Badge */}
                            <section>
                                <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 shadow-sm">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-xs font-black uppercase tracking-widest">{booking.status?.replace('_', ' ')}</span>
                                </div>
                            </section>

                            {/* 2. Customer Profile */}
                            <section className="space-y-4">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Client Persona</h3>
                                <button 
                                    onClick={() => onViewCustomer(booking.customer_id)}
                                    className="w-full text-left flex items-center gap-5 p-5 bg-gray-50 rounded-[28px] border border-gray-100 transition-all hover:border-blue-200 group"
                                >
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-gray-200 group-hover:border-blue-100 transition-colors">
                                        <User className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-lg font-black text-gray-900 leading-none group-hover:text-blue-600 transition-colors">{booking.customer?.full_name}</p>
                                        <p className="text-xs font-bold text-gray-500 mt-1.5">{booking.customer?.phone}</p>
                                        <p className="text-xs font-medium text-blue-600 mt-0.5">{booking.customer?.email}</p>
                                    </div>
                                </button>
                            </section>

                            {/* 3. Service Details */}
                            <section className="space-y-4 text-gray-900 leading-tight">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Service Specification</h3>
                                <div className="p-6 bg-white rounded-[28px] border border-gray-100 shadow-sm space-y-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                                            <Wrench className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900">{booking.service_name_snapshot}</p>
                                            <p className="text-xs font-bold text-gray-500 mt-1 italic italic">Schedule: {booking.scheduled_date} @ {booking.scheduled_time_slot}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                                            <MapPin className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-800 leading-snug">{booking.customer_address}</p>
                                            <p className="text-[10px] text-gray-400 mt-1 uppercase font-black">Precise Location Set</p>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Valuation</p>
                                            <div className="flex items-center gap-1 mt-1 text-gray-900 leading-tight">
                                                <IndianRupee className="w-5 h-5" />
                                                <span className="text-2xl font-black">{booking.total_amount?.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment</p>
                                            <p className="text-xs font-black text-green-600 mt-1 uppercase tracking-widest">{booking.payment_status}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 4. Provider Assignment */}
                            <section className="space-y-4">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Assigned Partner</h3>
                                {booking.provider ? (
                                    <button 
                                        onClick={() => onViewProvider(booking.provider_id)}
                                        className="w-full flex items-center gap-5 p-5 bg-indigo-50/50 rounded-[28px] border border-indigo-100 hover:border-indigo-300 transition-all text-left group"
                                    >
                                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-indigo-200">
                                            <ShieldCheck className="w-8 h-8 text-indigo-500" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-lg font-black text-indigo-900 leading-none">{booking.provider?.full_name}</p>
                                            <p className="text-xs font-bold text-indigo-600 mt-1.5 uppercase tracking-widest leading-tight">
                                                {booking.provider?.provider_details?.[0]?.business_name || 'Individual Pro'}
                                            </p>
                                            <div className="mt-2 flex items-center gap-1 text-[10px] font-black text-blue-600">
                                                VIEW PARTNER PROFILE <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </div>
                                    </button>
                                ) : (
                                    <div className="p-8 border-2 border-dashed border-gray-200 rounded-[28px] flex flex-col items-center justify-center text-gray-400 gap-3">
                                        <Clock className="w-8 h-8 opacity-20" />
                                        <p className="text-xs font-bold uppercase tracking-widest">Manual Dispatch Needed</p>
                                    </div>
                                )}
                            </section>

                            {/* 5. Work Evidence (Photos) */}
                            {(booking.work_proof_start_url || booking.work_proof_complete_url) && (
                                <section className="space-y-4">
                                    <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Work Evidence</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {booking.work_proof_start_url ? (
                                            <div className="space-y-2">
                                                <div className="aspect-square bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 shadow-inner">
                                                    <img src={booking.work_proof_start_url} className="w-full h-full object-cover" alt="Start Proof" />
                                                </div>
                                                <p className="text-[10px] font-black text-gray-500 text-center uppercase tracking-widest">Before Work</p>
                                            </div>
                                        ) : (
                                            <div className="aspect-square bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-2">
                                                <ImageIcon className="w-6 h-6 opacity-30" />
                                                <p className="text-[8px] font-black tracking-widest">NO START PHOTO</p>
                                            </div>
                                        )}
                                        {booking.work_proof_complete_url ? (
                                            <div className="space-y-2">
                                                <div className="aspect-square bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 shadow-inner">
                                                    <img src={booking.work_proof_complete_url} className="w-full h-full object-cover" alt="Complete Proof" />
                                                </div>
                                                <p className="text-[10px] font-black text-gray-500 text-center uppercase tracking-widest">After Work</p>
                                            </div>
                                        ) : (
                                            <div className="aspect-square bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-2">
                                                <ImageIcon className="w-6 h-6 opacity-30" />
                                                <p className="text-[8px] font-black tracking-widest">NO FINAL PHOTO</p>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* 6. Rating/Review */}
                            {booking.review?.[0] && (
                                <section className="space-y-4">
                                    <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Customer Feedback</h3>
                                    <div className="p-6 bg-amber-50/50 border border-amber-100 rounded-[28px] space-y-2 leading-tight">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            {[...Array(5)].map((_, i) => (
                                                <div key={i} className={`w-3 h-3 rounded-full ${i < booking.review[0].rating ? 'bg-amber-500' : 'bg-gray-200'}`} />
                                            ))}
                                        </div>
                                        <p className="text-sm font-bold text-gray-800 italic">"{booking.review[0].comment}"</p>
                                        <p className="text-[10px] font-black text-amber-700 tracking-widest uppercase mt-2">Verified Feedback</p>
                                    </div>
                                </section>
                            )}

                            <div className="h-20" />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
