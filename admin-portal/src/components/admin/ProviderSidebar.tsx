'use client';

import { 
    X, 
    User, 
    ShieldCheck, 
    Star, 
    Calendar, 
    IndianRupee, 
    Clock, 
    ChevronRight,
    MapPin,
    FileText,
    Activity,
    XCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface ProviderSidebarProps {
    providerId: string | null;
    onClose: () => void;
    onViewBooking: (bookingId: string) => void;
    onStatusUpdate?: () => void;
}

import { adminApi } from '@/utils/api';

export default function ProviderSidebar({ providerId, onClose, onViewBooking, onStatusUpdate }: ProviderSidebarProps) {
    const [provider, setProvider] = useState<any>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (providerId) {
            fetchProviderDetail();
        }
    }, [providerId]);

    const fetchProviderDetail = async () => {
        setLoading(true);
        try {
            // Fetch provider profile + recent bookings via backend admin API
            // (uses supabaseAdmin with service_role key, bypasses RLS)
            const { data, error } = await adminApi.get(`/api/v1/admin/providers/${providerId}`);

            if (data) {
                setProvider({ ...data, recentBookings: data.recentBookings || [] });

                // Fetch Documents (via backend to get signed URLs)
                const { data: docsRes } = await adminApi.get(`/api/v1/admin/providers/${providerId}/documents`);
                if (docsRes) setDocuments(docsRes);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (status: string) => {
        setUpdating(true);
        try {
            const { error } = await adminApi.patch(`/api/v1/admin/providers/${providerId}`, {
                verification_status: status
            });
            if (!error) {
                if (onStatusUpdate) onStatusUpdate();
                onClose();
            }
        } catch (err) {
            console.error('Failed to update status:', err);
        } finally {
            setUpdating(false);
        }
    };

    if (!providerId) return null;

    return (
        <div className={`fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-500 ease-out border-l border-gray-100 ${providerId ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Partner Intelligence</span>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
                            {provider?.full_name || 'Loading...'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all border border-transparent hover:border-gray-200 text-gray-400 hover:text-gray-900">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-4 text-gray-400">
                            <div className="w-8 h-8 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-bold uppercase tracking-widest">Compiling Profile...</p>
                        </div>
                    ) : provider && (
                        <>
                            {/* 1. Profile Header */}
                            <section className="flex items-center gap-6 p-6 bg-indigo-900 rounded-[32px] text-white shadow-xl shadow-indigo-200 overflow-hidden relative">
                                <Activity className="absolute -right-4 -bottom-4 w-32 h-32 text-indigo-800 opacity-20" />
                                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden border-2 border-indigo-700/50">
                                    {provider.avatar_url ? (
                                        <img src={provider.avatar_url} className="w-full h-full object-cover" alt="Avatar" />
                                    ) : (
                                        <User className="w-10 h-10 text-indigo-600" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-black tracking-tight">{ (Array.isArray(provider.provider_details) ? provider.provider_details[0] : provider.provider_details)?.business_name || 'Individual Partner'}</h3>
                                    <div className="flex items-center gap-2 mt-1 px-3 py-1 bg-white/10 rounded-lg w-fit">
                                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-100">{ (Array.isArray(provider.provider_details) ? provider.provider_details[0] : provider.provider_details)?.verification_status}</span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-4">
                                        <div className="text-center">
                                            <p className="text-[10px] font-black text-indigo-300 uppercase">Rating</p>
                                            <p className="text-lg font-black">{provider.average_rating?.toFixed(1) || '0.0'}</p>
                                        </div>
                                        <div className="w-px h-8 bg-white/10" />
                                        <div className="text-center">
                                            <p className="text-[10px] font-black text-indigo-300 uppercase">Jobs</p>
                                            <p className="text-lg font-black">{provider.total_jobs_completed || 0}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 2. Contact Grid */}
                            <section className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Direct Line</p>
                                    <p className="text-sm font-bold text-gray-900">{provider.phone}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email Channel</p>
                                    <p className="text-sm font-bold text-gray-900 truncate">{provider.email}</p>
                                </div>
                            </section>

                            {/* 3. Operational Timeline */}
                            <section className="space-y-4">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Live History</h3>
                                <div className="space-y-3">
                                    {provider.recentBookings?.length > 0 ? provider.recentBookings.map((b: any) => (
                                        <button 
                                            key={b.id}
                                            onClick={() => onViewBooking(b.id)}
                                            className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-indigo-200 hover:shadow-lg transition-all text-left group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                                                    <Clock className="w-5 h-5 text-gray-400" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-gray-900 uppercase">#{b.booking_number}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 mt-0.5">{b.service_name_snapshot}</p>
                                                </div>
                                            </div>
                                            <div className="text-right flex items-center gap-4">
                                                <div>
                                                    <p className="text-xs font-black text-green-600">₹{b.total_amount}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 capitalize">{b.status}</p>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                                            </div>
                                        </button>
                                    )) : (
                                        <div className="p-10 border-2 border-dashed border-gray-100 rounded-[32px] text-center text-gray-300">
                                            <Calendar className="w-10 h-10 mx-auto opacity-20 mb-3" />
                                            <p className="text-xs font-bold uppercase tracking-widest">No Recent Activity</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* 4. Infrastructure & Documents */}
                            <section className="space-y-4">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Verification Assets</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {documents.length > 0 ? documents.map((doc) => (
                                        <div key={doc.id} className="p-5 bg-white border border-gray-100 rounded-[28px] space-y-3 shadow-sm hover:border-blue-100 transition-colors">
                                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                                <FileText className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-900 uppercase leading-none">{doc.document_type.replace('_', ' ')}</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">Uploaded Assets</p>
                                            </div>
                                            <button 
                                                onClick={() => doc.viewUrl && window.open(doc.viewUrl, '_blank')}
                                                className="w-full py-2 bg-gray-50 text-[10px] font-black text-gray-500 rounded-lg hover:bg-blue-600 hover:text-white transition-all uppercase tracking-widest"
                                            >
                                                View Document
                                            </button>
                                        </div>
                                    )) : (
                                        <div className="col-span-2 p-10 border-2 border-dashed border-gray-100 rounded-[32px] text-center text-gray-300">
                                            <FileText className="w-10 h-10 mx-auto opacity-20 mb-3" />
                                            <p className="text-xs font-bold uppercase tracking-widest">No Documents Uploaded</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* 5. Approval Footer */}
                            {((Array.isArray(provider.provider_details) ? provider.provider_details[0] : provider.provider_details)?.verification_status !== 'verified') && (
                                <section className="p-6 bg-gray-50 rounded-[32px] border border-gray-100 space-y-4">
                                    <div className="flex items-center gap-4">
                                        <button 
                                            disabled={updating}
                                            onClick={() => handleStatusUpdate('reverify')}
                                            className="flex-1 py-4 bg-white border border-red-100 text-red-600 text-xs font-black rounded-[20px] hover:bg-red-50 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                                        >
                                            <XCircle className="w-4 h-4" />
                                            Needs Update
                                        </button>
                                        <button 
                                            disabled={updating}
                                            onClick={() => handleStatusUpdate('verified')}
                                            className="flex-[2] py-4 bg-green-600 text-white text-xs font-black rounded-[20px] shadow-lg shadow-green-100 hover:bg-green-700 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                                        >
                                            {updating ? 'Processing...' : (
                                                <>
                                                    <ShieldCheck className="w-4 h-4" />
                                                    Approve Partner
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-center text-gray-400 font-bold uppercase tracking-widest">This action will instantly notify the provider and unlock their dashboard.</p>
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
