'use client';

import { createClient } from '@/utils/supabase/client';
import { adminApi } from '@/utils/api';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Users,
  Zap
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Metric {
  name: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: any;
  color: string;
}

interface ActivityItem {
  id: string;
  type: 'booking' | 'provider' | 'status';
  title: string;
  subtitle: string;
  time: string;
  statusColor: string;
}

export default function Home() {
  const router = useRouter();
  const supabase = createClient();
  const [metrics, setMetrics] = useState<Metric[]>([
    { name: 'Total Customers', value: '0', change: '0%', changeType: 'neutral', icon: Users, color: 'text-blue-600' },
    { name: 'Active Providers', value: '0', change: '0%', changeType: 'neutral', icon: Zap, color: 'text-green-600' },
    { name: 'Jobs Today', value: '0', change: '0%', changeType: 'neutral', icon: Activity, color: 'text-purple-600' },
    { name: 'Revenue (MTD)', value: '₹0', change: '0%', changeType: 'neutral', icon: CheckCircle2, color: 'text-emerald-600' },
  ]);
  const [pulseFeed, setPulseFeed] = useState<ActivityItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [safetyAlerts, setSafetyAlerts] = useState<any[]>([]);
  const [realHotZones, setRealHotZones] = useState<any[]>([]);

  const loadInitialData = async () => {
    const { data: dashboardData, error } = await adminApi.get('/api/v1/admin/dashboard');
    if (error || !dashboardData) {
        console.error('Failed to load dashboard data:', error);
        return;
    }

    const { metrics: dbMetrics, pulseFeed: dbPulseFeed, pendingApprovals, safetyAlerts, realHotZones } = dashboardData;

    setMetrics([
      { name: 'Total Customers', value: dbMetrics.customerCount?.toLocaleString() || '0', change: 'LIVE', changeType: 'positive', icon: Users, color: 'text-blue-600' },
      { name: 'Live Providers', value: dbMetrics.providerCount?.toLocaleString() || '0', change: 'ACTIVE', changeType: 'positive', icon: Zap, color: 'text-green-600' },
      { name: 'Jobs Today', value: dbMetrics.jobsToday?.toLocaleString() || '0', change: 'TODAY', changeType: 'positive', icon: Activity, color: 'text-purple-600' },
      { name: 'Platform Revenue', value: `₹${(dbMetrics.mtdRevenue || 0).toLocaleString()}`, change: `₹${(dbMetrics.digitalRev || 0).toLocaleString()} digital`, changeType: 'positive', icon: CheckCircle2, color: 'text-emerald-600' },
    ]);

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'completed': return 'bg-green-500';
        case 'cancelled': return 'bg-red-500';
        case 'in_progress': return 'bg-purple-500';
        case 'confirmed': return 'bg-indigo-500';
        case 'searching':
        case 'requested': return 'bg-amber-500';
        case 'en_route':
        case 'arrived': return 'bg-sky-500';
        case 'disputed': return 'bg-rose-500';
        default: return 'bg-gray-400';
      }
    };

    if (dbPulseFeed) {
      setPulseFeed(dbPulseFeed.map((b: any) => ({
        id: b.id,
        type: 'booking',
        title: b.service_subcategories?.name || 'New Booking',
        subtitle: `By ${b.profiles?.full_name || 'Customer'}`,
        time: new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        statusColor: getStatusColor(b.status)
      })));
    }

    setPendingApprovals(pendingApprovals || []);
    setSafetyAlerts(safetyAlerts || []);
    setRealHotZones(realHotZones || []);
  };

  const handleResolveAlert = async (id: string) => {
    const { error } = await adminApi.patch(`/api/v1/admin/safety-alerts/${id}/resolve`, {});
    if (error) {
      alert('Failed to resolve alert');
      return;
    }
    loadInitialData();
  };

  useEffect(() => {
    loadInitialData();

    // ── REAL-TIME SUBSCRIPTIONS ───────────────────────────────────────────
    const channel = supabase
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_details' }, () => loadInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_alerts' }, () => loadInitialData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="admin-page-content animate-in fade-in duration-500">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Control Tower</h1>
          <p className="page-subtitle">Real-time system health and operations</p>
        </div>
        <div className="live-status-badge">
          <div className="live-dot-wrapper">
            <span className="live-dot-ping"></span>
            <span className="live-dot-static"></span>
          </div>
          LIVE MONITORING
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {metrics.map((stat) => (
          <div key={stat.name} className="stat-card">
            <div className="stat-header">
              <div className="stat-icon-box">
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className={`stat-trend ${stat.changeType === 'positive' ? 'trend-positive' : 'trend-neutral'}`}>
                {stat.change}
                <ArrowUpRight className="w-3 h-3" />
              </div>
            </div>
            <div className="stat-body">
              <h3 className="stat-label">{stat.name}</h3>
              <p className="stat-value">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Pulse Activity Feed */}
        <div className="grid-span-2 pulse-card">
          <div className="pulse-header">
            <h2 className="pulse-title">
              <Activity className="w-6 h-6 text-blue-600" />
              Activity Pulse
            </h2>
            <button className="text-link">View Full History</button>
          </div>

          <div className="pulse-list">
            {pulseFeed.length > 0 ? pulseFeed.map((item, idx) => (
              <div key={item.id} className="pulse-item">
                <div className="pulse-dot-wrapper">
                  <div className={`pulse-dot ${item.statusColor}`} />
                  {idx !== pulseFeed.length - 1 && <div className="pulse-line" />}
                </div>
                <div className="pulse-content">
                  <div className="flex justify-between items-start">
                    <h4 className="font-black text-gray-900">{item.title}</h4>
                    <span className="text-xs font-bold text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 font-medium mt-1">{item.subtitle}</p>
                </div>
              </div>
            )) : (
              <div className="empty-state-centered">
                <Clock className="w-12 h-12 opacity-20" />
                <p className="font-bold">Waiting for live data sync...</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {/* Pending Provider Approvals */}
          <div className="verification-card">
            <div className="pulse-header">
              <h2 className="pulse-title">
                <Users className="w-6 h-6 text-blue-600" />
                Pending Verification
              </h2>
              <span className="badge badge-searching">{pendingApprovals.length} New</span>
            </div>

            <div className="verification-list">
              {pendingApprovals.length > 0 ? pendingApprovals.map(p => (
                <div key={p.provider_id} className="pending-user-row">
                  <div className="flex items-center gap-3">
                    <div className="user-avatar-placeholder">
                      {(p.profiles?.full_name || 'P')[0]}
                    </div>
                    <div>
                      <p className="user-name-primary">{p.profiles?.full_name || 'New Provider'}</p>
                      <p className="user-role-tag">{p.profiles?.email?.split('@')[0] || 'Verification Pending'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => router.push(`/providers?search=${p.provider_id}`)}
                    className="action-icon-btn"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )) : (
                <div key="empty-approvals" className="empty-state-centered">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted">All caught up!</p>
                </div>
              )}
            </div>

            <button
              onClick={() => router.push('/providers')}
              className="btn btn-primary w-full mt-6 py-4"
            >
              Go to Management
            </button>
          </div>

          {/* 🆘 Safety SOS Feed */}
          <div className="sos-card">
            <Activity className="sos-bg-icon w-32 h-32" />
            <h2 className="pulse-title text-white mb-8 relative z-10">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-100 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              Safety SOS
            </h2>
            <div className="sos-list">
              {safetyAlerts.length > 0 ? safetyAlerts.map(alert => (
                <div key={alert.id} className="sos-item">
                  <div>
                    <h4 className="font-bold text-white text-sm">{alert.profiles?.full_name || 'Anonymous'}</h4>
                    <p className="text-xs text-red-100 mt-0.5">{alert.bookings?.service_name_snapshot ?? 'Live Booking'}</p>
                  </div>
                  <button 
                    onClick={() => handleResolveAlert(alert.id)}
                    className="badge badge-completed border-none cursor-pointer"
                  >
                    RESOLVE
                  </button>
                </div>
              )) : (
                <div key="empty-sos" className="empty-state-centered border-red-500 border-2 border-dashed text-red-100 rounded-2xl py-10">
                  <p className="font-bold text-sm">No active SOS alerts.</p>
                </div>
              )}
            </div>
          </div>

          {/* Hot Zones Heatmap */}
          <div className="hotzones-card">
            <div className="pulse-header">
              <h2 className="pulse-title">
                <Zap className="w-6 h-6 text-amber-500 fill-amber-500" />
                Hot Zones
              </h2>
              <span className="badge badge-requested">High Demand</span>
            </div>

            {realHotZones.length > 0 ? (
              <div className="hotzone-list">
                {realHotZones.map((zone) => (
                  <div key={zone.area} className="hotzone-row">
                    <div className="hotzone-info">
                      <span className="text-sm font-bold text-gray-800">{zone.area}</span>
                      <span className="text-xs font-black text-amber-600">{zone.demand}</span>
                    </div>
                    <div className="hotzone-bar-bg">
                      <div className={`hotzone-bar-fill ${zone.color}`} style={{ width: zone.demand }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div key="empty-hotzones" className="empty-state-centered border-2 border-dashed border-gray-100 rounded-3xl py-20">
                <Zap className="w-12 h-12 opacity-10" />
                <p className="font-bold text-sm">Waiting for demand data...</p>
              </div>
            )}

            <p className="text-[10px] text-gray-400 font-medium mt-6 text-center italic">
              *Based on booking density and unfulfilled requests.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
