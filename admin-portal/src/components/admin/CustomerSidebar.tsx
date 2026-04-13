'use client';

import { 
    X, 
    User, 
    ShieldCheck, 
    Calendar, 
    IndianRupee, 
    Clock, 
    ChevronRight,
    MapPin,
    Activity,
    ShoppingBag,
    TrendingUp
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminApi } from '@/utils/api';

interface CustomerSidebarProps {
    customerId: string | null;
    onClose: () => void;
    onViewBooking: (bookingId: string) => void;
}

export default function CustomerSidebar({ customerId, onClose, onViewBooking }: CustomerSidebarProps) {
    const [customer, setCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (customerId) {
            fetchCustomerDetail();
        }
    }, [customerId]);

    const fetchCustomerDetail = async () => {
        setLoading(true);
        try {
            const { data, error } = await adminApi.get(`/api/v1/admin/customers/${customerId}`);
            if (data) {
                setCustomer(data);
            } else {
                console.error(error);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!customerId) return null;

    return (
        <>
            {/* Backdrop */}
            <div 
                className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-500 ${customerId ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            <div className={`fixed inset-y-0 right-0 w-[550px] bg-white shadow-2xl z-50 transform transition-transform duration-500 ease-out border-l border-gray-100 ${customerId ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                        <div>
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Consumer Persona</span>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
                                {customer?.full_name || 'Loading...'}
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
                                <p className="text-xs font-bold uppercase tracking-widest">Aggregating History...</p>
                            </div>
                        ) : customer && (
                            <>
                                {/* 1. Profile 360 Header */}
                                <section className="flex items-center gap-6 p-6 bg-blue-900 rounded-[32px] text-white shadow-xl shadow-blue-200 overflow-hidden relative">
                                    <ShoppingBag className="absolute -right-4 -bottom-4 w-32 h-32 text-blue-800 opacity-20" />
                                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden border-2 border-blue-700/50">
                                        {customer.avatar_url ? (
                                            <img src={customer.avatar_url} className="w-full h-full object-cover" alt="Avatar" />
                                        ) : (
                                            <User className="w-10 h-10 text-blue-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-black tracking-tight">{customer.full_name}</h3>
                                        <div className="flex items-center gap-2 mt-1 px-3 py-1 bg-white/10 rounded-lg w-fit">
                                            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-green-100">Verified Consumer</span>
                                        </div>
                                        <div className="flex items-center gap-6 mt-4">
                                            <div className="text-center">
                                                <p className="text-[10px] font-black text-blue-300 uppercase">Life Spend</p>
                                                <p className="text-lg font-black">₹{customer.stats?.totalSpend?.toLocaleString() || '0'}</p>
                                            </div>
                                            <div className="w-px h-8 bg-white/10" />
                                            <div className="text-center">
                                                <p className="text-[10px] font-black text-blue-300 uppercase">Requests</p>
                                                <p className="text-lg font-black">{customer.stats?.bookingCount || 0}</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* 2. Contact Details */}
                                <section className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mobile</p>
                                        <p className="text-sm font-bold text-gray-900">{customer.phone}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email</p>
                                        <p className="text-sm font-bold text-gray-900 truncate">{customer.email}</p>
                                    </div>
                                </section>

                                {/* 3. Recent Consumption Pulse */}
                                <section className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Service History</h3>
                                        <span className="text-[10px] font-bold text-blue-500">View All</span>
                                    </div>
                                    <div className="space-y-3">
                                        {customer.recentBookings?.length > 0 ? customer.recentBookings.map((b: any) => (
                                            <button 
                                                key={b.id}
                                                onClick={() => onViewBooking(b.id)}
                                                className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 hover:shadow-lg transition-all text-left group"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                                                        <Activity className="w-5 h-5 text-gray-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-gray-900 uppercase">#{b.booking_number}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 mt-0.5">{b.service_name_snapshot}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex items-center gap-4">
                                                    <div>
                                                        <p className="text-xs font-black text-gray-900">₹{b.total_amount}</p>
                                                        <p className={`text-[10px] font-black mt-0.5 uppercase ${
                                                            b.status === 'completed' ? 'text-green-600' : 
                                                            b.status === 'cancelled' ? 'text-red-600' : 'text-blue-600'
                                                        }`}>{b.status}</p>
                                                    </div>
                                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                                </div>
                                            </button>
                                        )) : (
                                            <div className="p-10 border-2 border-dashed border-gray-100 rounded-[32px] text-center text-gray-300">
                                                <Calendar className="w-10 h-10 mx-auto opacity-20 mb-3" />
                                                <p className="text-xs font-bold uppercase tracking-widest">No Consumption History</p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* 4. Verified Addresses */}
                                <section className="space-y-4">
                                    <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Verified Locations</h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {customer.addresses?.length > 0 ? customer.addresses.map((addr: any) => (
                                            <div key={addr.id} className="p-4 bg-gray-50/50 border border-gray-100 rounded-2xl flex items-start gap-4">
                                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 shrink-0">
                                                    <MapPin className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-900 uppercase">{addr.label || 'Saved Location'}</p>
                                                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{addr.address}</p>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="p-6 bg-gray-50 rounded-2xl text-center">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">No saved addresses found</p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <div className="h-20" />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
