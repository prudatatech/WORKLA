'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { 
  Banknote, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  ArrowUpRight
} from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function PayoutsPage() {
    const supabase = createClient();
    const [payouts, setPayouts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchPayouts = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${API_URL}/api/v1/admin/payouts?status=${statusFilter}`, {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setPayouts(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch payouts:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPayouts();
    }, [statusFilter]);

    const handleAction = async (id: string, newStatus: 'completed' | 'rejected') => {
        setProcessingId(id);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${API_URL}/api/v1/admin/payouts/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ status: newStatus, remarks: `Processed by Admin on ${new Date().toLocaleDateString()}` })
            });
            
            const result = await response.json();
            if (result.success) {
                fetchPayouts();
            } else {
                alert(result.error || 'Failed to update payout');
            }
        } catch (error) {
            console.error('Action failed:', error);
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="admin-page-container animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
                        <Banknote className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="page-title">Payout Requests</h1>
                        <p className="page-subtitle">Manage provider withdrawal requests and approve bank transfers.</p>
                    </div>
                </div>

                <div className="tabs-container mb-0">
                    {['pending', 'completed', 'rejected'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`tab-btn ${statusFilter === status ? 'active' : ''}`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table Section */}
            <div className="mt-8">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Provider</th>
                            <th>Amount</th>
                            <th>Requested</th>
                            <th>Method</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={5} className="py-8 h-20 bg-gray-50/20" />
                                </tr>
                            ))
                        ) : payouts.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-20 text-center text-gray-400 font-bold border-2 border-dashed border-gray-100 rounded-3xl">
                                    No {statusFilter} requests found.
                                </td>
                            </tr>
                        ) : (
                            payouts.map((payout) => (
                                <tr key={payout.id}>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 font-black">
                                                {payout.profiles?.full_name?.[0] || 'P'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 leading-none">{payout.profiles?.full_name || 'Unknown'}</p>
                                                <p className="text-xs font-bold text-gray-400 mt-1">{payout.profiles?.phone}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <p className="text-lg font-black text-gray-900">₹{payout.amount}</p>
                                    </td>
                                    <td>
                                        <p className="text-sm font-bold text-gray-500">{format(new Date(payout.created_at), 'MMM dd, yyyy')}</p>
                                        <p className="text-[10px] font-black text-gray-400 mt-1 uppercase">{format(new Date(payout.created_at), 'hh:mm a')}</p>
                                    </td>
                                    <td>
                                        <span className="badge badge-pending">Bank Transfer</span>
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-end gap-3">
                                            {payout.status === 'pending' ? (
                                                <>
                                                    <button 
                                                        onClick={() => handleAction(payout.id, 'rejected')}
                                                        disabled={processingId === payout.id}
                                                        className="btn btn-secondary py-2 px-4 text-xs text-red-500 border-red-100 hover:bg-red-50"
                                                    >
                                                        Reject
                                                    </button>
                                                    <button 
                                                        onClick={() => handleAction(payout.id, 'completed')}
                                                        disabled={processingId === payout.id}
                                                        className="btn btn-primary py-2 px-4 text-xs"
                                                    >
                                                        Approve
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="inline-flex items-center gap-2">
                                                    {payout.status === 'completed' ? (
                                                        <span className="badge badge-verified flex items-center gap-1.5">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            Completed
                                                        </span>
                                                    ) : (
                                                        <span className="badge badge-suspended flex items-center gap-1.5">
                                                            <XCircle className="w-3.5 h-3.5" />
                                                            Rejected
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
