'use client';

import { adminApi } from '@/utils/api';
import { createClient } from '@/utils/supabase/client';
import {
    ArrowUpCircle,
    CheckCircle2,
    ChevronDown,
    ExternalLink,
    ImageIcon,
    Loader2,
    Plus,
    Trash2,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';

const ImagePreview = ({ url, size = 60 }: { url?: string; size?: number }) => (
    url
        ? <img src={url} alt="preview" className="rounded-xl object-cover border border-gray-200 shadow-sm" style={{ width: size, height: size }} onError={(e) => { (e.target as any).style.display = 'none'; }} />
        : <div className="rounded-xl bg-gray-100 flex items-center justify-center border border-dashed border-gray-300" style={{ width: size, height: size }}>
            <ImageIcon className="w-6 h-6 text-gray-400" />
        </div>
);

export default function BannersPage() {
    const [banners, setBanners] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editBanner, setEditBanner] = useState<any>(null);

    // Form States
    const initialForm = {
        title: '',
        subtitle: '',
        image_url: '',
        badge_text: '',
        deep_link: '',
        priority_number: 0,
        is_active: true
    };
    const [form, setForm] = useState(initialForm);

    const supabase = createClient();

    async function fetchServices() {
        const { data } = await adminApi.get('/api/v1/admin/services');
        if (data) setServices(data);
    };

    async function fetchBanners() {
        setLoading(true);
        const { data, error } = await adminApi.get('/api/v1/admin/banners');

        if (data) setBanners(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchBanners();
        fetchServices();
    }, []);

    const handleSave = async () => {
        if (!form.image_url) return;
        setSaving(true);

        const bannerData = {
            title: form.title,
            subtitle: form.subtitle,
            image_url: form.image_url,
            badge_text: form.badge_text,
            deep_link: form.deep_link,
            priority_number: parseInt(form.priority_number.toString()) || 0,
            is_active: form.is_active
        };

        const { error } = editBanner
            ? await adminApi.patch(`/api/v1/admin/banners/${editBanner.id}`, bannerData)
            : await adminApi.post('/api/v1/admin/banners', bannerData);

        if (!error) {
            alert('Banner saved successfully!');
            await fetchBanners();
            setIsModalOpen(false);
            setEditBanner(null);
            setForm(initialForm);
        } else {
            alert(`Failed: ${error}`);
        }
        setSaving(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this banner?')) return;
        const { error } = await adminApi.delete(`/api/v1/admin/banners/${id}`);
        if (!error) { fetchBanners(); } else { alert(`Delete failed: ${error}`); }
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        const { error } = await adminApi.patch(`/api/v1/admin/banners/${id}`, { is_active: !currentStatus });
        if (!error) { fetchBanners(); }
    };

    if (loading) return <div className="p-8 text-gray-500 font-medium flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading Banners...</div>;

    return (
        <div className="admin-page-container animate-in fade-in duration-500">
            {/* Header */}
            <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200">
                <div>
                    <h1 className="page-title">Home Banners</h1>
                    <p className="page-subtitle">Manage top-carousel promotional banners for the Customer App.</p>
                </div>
                <button
                    onClick={() => { setEditBanner(null); setForm(initialForm); setIsModalOpen(true); }}
                    className="btn btn-primary"
                >
                    <Plus className="w-4 h-4" /> New Banner
                </button>
            </div>

            {/* List */}
            <div className="promo-grid promo-grid-2col">
                {banners.length === 0 && (
                    <div className="col-span-full text-center text-gray-400 py-20 border-2 border-dashed border-gray-200 rounded-3xl">
                        <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-bold">No active banners. Click "New Banner" to get started.</p>
                    </div>
                )}

                {banners.map(banner => (
                    <div key={banner.id} className="promo-card">
                        {/* Status Badges */}
                        <div className="absolute top-4 right-4 z-10 flex gap-2">
                            <span className="badge badge-under_review border-blue-400 flex items-center gap-1">
                                <ArrowUpCircle className="w-3 h-3" />
                                P{banner.priority_number}
                            </span>
                            <button
                                onClick={() => toggleStatus(banner.id, banner.is_active)}
                                className={`badge cursor-pointer ${banner.is_active ? 'badge-verified' : 'badge-suspended'}`}
                            >
                                {banner.is_active ? 'Active' : 'Inactive'}
                            </button>
                        </div>

                        {/* Image Header */}
                        <div className="promo-image-header h-56">
                            {banner.image_url ? (
                                <img src={banner.image_url} alt={banner.title} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-blue-50">
                                    <ImageIcon className="w-12 h-12 text-blue-200" />
                                </div>
                            )}
                            <div className="promo-gradient-overlay">
                                {banner.badge_text && (
                                    <span className="promo-badge-text">
                                        {banner.badge_text}
                                    </span>
                                )}
                                <h3 className="promo-code-text text-xl mb-1">{banner.title || 'Untitled Banner'}</h3>
                                <p className="text-white/80 text-sm font-medium line-clamp-1">{banner.subtitle || 'Promotional content'}</p>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="promo-card-body">
                            <div className="promo-meta-row">
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{banner.deep_link || 'No redirect link'}</span>
                            </div>

                            <div className="promo-benefit-row">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setEditBanner(banner);
                                            setForm({
                                                title: banner.title || '',
                                                subtitle: banner.subtitle || '',
                                                image_url: banner.image_url || '',
                                                badge_text: banner.badge_text || '',
                                                deep_link: banner.deep_link || '',
                                                priority_number: banner.priority_number,
                                                is_active: banner.is_active
                                            });
                                            setIsModalOpen(true);
                                        }}
                                        className="btn btn-secondary py-2 px-4 text-xs"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(banner.id)}
                                        className="action-icon-btn text-gray-300 hover:text-red-500"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* --- MODAL --- */}
            {isModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal">
                        <div className="admin-modal-header">
                            <div>
                                <h2 className="text-xl font-black text-gray-900">{editBanner ? 'Update' : 'Create'} Banner</h2>
                                <p className="text-sm text-gray-500 font-medium">Design how your hero section looks.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="action-icon-btn"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="admin-modal-body grid grid-cols-2 gap-5">
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Hero Title</label>
                                <input
                                    className="admin-input font-black text-gray-900"
                                    placeholder="e.g. Deep Home Cleaning"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Subtitle / Caption</label>
                                <input
                                    className="admin-input font-bold text-gray-600"
                                    placeholder="e.g. Get up to 40% OFF today"
                                    value={form.subtitle}
                                    onChange={e => setForm({ ...form, subtitle: e.target.value })}
                                />
                            </div>

                            <div className="col-span-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Badge Text</label>
                                <input
                                    className="admin-input font-black text-red-600 uppercase"
                                    placeholder="NEW"
                                    value={form.badge_text}
                                    onChange={e => setForm({ ...form, badge_text: e.target.value.toUpperCase() })}
                                />
                            </div>

                            <div className="col-span-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Priority Level</label>
                                <input
                                    type="number"
                                    className="admin-input font-black"
                                    placeholder="0"
                                    value={form.priority_number}
                                    onChange={e => setForm({ ...form, priority_number: parseInt(e.target.value) || 0 })}
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Image URL</label>
                                <div className="flex items-center gap-4">
                                    <input
                                        className="admin-input flex-1"
                                        placeholder="https://images.unsplash.com/..."
                                        value={form.image_url}
                                        onChange={e => setForm({ ...form, image_url: e.target.value })}
                                    />
                                    <ImagePreview url={form.image_url} size={56} />
                                </div>
                            </div>

                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Link to Category (Optional)</label>
                                <div className="relative">
                                    <select
                                        className="admin-input appearance-none pr-10 font-bold"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'custom') return;
                                            setForm({ ...form, deep_link: val ? `/service/${val}` : '' });
                                        }}
                                        value={form.deep_link.startsWith('/service/') ? form.deep_link.replace('/service/', '') : ''}
                                    >
                                        <option value="">No Redirect</option>
                                        <option value="custom">Custom Link (Enter below)</option>
                                        {services.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Deep Link Redirect (Custom)</label>
                                <input
                                    className="admin-input"
                                    placeholder="/service/123 or /search?q=cleaning"
                                    value={form.deep_link}
                                    onChange={e => setForm({ ...form, deep_link: e.target.value })}
                                />
                            </div>

                            <div className="col-span-2 pt-4">
                                <button
                                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                                    className={`badge cursor-pointer w-full py-4 justify-center gap-2 ${form.is_active ? 'badge-verified shadow-lg' : 'badge-suspended'}`}
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    BANNER VISIBILITY IS {form.is_active ? 'ENABLED' : 'DISABLED'}
                                </button>
                            </div>
                        </div>

                        <div className="p-8 pt-4">
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.image_url}
                                className="btn btn-primary w-full py-5 text-base flex justify-center gap-3"
                            >
                                {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                    <>
                                        <CheckCircle2 className="w-6 h-6" />
                                        {editBanner ? 'UPDATE HERO BANNER' : 'SAVE HERO BANNER'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
