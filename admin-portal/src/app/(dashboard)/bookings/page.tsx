'use client';

import { createClient } from '@/utils/supabase/client';
import { adminApi } from '@/utils/api';
import {
    Calendar,
    ChevronRight,
    Download,
    Filter,
    MapPin,
    Search,
    User as UserIcon,
    Wrench
} from 'lucide-react';
import { useEffect, useState } from 'react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    requested: { label: 'Requested', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
    pending: { label: 'Requested', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
    searching: { label: 'Searching', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
    confirmed: { label: 'Confirmed', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
    en_route: { label: 'En Route', color: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', dot: 'bg-sky-500' },
    arrived: { label: 'Arrived', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
    in_progress: { label: 'Working', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
    completed: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
    cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
    disputed: { label: 'Disputed', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
};

import BookingSidebar from '@/components/admin/BookingSidebar';
import ProviderSidebar from '@/components/admin/ProviderSidebar';
import CustomerSidebar from '@/components/admin/CustomerSidebar';

export default function BookingsPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    
    // Side-panel State
    const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

    const supabase = createClient();

    async function fetchBookings(silent = false) {
        if (!silent) setLoading(true);
        const { data, error } = await adminApi.get('/api/v1/admin/bookings?limit=100');

        if (data) setBookings(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchBookings();

        // ── LIVE REAL-TIME SYNC ───────────────────────────────────────────
        const channel = supabase
            .channel('admin-bookings-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
                fetchBookings(true);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const filtered = bookings.filter(b => {
        const matchesSearch =
            (b.booking_number?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (b.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (b.service_name_snapshot?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (b.id?.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesStatus = statusFilter === 'all' || b.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const exportToCSV = () => {
        const headers = ['Order ID', 'Customer Name', 'Service', 'Address', 'Status', 'Provider Assigned', 'Scheduled Date', 'Amount'];
        const rows = filtered.map(b => [
            b.booking_number || b.id.slice(0, 8).toUpperCase(), 
            `"${b.customer_name || 'Guest'}"`, 
            `"${b.service_name_snapshot || ''}"`, 
            `"${b.customer_address || ''}"`, 
            b.status, 
            `"${b.provider_name || 'Unassigned'}"`,
            `${b.scheduled_date} ${b.scheduled_time_slot}`,
            b.total_amount || 0
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `workla_bookings_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="admin-page-content animate-in fade-in duration-500">
            <div className="page-header-row">
                <div>
                    <h1 className="page-title">Service Operations</h1>
                    <p className="page-subtitle">Real-time monitoring of {bookings.length} deployment cycles</p>
                </div>

                <div className="controls-group">
                    <div className="search-wrapper">
                        <Search className="search-icon-inside" />
                        <input
                            type="text"
                            placeholder="Search by ID, Customer, or Provider..."
                            className="search-input-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="actions-cluster">
                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="select-custom"
                        >
                            <option value="all">All Statuses</option>
                            <option value="requested">Requested</option>
                            <option value="searching">Searching</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="en_route">En Route</option>
                            <option value="arrived">Arrived</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <button onClick={exportToCSV} className="btn btn-primary">
                            <Download className="w-4 h-4" />
                            <span>Export CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="table-card">
                <div className="table-responsive">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Referrer / ID</th>
                                <th>Customer Persona</th>
                                <th>Service Details</th>
                                <th>Current State</th>
                                <th>Assignment</th>
                                <th>Valuation</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-8 py-32 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-4 py-32">
                                            <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="font-bold text-sm tracking-widest uppercase text-muted">Scanning Database...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-8 py-32 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-4 py-32">
                                            <Search className="w-12 h-12 opacity-10" />
                                            <p className="font-bold text-sm text-muted">No operational records match your query.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((b, idx) => (
                                    <tr
                                        key={b.id}
                                        onClick={() => setSelectedBookingId(b.id)}
                                    >
                                        <td>
                                            <p className="booking-number">#{b.booking_number || b.id.substring(0, 8).toUpperCase()}</p>
                                            <p className="booking-date-tiny">{new Date(b.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}</p>
                                        </td>
                                        <td>
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedCustomerId(b.customer_id);
                                                }}
                                                className="user-info-cell"
                                            >
                                                <div className="user-avatar-placeholder">
                                                    {(b.customer_name || 'G').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="user-name-primary">{b.customer_name || 'Guest'}</p>
                                                    <p className="user-role-tag">{b.customer_phone || 'No Phone'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="service-cell">
                                                <div className="service-name-row">
                                                    <Wrench className="w-3.5 h-3.5 text-blue-500" />
                                                    <span className="service-name-text">{b.service_name_snapshot || 'Standard Service'}</span>
                                                </div>
                                                <div className="service-address-sub">
                                                    <MapPin className="w-3 h-3" />
                                                    {b.customer_address || 'On-site'}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className={`badge badge-${b.status}`}>
                                                <div className="status-dot" />
                                                <span>{(STATUS_CONFIG[b.status]?.label || b.status).replace('_', ' ')}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div 
                                                onClick={(e) => {
                                                    if (b.provider_id) {
                                                        e.stopPropagation();
                                                        setSelectedProviderId(b.provider_id);
                                                    }
                                                }}
                                                className="assignment-cell"
                                            >
                                                <div className="provider-name-row">
                                                    <div className={`status-dot ${b.provider_name ? 'text-indigo-500' : 'text-gray-300'}`} />
                                                    <span className={`provider-name-text ${!b.provider_id ? 'pending' : ''}`}>
                                                        {b.provider_name || 'DISPATCH PENDING'}
                                                    </span>
                                                </div>
                                                <div className="schedule-sub">
                                                    <Calendar className="w-3 h-3" />
                                                    {b.scheduled_date} @ {b.scheduled_time_slot}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <p className="valuation-text">₹{b.total_amount?.toLocaleString() || '—'}</p>
                                        </td>
                                        <td className="text-right">
                                            <button className="action-icon-btn">
                                                <ChevronRight className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Entity Side-Panels */}
            <BookingSidebar 
                bookingId={selectedBookingId} 
                onClose={() => setSelectedBookingId(null)} 
                onViewProvider={(id) => {
                    setSelectedBookingId(null);
                    setSelectedProviderId(id);
                }}
                onViewCustomer={(id) => {
                    setSelectedBookingId(null);
                    setSelectedCustomerId(id);
                }}
            />
            <ProviderSidebar 
                providerId={selectedProviderId} 
                onClose={() => setSelectedProviderId(null)} 
                onViewBooking={(id) => {
                    setSelectedProviderId(null);
                    setSelectedBookingId(id);
                }}
            />
            <CustomerSidebar 
                customerId={selectedCustomerId}
                onClose={() => setSelectedCustomerId(null)}
                onViewBooking={(id) => {
                    setSelectedCustomerId(null);
                    setSelectedBookingId(id);
                }}
            />

            {/* Backdrop for side panels */}
            {(selectedBookingId || selectedProviderId || selectedCustomerId) && (
                <div 
                    className="sidepanel-backdrop animate-in fade-in duration-300" 
                    onClick={() => {
                        setSelectedBookingId(null);
                        setSelectedProviderId(null);
                        setSelectedCustomerId(null);
                    }}
                />
            )}
        </div>
    );
}
