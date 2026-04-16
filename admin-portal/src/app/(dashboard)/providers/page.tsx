'use client';

import { createClient } from '@/utils/supabase/client';
import { adminApi } from '@/utils/api';
import {
    Activity,
    Clock,
    ChevronRight,
    Download,
    Filter,
    MapPin,
    MoreVertical,
    Search,
    ShieldAlert,
    ShieldCheck,
    Star,
    User as UserIcon,
    Wrench,
    XCircle
} from 'lucide-react';
import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    verified: { label: 'Verified', color: 'text-green-700', bg: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
    pending: { label: 'KYC Pending', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
    unverified: { label: 'Profile Only', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
    under_review: { label: 'In Review', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
    reverify: { label: 'Action Required', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
    suspended: { label: 'Suspended', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-500' },
    rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
};

import ProviderSidebar from '@/components/admin/ProviderSidebar';
import BookingSidebar from '@/components/admin/BookingSidebar';
import CustomerSidebar from '@/components/admin/CustomerSidebar';

export default function ProvidersPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ProvidersPageContent />
        </Suspense>
    );
}

function ProvidersPageContent() {
    const [providers, setProviders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();
    const initialSearch = searchParams.get('search') || '';
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [activeTab, setActiveTab] = useState('all');

    // Side-panel State
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
    const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

    const fetchProviders = useCallback(async (search?: string, status?: string) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            const s = search ?? searchTerm;
            const t = status ?? activeTab;
            if (s) params.append('search', s);
            if (t && t !== 'all') params.append('status', t);
            params.append('limit', '200');

            const { data, error } = await adminApi.get(`/api/v1/admin/providers?${params.toString()}`);

            if (error) {
                console.error('Error fetching providers:', error);
                return;
            }

            if (data) {
                setProviders(data);
            }
        } catch (err) {
            console.error('Unexpected error fetching providers:', err);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, activeTab]);

    // Fetch on mount and whenever search/tab changes
    useEffect(() => {
        fetchProviders();
    }, [fetchProviders]);

    const updateStatus = async (providerId: string, nextStatus: string) => {
        const { error } = await adminApi.patch(`/api/v1/admin/providers/${providerId}`, {
            verification_status: nextStatus
        });

        if (!error) fetchProviders();
    };

    // Use providers directly - server already filtered
    const filtered = providers;

    const exportToCSV = () => {
        const headers = ['ID', 'Full Name', 'Business Name', 'Phone', 'Email', 'Verification Status', 'Avg Rating', 'Jobs Completed'];
        const rows = filtered.map(p => [
            p.id, 
            `"${p.full_name || ''}"`, 
            `"${p.provider_details?.[0]?.business_name || 'Individual Operator'}"`, 
            `"${p.phone || ''}"`, 
            `"${p.email || ''}"`, 
            p.provider_details?.[0]?.verification_status || 'pending',
            p.average_rating || 0,
            p.total_jobs_completed || 0
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `workla_providers_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const TABS = [
        { id: 'all', label: 'All Partners' },
        { id: 'pending', label: 'KYC Queue' },
        { id: 'unverified', label: 'Registration Only' },
        { id: 'verified', label: 'Verified Partners' },
        { id: 'suspended', label: 'Suspended' },
    ];

    return (
        <div className="admin-page-content animate-in fade-in duration-500">
            <div className="page-header-row">
                <div>
                    <h1 className="page-title">Provider Fleet</h1>
                    <p className="page-subtitle">Managing {providers.length} registered service partners</p>
                </div>

                <div className="controls-group">
                    <div className="search-wrapper">
                        <Search className="search-icon-inside" />
                        <input
                            type="text"
                            placeholder="Search by name or business..."
                            className="search-input-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={exportToCSV} className="btn btn-primary">
                        <Download className="w-4 h-4" />
                        <span>Export CSV</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="table-card">
                <div className="table-responsive">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Partner Identity</th>
                                <th>Business Information</th>
                                <th>Verification Status</th>
                                <th>Performance Index</th>
                                <th className="text-right">Operational Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-32 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-4 py-32">
                                            <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin"></div>
                                            <p className="font-bold text-sm tracking-widest uppercase text-muted">Fetching Fleet Data...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-32 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-4 py-32">
                                            <Wrench className="w-12 h-12 opacity-10" />
                                            <p className="font-bold text-sm text-muted">No providers found in this segment.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((p, idx) => (
                                    <tr
                                        key={p.id}
                                        onClick={() => setSelectedProviderId(p.id)}
                                    >
                                        <td>
                                            <div className="user-info-cell">
                                                <div className="user-avatar-placeholder">
                                                    {p.avatar_url ? (
                                                        <img src={p.avatar_url} className="w-full h-full object-cover" />
                                                    ) : (
                                                        (p.full_name || 'P').charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="user-name-primary">{p.full_name}</p>
                                                    <p className="user-role-tag">{p.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-gray-900 leading-tight italic">
                                                    {p.provider_details?.[0]?.business_name || 'Individual Operator'}
                                                </span>
                                                <div className="service-address-sub">
                                                    <MapPin className="w-3 h-3" />
                                                    {p.phone}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className={`badge badge-${p.provider_details?.[0]?.verification_status || 'pending'}`}>
                                                <div className="status-dot" />
                                                <span>{(STATUS_CONFIG[p.provider_details?.[0]?.verification_status]?.label || 'Pending').replace('_', ' ')}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="performance-grid">
                                                <div className="metric-item">
                                                    <p className="metric-label">Rating</p>
                                                    <div className="metric-value-row">
                                                        <Star className={`w-3.5 h-3.5 ${p.average_rating > 0 ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                                                        <span className="metric-value-text">{p.average_rating?.toFixed(1) || '0.0'}</span>
                                                    </div>
                                                </div>
                                                <div className="metric-item">
                                                    <p className="metric-label">Jobs</p>
                                                    <p className="metric-value-text">{p.total_jobs_completed || 0}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <div className="actions-cell-content">
                                                {p.provider_details?.[0]?.verification_status === 'pending' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateStatus(p.id, 'verified');
                                                        }}
                                                        className="btn-ghost-success"
                                                    >
                                                        Approve
                                                    </button>
                                                )}
                                                <button className="action-icon-btn">
                                                    <ChevronRight className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Entity Side-Panels */}
            <ProviderSidebar 
                providerId={selectedProviderId} 
                onClose={() => setSelectedProviderId(null)} 
                onViewBooking={(id) => {
                    setSelectedProviderId(null);
                    setSelectedBookingId(id);
                }}
                onStatusUpdate={fetchProviders}
            />
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
            <CustomerSidebar 
                customerId={selectedCustomerId}
                onClose={() => setSelectedCustomerId(null)}
                onViewBooking={(id) => {
                    setSelectedCustomerId(null);
                    setSelectedBookingId(id);
                }}
            />

            {/* Backdrop */}
            {(selectedProviderId || selectedBookingId || selectedCustomerId) && (
                <div 
                    className="sidepanel-backdrop animate-in fade-in duration-300" 
                    onClick={() => {
                        setSelectedProviderId(null);
                        setSelectedBookingId(null);
                        setSelectedCustomerId(null);
                    }}
                />
            )}
        </div>
    );
}
