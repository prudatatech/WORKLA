'use client';

import { createClient } from '@/utils/supabase/client';
import {
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    CreditCard,
    DollarSign,
    TrendingUp,
    Wallet
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

interface EarningRecord {
    gross_amount: number;
    platform_fee: number;
    net_amount: number;
    status: string;
    created_at: string;
}

export default function RevenuePage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ 
        gross: 0, 
        fees: 0, 
        net: 0, 
        pending: 0,
        cashFees: 0,
        digitalFees: 0
    });
    const [history, setHistory] = useState<any[]>([]);
    const supabase = createClient();

    async function fetchRevenue() {
        setLoading(true);
        const { data } = await supabase
            .from('worker_earnings')
            .select('*')
            .order('created_at', { ascending: true });

        if (data) {
            const records = data as any[];
            const gross = records.reduce((s, e) => s + Number(e.gross_amount), 0);
            const fees = records.reduce((s, e) => s + Number(e.platform_fee), 0);
            const cashFees = records.filter(r => r.payment_method === 'cod').reduce((s, e) => s + Number(e.platform_fee), 0);
            const digitalFees = fees - cashFees;
            const net = gross - fees;
            const pending = records.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.net_amount), 0);

            setStats({ gross, fees, net, pending, cashFees, digitalFees } as any);

            // Group by date for chart
            const grouped = records.reduce((acc: any, curr: any) => {
                const date = new Date(curr.created_at).toLocaleDateString();
                if (!acc[date]) acc[date] = { date, revenue: 0, fee: 0, cash: 0, online: 0 };
                acc[date].revenue += Number(curr.gross_amount);
                acc[date].fee += Number(curr.platform_fee);
                if (curr.payment_method === 'cod') acc[date].cash += Number(curr.platform_fee);
                else acc[date].online += Number(curr.platform_fee);
                return acc;
            }, {});
            setHistory(Object.values(grouped).slice(-15)); // Last 15 days
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchRevenue();
    }, []);

    const CARDS = [
        { label: 'Platform Revenue', value: `₹${stats.fees.toLocaleString()}`, color: 'text-blue-600', bg: 'bg-blue-50', icon: TrendingUp, trend: `₹${stats.digitalFees.toLocaleString()} digital` },
        { label: 'Cash Commission', value: `₹${stats.cashFees.toLocaleString()}`, color: 'text-amber-600', bg: 'bg-amber-50', icon: Wallet, trend: 'Owed by Pros' },
        { label: 'Digital Comm.', value: `₹${stats.digitalFees.toLocaleString()}`, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: BarChart3, trend: 'Directly Paid' },
        { label: 'Total GMV', value: `₹${stats.gross.toLocaleString()}`, color: 'text-green-600', bg: 'bg-green-50', icon: DollarSign, trend: 'Total Volume' },
    ];

    return (
        <div className="admin-page-container animate-in fade-in duration-500">
            <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200">
                <div>
                    <h1 className="page-title">Financial Overview</h1>
                    <p className="page-subtitle">Platform revenue and payout metrics across all categories</p>
                </div>
                <button className="btn btn-primary">
                    <CreditCard className="w-4 h-4" /> Settlement Report
                </button>
            </div>

            <div className="stats-grid mt-8">
                {CARDS.map((card) => (
                    <div key={card.label} className="stat-card">
                        <div className="stat-header">
                            <div className="stat-icon-box">
                                <card.icon className={card.color} style={{ width: 20, height: 20 }} />
                            </div>
                            {card.trend && (
                                <span className={`stat-trend ${
                                    card.trend.startsWith('+') ? 'trend-positive' : 
                                    card.trend.startsWith('-') ? 'text-red-600' : 
                                    'trend-neutral'
                                }`}>
                                    {card.trend.startsWith('+') && <ArrowUpRight className="w-3 h-3 mr-1" />}
                                    {card.trend.startsWith('-') && <ArrowDownRight className="w-3 h-3 mr-1" />}
                                    {card.trend}
                                </span>
                            )}
                        </div>
                        <h3 className="stat-label">{card.label}</h3>
                        <p className={`stat-value ${card.color}`}>{card.value}</p>
                    </div>
                ))}
            </div>

            <div className="chart-card mt-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Revenue Growth</h2>
                        <p className="text-sm text-gray-500">Gross transaction volume vs platform commission</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-xs font-bold text-gray-600">Total GMV</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-indigo-300"></div>
                            <span className="text-xs font-bold text-gray-600">Platform Fee</span>
                        </div>
                    </div>
                </div>

                {history.length > 0 ? (
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                            <defs>
                                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                                tickFormatter={(val: number) => `₹${val}`}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="revenue"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorRev)"
                            />
                            <Area
                                type="monotone"
                                dataKey="fee"
                                stroke="#818cf8"
                                strokeWidth={3}
                                fill="transparent"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-[350px] flex flex-col items-center justify-center text-gray-400 gap-4 border-2 border-dashed border-gray-100 rounded-3xl">
                    <TrendingUp className="w-12 h-12 opacity-10" />
                    <p className="font-bold text-sm">No transaction history found for this period.</p>
                </div>
            )}
            </div>
        </div>
    );
}
