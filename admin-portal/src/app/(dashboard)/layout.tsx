'use client';

import { createClient } from '@/utils/supabase/client';
import {
  Bell,
  Calendar,
  ChevronRight,
  DollarSign,
  FileText,
  Gift,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Users,
  Wrench,
  Banknote
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [adminProfile, setAdminProfile] = useState<{name: string, role: string}>({ name: 'Admin', role: 'Staff' });
  const [adminInitials, setAdminInitials] = useState('A');
  const [isScrolled, setIsScrolled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, is_admin, deleted_at')
          .eq('id', user.id)
          .single();
        
        if (!profile || !profile.is_admin || profile.deleted_at) {
          // Logged in but not an admin -> Forbidden
          await supabase.auth.signOut();
          router.push('/login?error=unauthorized');
          return;
        }

        setAdminProfile({
          name: profile.full_name || 'Admin User',
          role: 'Super Admin'
        });
        setAdminInitials((profile.full_name || user.email || 'A').substring(0, 1).toUpperCase());
        setLoading(false);
      } catch (err) {
        console.error('Auth guard error:', err);
        router.push('/login');
      }
    };
    fetchUser();

    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/users', icon: Users, label: 'Customers' },
    { href: '/providers', icon: Wrench, label: 'Provider Fleet' },
    { href: '/bookings', icon: Calendar, label: 'Live Orders' },
    { href: '/catalog', icon: FileText, label: 'Service Catalog' },
    { href: '/promotions', icon: Gift, label: 'Promotions' },
    { href: '/banners', icon: Gift, label: 'Home Banners' },
    { href: '/revenue', icon: DollarSign, label: 'Financials' },
    { href: '/database', icon: FileText, label: 'DB Explorer' },
    { href: '/payouts', icon: Banknote, label: 'Payout Requests' },
  ];

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white">
        <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] animate-pulse">Initializing Secure Portal</p>
      </div>
    );
  }

  return (
    <div className="admin-layout-root flex h-screen overflow-hidden antialiased">

      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <div className="flex items-center gap-3">
            <div className="sidebar-logo-icon">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <h1 className="sidebar-logo-text">
              Workla <span className="sidebar-logo-sub">ADMIN PORTAL</span>
            </h1>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <p className="nav-group-label">Core Operations</p>
            <ul className="nav-list">
              {navItems.slice(0, 4).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                  >
                    <item.icon className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                    {pathname === item.href && <ChevronRight className="nav-arrow" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="nav-group">
            <p className="nav-group-label">Management</p>
            <ul className="nav-list">
              {navItems.slice(4).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                  >
                    <item.icon className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                    {pathname === item.href && <ChevronRight className="nav-arrow" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="sidebar-footer">
          <Link href="/settings" className={`footer-link ${pathname === '/settings' ? 'active' : ''}`}>
            <Settings className="footer-icon" />
            System Settings
          </Link>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut className="logout-icon" />
            Exit Portal
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content-wrapper">
        {/* Top Navigation Header */}
        <header className={`header ${isScrolled ? 'scrolled' : ''}`}>
          <div className="header-left">
            <h2 className="header-title">
              {navItems.find(i => i.href === pathname)?.label || 'Overview'}
            </h2>
            <div className="global-search">
              <Search className="search-icon" />
              <input type="text" placeholder="Global system search..." className="search-input" />
            </div>
          </div>

          <div className="header-right">
            <div className="notification-wrapper">
              <button className="notification-btn">
                <Bell className="w-5 h-5" />
              </button>
              <span className="notification-badge" />
            </div>

            <div className="divider" />

            <div className="admin-profile">
              <div className="profile-info">
                <p className="profile-name">{adminProfile.name}</p>
                <p className="profile-role">{adminProfile.role}</p>
              </div>
              <div className="profile-avatar">
                {adminInitials}
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Page Container */}
        <main className="page-content">
          <div className="content-inner">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
