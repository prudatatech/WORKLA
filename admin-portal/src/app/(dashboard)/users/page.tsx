'use client';

import { createClient } from '@/utils/supabase/client';
import { adminApi } from '@/utils/api';
import {
    ChevronRight,
    Download,
    Filter,
    MoreVertical,
    Search,
    ShieldCheck
} from 'lucide-react';
import { useEffect, useState } from 'react';
import CustomerSidebar from '@/components/admin/CustomerSidebar';
import BookingSidebar from '@/components/admin/BookingSidebar';

export default function CustomersPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

    async function fetchUsers() {
        setLoading(true);
        // Fetch users from Fastify API instead of direct Supabase query
        const { data, error } = await adminApi.get('/api/v1/admin/users?limit=100');

        if (error) console.error('Error fetching users:', error);
        if (data) setUsers(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const filtered = users.filter(u => {
        const matchesSearch = u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.phone?.includes(searchTerm) ||
            u.email?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesFilter = statusFilter === 'ALL' || u.role === statusFilter;
        return matchesSearch && matchesFilter;
    });

    const exportToCSV = () => {
        const headers = ['ID', 'Full Name', 'Phone', 'Email', 'Role', 'Joined At'];
        const rows = filtered.map(u => [
            u.id, 
            `"${u.full_name || ''}"`, 
            `"${u.phone || ''}"`, 
            `"${u.email || ''}"`, 
            u.role, 
            new Date(u.created_at).toISOString()
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `workla_users_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="admin-page-content animate-in fade-in duration-500">
            <div className="page-header-row">
                <div>
                    <h1 className="page-title">Customer Ledger</h1>
                    <p className="page-subtitle">Monitoring {users.length} registered service consumers</p>
                </div>

                <div className="controls-group">
                    <div className="search-wrapper">
                        <Search className="search-icon-inside" />
                        <input
                            type="text"
                            placeholder="Find by name, email, or phone..."
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
                            <option value="ALL">All Roles</option>
                            <option value="CUSTOMER">Customers</option>
                            <option value="PROVIDER">Providers</option>
                        </select>
                        <button 
                            onClick={exportToCSV}
                            className="btn btn-primary"
                        >
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
                                <th>Consumer Persona</th>
                                <th>Communication Channel</th>
                                <th>Onboarding Date</th>
                                <th>Trust Score</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr key="loading">
                                    <td colSpan={5} className="px-8 py-32 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-4 py-32">
                                            <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="font-bold text-sm tracking-widest uppercase text-muted">Scanning Database...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr key="empty">
                                    <td colSpan={5} className="px-8 py-32 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-4 py-32">
                                            <Search className="w-12 h-12 opacity-10" />
                                            <p className="font-bold text-sm text-muted">No results match your search parameters.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((u, idx) => (
                                    <tr
                                        key={u.id}
                                        onClick={() => setSelectedCustomerId(u.id)}
                                    >
                                        <td>
                                            <div className="user-info-cell">
                                                <div className="user-avatar-placeholder">
                                                    {u.full_name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="user-name-primary">{u.full_name}</p>
                                                    <p className="user-role-tag">{u.role}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="contact-info">
                                                <p className="contact-phone">{u.phone}</p>
                                                <p className="contact-email">{u.email}</p>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="date-cell">
                                                <ChevronRight className="w-3 h-3" />
                                                {new Date(u.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="badge badge-success">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                <span>Verified</span>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <button className="action-icon-btn">
                                                <MoreVertical className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sidebars */}
            <CustomerSidebar 
                customerId={selectedCustomerId}
                onClose={() => setSelectedCustomerId(null)}
                onViewBooking={(id) => {
                    setSelectedCustomerId(null);
                    setSelectedBookingId(id);
                }}
            />

            <BookingSidebar 
                bookingId={selectedBookingId}
                onClose={() => setSelectedBookingId(null)}
                onViewCustomer={(id) => {
                    setSelectedBookingId(null);
                    setSelectedCustomerId(id);
                }}
                onViewProvider={() => {}} // Not needed here for now
            />
        </div>
    );
}
