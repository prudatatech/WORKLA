'use client';

import { adminApi } from '@/utils/api';
import { createClient } from '@/utils/supabase/client';
import {
    ChevronDown,
    ChevronUp,
    Grid,
    ImageIcon,
    ListTree,
    Loader2,
    Plus,
    Trash2,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';

const ImagePreview = ({ url, size = 40 }: { url?: string; size?: number }) => (
    url
        ? <img src={url} alt="preview" className="rounded-lg object-cover border border-gray-200 shadow-sm" style={{ width: size, height: size }} onError={(e) => { (e.target as any).style.display = 'none'; }} />
        : <div className="rounded-lg bg-gray-100 flex items-center justify-center border border-dashed border-gray-300" style={{ width: size, height: size }}>
            <ImageIcon className="w-4 h-4 text-gray-400" />
        </div>
);

export default function CatalogPage() {
    const [services, setServices] = useState<any[]>([]);
    const [subcategories, setSubcategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Accordion UI State
    const [expandedSrvs, setExpandedSrvs] = useState<Set<string>>(new Set());

    // Modal States
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [isSubformModalOpen, setIsSubformModalOpen] = useState(false);
    const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

    // Edit Image Modal
    const [editImageModal, setEditImageModal] = useState<{ id: string; table: string; url: string } | null>(null);

    const [saving, setSaving] = useState(false);

    // Form States
    const [serviceForm, setServiceForm] = useState({
        name: '',
        description: '',
        image_url: '',
        priority_number: 0,
        is_popular: false,
        is_smart_pick: false,
        is_recommended: false
    });
    const [subForm, setSubForm] = useState({
        name: '',
        description: '',
        base_price: '',
        image_url: '',
        is_one_time: true,
        is_daily: false,
        is_weekly: false,
        is_monthly: false,
        is_recommended: false,
        is_popular: false,
        is_smart_pick: false,
        long_description: '',
        benefits: [] as string[],
        exclusions: [] as string[],
        faqs: [] as { q: string, a: string }[],
        gallery_urls: [] as string[]
    });

    const [isRichEditModalOpen, setIsRichEditModalOpen] = useState(false);
    const [editingSubId, setEditingSubId] = useState<string | null>(null);

    const supabase = createClient();

    async function fetchCatalog() {
        setLoading(true);
        const [ { data: srvs }, { data: subs } ] = await Promise.all([
            adminApi.get('/api/v1/admin/services'),
            adminApi.get('/api/v1/admin/subcategories')
        ]);

        if (srvs) setServices(srvs);
        if (subs) setSubcategories(subs);
        setLoading(false);
    };

    useEffect(() => { fetchCatalog(); }, []);

    const toggleSrv = (id: string) => {
        const next = new Set(expandedSrvs);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedSrvs(next);
    };

    const handleSaveService = async () => {
        if (!serviceForm.name) return;
        setSaving(true);
        const payload = {
            name: serviceForm.name,
            description: serviceForm.description,
            image_url: serviceForm.image_url || null,
            priority_number: serviceForm.priority_number,
            is_popular: serviceForm.is_popular,
            is_smart_pick: serviceForm.is_smart_pick,
            is_recommended: serviceForm.is_recommended,
        };

        const { error } = editingServiceId
            ? await adminApi.patch(`/api/v1/admin/services/${editingServiceId}`, payload)
            : await adminApi.post('/api/v1/admin/services', payload);

        if (!error) {
            await fetchCatalog();
            setIsServiceModalOpen(false);
            setEditingServiceId(null);
            setServiceForm({
                name: '', description: '', image_url: '', priority_number: 0,
                is_popular: false, is_smart_pick: false, is_recommended: false
            });
        } else { alert(`Failed: ${error}`); }
        setSaving(false);
    };

    const handleSaveSubcategory = async () => {
        if (!subForm.name || !activeTargetId) return;
        setSaving(true);
        const payload = {
            service_id: activeTargetId,
            name: subForm.name,
            description: subForm.description,
            base_price: parseFloat(subForm.base_price) || 0,
            image_url: subForm.image_url || null,
            is_one_time: subForm.is_one_time,
            is_daily: subForm.is_daily,
            is_weekly: subForm.is_weekly,
            is_monthly: subForm.is_monthly,
            is_recommended: subForm.is_recommended,
            is_popular: subForm.is_popular,
            is_smart_pick: subForm.is_smart_pick
        };

        const { error } = editingSubId 
            ? await adminApi.patch(`/api/v1/admin/subcategories/${editingSubId}`, payload)
            : await adminApi.post('/api/v1/admin/subcategories', payload);

        if (!error) {
            await fetchCatalog();
            setIsSubformModalOpen(false);
            setEditingSubId(null);
            setSubForm({
                name: '',
                description: '',
                base_price: '',
                image_url: '',
                is_one_time: true,
                is_daily: false,
                is_weekly: false,
                is_monthly: false,
                is_recommended: false,
                is_popular: false,
                is_smart_pick: false,
                long_description: '',
                benefits: [],
                exclusions: [],
                faqs: [],
                gallery_urls: []
            });
            setExpandedSrvs(prev => new Set(prev).add(activeTargetId!));
        } else { alert(`Failed: ${error}`); }
        setSaving(false);
    };

    const handleDeleteNode = async (id: string, table: string) => {
        const endpoint = table === 'services' ? 'services' : 'subcategories';
        const { error } = await adminApi.delete(`/api/v1/admin/${endpoint}/${id}`);
        if (!error) { fetchCatalog(); } else { alert(`Delete failed: ${error}`); }
    };

    const handleSaveImageUrl = async () => {
        if (!editImageModal) return;
        setSaving(true);
        const endpoint = editImageModal.table === 'services' ? 'services' : 'subcategories';
        const { error } = await adminApi.patch(`/api/v1/admin/${endpoint}/${editImageModal.id}`, {
            image_url: editImageModal.url || null,
        });
        if (!error) { await fetchCatalog(); setEditImageModal(null); }
        else { alert(`Failed: ${error}`); }
        setSaving(false);
    };

    const handleSaveRichDetails = async () => {
        if (!editingSubId) return;
        setSaving(true);
        const { error } = await adminApi.patch(`/api/v1/admin/subcategories/${editingSubId}`, {
            long_description: subForm.long_description,
            benefits: subForm.benefits,
            exclusions: subForm.exclusions,
            faqs: subForm.faqs,
            gallery_urls: subForm.gallery_urls,
            is_popular: subForm.is_popular,
            is_smart_pick: subForm.is_smart_pick,
            is_recommended: subForm.is_recommended
        });

        if (!error) {
            await fetchCatalog();
            setIsRichEditModalOpen(false);
            setEditingSubId(null);
        } else {
            alert(`Failed to save rich details: ${error}`);
        }
        setSaving(false);
    };

    if (loading) return <div className="p-8 text-gray-500 font-medium flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading Catalog Data...</div>;

    return (
        <div className="catalog-container animate-in fade-in duration-500">
            {/* Header */}
            <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200">
                <div>
                    <h1 className="page-title">Service Catalog</h1>
                    <p className="page-subtitle">Manage top-level Services and specific Subservice Jobs.</p>
                </div>
                <button
                    onClick={() => setIsServiceModalOpen(true)}
                    className="btn btn-primary"
                >
                    <Plus className="w-4 h-4" /> New Service
                </button>
            </div>

            {/* Accordion List */}
            <div className="space-y-4">
                {services.length === 0 && <p className="text-center text-gray-400 py-10 border-2 border-dashed border-gray-200 rounded-2xl">No services found. Start by creating one.</p>}

                {services.map(srv => {
                    const srvSubs = subcategories.filter(sub => sub.service_id === srv.id);
                    const isSrvExpanded = expandedSrvs.has(srv.id);

                    return (
                        <div key={srv.id} className="catalog-accordion-item">
                            {/* Service Header */}
                            <div
                                onClick={() => toggleSrv(srv.id)}
                                className="catalog-srv-header"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="relative group/img">
                                        {srv.image_url
                                            ? <img src={srv.image_url} alt={srv.name} className="w-12 h-12 rounded-xl object-cover border border-gray-200" onError={(e) => { (e.target as any).style.display = 'none'; }} />
                                            : <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600"><Grid className="w-6 h-6" /></div>
                                        }
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditImageModal({ id: srv.id, table: 'services', url: srv.image_url || '' }); }}
                                            className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition"
                                        >
                                            <ImageIcon className="w-4 h-4 text-white" />
                                        </button>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-lg font-black text-gray-800">{srv.name}</h2>
                                            {srv.service_code && <span className="badge badge-under_review border-indigo-200 text-indigo-700">{srv.service_code}</span>}
                                            {srv.priority_number > 0 && <span className="badge badge-pending">P: {srv.priority_number}</span>}
                                            {srv.is_popular && <span className="badge badge-pending">⭐ Popular</span>}
                                            {srv.is_smart_pick && <span className="badge badge-under_review">⚡ Smart</span>}
                                            {srv.is_recommended && <span className="badge badge-rejected">❤️ Rec</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 font-medium">{srvSubs.length} Subservices inside</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingServiceId(srv.id);
                                            setServiceForm({
                                                name: srv.name,
                                                description: srv.description || '',
                                                image_url: srv.image_url || '',
                                                priority_number: srv.priority_number,
                                                is_popular: srv.is_popular,
                                                is_smart_pick: srv.is_smart_pick,
                                                is_recommended: srv.is_recommended
                                            });
                                            setIsServiceModalOpen(true);
                                        }}
                                        className="action-icon-btn text-indigo-400"
                                        title="Edit Service"
                                    >
                                        <Grid className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteNode(srv.id, 'services'); }}
                                        className="action-icon-btn text-gray-400 hover:text-red-600"
                                        title="Delete Service"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <div className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-full text-gray-400">
                                        {isSrvExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </div>
                                </div>
                            </div>

                            {/* Subservices (Tier 2) */}
                            {isSrvExpanded && (
                                <div className="catalog-subs-list">
                                    <div className="flex justify-between items-center mb-4 pl-[4.5rem]">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><ListTree className="w-3.5 h-3.5" /> Subservices</h3>
                                        <button
                                            onClick={() => { setActiveTargetId(srv.id); setIsSubformModalOpen(true); }}
                                            className="btn-ghost-success"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Add Subservice
                                        </button>
                                    </div>

                                    <div className="space-y-3 pl-[4.5rem]">
                                        {srvSubs.length === 0 && <p className="text-xs text-gray-400">No subservices yet.</p>}
                                        {srvSubs.map(sub => (
                                            <div key={sub.id} className="catalog-sub-card">
                                                {/* Sub image */}
                                                <div className="relative group/subimg shrink-0">
                                                    {sub.image_url
                                                        ? <img src={sub.image_url} alt={sub.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" onError={(e) => { (e.target as any).style.display = 'none'; }} />
                                                        : <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center"><ListTree className="w-5 h-5 text-emerald-400" /></div>
                                                    }
                                                    <button
                                                        onClick={() => setEditImageModal({ id: sub.id, table: 'service_subcategories', url: sub.image_url || '' })}
                                                        className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center opacity-0 group-hover/subimg:opacity-100 transition"
                                                    >
                                                        <ImageIcon className="w-4 h-4 text-white" />
                                                    </button>
                                                </div>
                                                <div className="flex-1 pr-8">
                                                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                        <h4 className="font-bold text-[15px] text-gray-800 leading-tight">{sub.name}</h4>
                                                        {sub.is_popular && <span className="badge badge-pending">⭐ Pop</span>}
                                                        {sub.is_smart_pick && <span className="badge badge-under_review">⚡ Smart</span>}
                                                        {sub.is_recommended && <span className="badge badge-verified border-yellow-400 text-yellow-700">⭐ Rec</span>}
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 mb-1.5 line-clamp-1">{sub.description}</p>

                                                    <div className="flex items-center justify-between mt-2">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {sub.is_one_time && <span className="badge badge-under_review">One-time</span>}
                                                            {sub.is_daily && <span className="badge badge-verified">Daily</span>}
                                                            {sub.is_weekly && <span className="badge badge-reverify">Weekly</span>}
                                                            {sub.is_monthly && <span className="badge badge-rejected">Monthly</span>}
                                                        </div>
                                                        <p className="text-sm font-black text-emerald-700">₹{sub.base_price}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteNode(sub.id, 'service_subcategories')}
                                                    className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setActiveTargetId(srv.id);
                                                        setEditingSubId(sub.id);
                                                        setSubForm({
                                                            ...subForm,
                                                            name: sub.name,
                                                            description: sub.description || '',
                                                            base_price: sub.base_price?.toString() || '',
                                                            image_url: sub.image_url || '',
                                                            is_one_time: sub.is_one_time,
                                                            is_daily: sub.is_daily,
                                                            is_weekly: sub.is_weekly,
                                                            is_monthly: sub.is_monthly,
                                                            is_recommended: sub.is_recommended,
                                                            is_popular: sub.is_popular,
                                                            is_smart_pick: sub.is_smart_pick
                                                        });
                                                        setIsSubformModalOpen(true);
                                                    }}
                                                    className="absolute top-3 right-10 p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100 transition"
                                                    title="Edit Subservice Basics"
                                                >
                                                    <ListTree className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingSubId(sub.id);
                                                        setSubForm({
                                                            ...subForm,
                                                            name: sub.name,
                                                            description: sub.description || '',
                                                            base_price: sub.base_price?.toString() || '',
                                                            image_url: sub.image_url || '',
                                                            is_one_time: sub.is_one_time,
                                                            is_daily: sub.is_daily,
                                                            is_weekly: sub.is_weekly,
                                                            is_monthly: sub.is_monthly,
                                                            is_recommended: sub.is_recommended,
                                                            is_popular: sub.is_popular,
                                                            is_smart_pick: sub.is_smart_pick,
                                                            long_description: sub.long_description || '',
                                                            benefits: sub.benefits || [],
                                                            exclusions: sub.exclusions || [],
                                                            faqs: sub.faqs || [],
                                                            gallery_urls: sub.gallery_urls || []
                                                        });
                                                        setIsRichEditModalOpen(true);
                                                    }}
                                                    className="absolute top-10 right-3 p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100 transition"
                                                    title="Edit Rich Details"
                                                >
                                                    <Loader2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* --- MODALS --- */}

            {/* Service Modal */}
            {isServiceModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal">
                        <div className="admin-modal-header">
                            <div>
                                <h2 className="text-lg font-black text-gray-900">{editingServiceId ? 'Edit' : 'New'} Service</h2>
                                <p className="text-xs text-gray-500 font-medium">Top Level Category (e.g. Electrician)</p>
                            </div>
                            <button onClick={() => setIsServiceModalOpen(false)} className="action-icon-btn"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="admin-modal-body space-y-3">
                            <input
                                className="admin-input"
                                placeholder="Name (e.g. Electrician)"
                                value={serviceForm.name}
                                onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                            />
                            <textarea
                                className="admin-textarea"
                                placeholder="Description"
                                value={serviceForm.description}
                                onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })}
                            />
                            <div className="flex gap-2 items-center">
                                <input
                                    className="admin-input"
                                    placeholder="Image URL (optional)"
                                    value={serviceForm.image_url}
                                    onChange={e => setServiceForm({ ...serviceForm, image_url: e.target.value })}
                                />
                                <ImagePreview url={serviceForm.image_url} size={42} />
                            </div>

                            <div>
                                <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Priority Map</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={999}
                                    className="admin-input font-bold"
                                    placeholder="Priority (higher = first)"
                                    value={serviceForm.priority_number || ''}
                                    onChange={e => setServiceForm({ ...serviceForm, priority_number: parseInt(e.target.value) || 0 })}
                                />
                                <div>
                                    <p className="text-[10px] text-gray-400 mt-1">Controls sort order on customer home screen</p>
                                </div>

                                <div className="pt-2 border-t border-gray-100 mt-2 space-y-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Home Visibility</p>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setServiceForm({ ...serviceForm, is_popular: !serviceForm.is_popular })}
                                            className={`badge cursor-pointer w-full text-center ${serviceForm.is_popular ? 'badge-pending border-amber-400' : 'badge-suspended'}`}
                                        >
                                            ⭐ Popular Section
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setServiceForm({ ...serviceForm, is_smart_pick: !serviceForm.is_smart_pick })}
                                            className={`badge cursor-pointer w-full text-center ${serviceForm.is_smart_pick ? 'badge-under_review border-indigo-400' : 'badge-suspended'}`}
                                        >
                                            ⚡ Smart Pick
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setServiceForm({ ...serviceForm, is_recommended: !serviceForm.is_recommended })}
                                            className={`badge cursor-pointer w-full text-center ${serviceForm.is_recommended ? 'badge-rejected border-rose-400' : 'badge-suspended'}`}
                                        >
                                            ❤️ Recommendation (For You)
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { handleSaveService(); }}
                                    disabled={saving || !serviceForm.name}
                                    className="btn btn-primary w-full mt-6 py-4"
                                >
                                    {editingServiceId ? 'Update Service' : <Plus className="w-5 h-5 mx-auto" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Subservice Modal */}
            {isSubformModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal">
                        <div className="admin-modal-header">
                            <div>
                                <h2 className="text-lg font-black text-gray-900">{editingSubId ? 'Edit' : 'New'} Subservice</h2>
                                <p className="text-xs text-gray-500 font-medium">Specific task inside a Service</p>
                            </div>
                            <button onClick={() => { setIsSubformModalOpen(false); setEditingSubId(null); }} className="action-icon-btn"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="admin-modal-body space-y-3">
                            <input
                                className="admin-input"
                                placeholder="Name (e.g. Fan Install)"
                                value={subForm.name}
                                onChange={e => setSubForm({ ...subForm, name: e.target.value })}
                            />
                            <input
                                type="number"
                                className="admin-input"
                                placeholder="Base Price (₹)"
                                value={subForm.base_price}
                                onChange={e => setSubForm({ ...subForm, base_price: e.target.value })}
                            />
                            <textarea
                                className="admin-textarea"
                                placeholder="Description / Scope"
                                value={subForm.description}
                                onChange={e => setSubForm({ ...subForm, description: e.target.value })}
                            />
                            <div className="flex gap-2 items-center">
                                <input
                                    className="admin-input"
                                    placeholder="Image URL (optional)"
                                    value={subForm.image_url}
                                    onChange={e => setSubForm({ ...subForm, image_url: e.target.value })}
                                />
                                <ImagePreview url={subForm.image_url} size={42} />
                            </div>

                            {/* ── Availability Flags ── */}
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 mt-2">Support Modes</p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {[
                                        { key: 'is_one_time', label: 'One', color: 'indigo', badge: 'badge-under_review' },
                                        { key: 'is_daily', label: 'Daily', color: 'emerald', badge: 'badge-verified' },
                                        { key: 'is_weekly', label: 'Wkly', color: 'violet', badge: 'badge-reverify' },
                                        { key: 'is_monthly', label: 'Mnth', color: 'rose', badge: 'badge-rejected' },
                                    ].map(({ key, label, badge }) => {
                                        const checked = subForm[key as keyof typeof subForm] as boolean;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setSubForm({ ...subForm, [key]: !checked })}
                                                className={`badge cursor-pointer ${checked ? badge : 'badge-suspended'}`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Home Visibility Flags ── */}
                            <div className="pt-2 border-t border-gray-100 mt-2 space-y-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Home Visibility</p>
                                <div className="flex flex-col gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSubForm({ ...subForm, is_popular: !subForm.is_popular })}
                                        className={`badge cursor-pointer w-full text-center ${subForm.is_popular ? 'badge-pending border-amber-400' : 'badge-suspended'}`}
                                    >
                                        ⭐ Popular Section
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSubForm({ ...subForm, is_smart_pick: !subForm.is_smart_pick })}
                                        className={`badge cursor-pointer w-full text-center ${subForm.is_smart_pick ? 'badge-under_review border-indigo-400' : 'badge-suspended'}`}
                                    >
                                        ⚡ Smart Pick
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSubForm({ ...subForm, is_recommended: !subForm.is_recommended })}
                                        className={`badge cursor-pointer w-full text-center ${subForm.is_recommended ? 'badge-rejected border-rose-400' : 'badge-suspended'}`}
                                    >
                                        ❤️ Recommendation (For You)
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => { handleSaveSubcategory(); }}
                                disabled={saving || !subForm.name}
                                className="btn btn-primary w-full mt-4 py-4"
                            >
                                {editingSubId ? 'Update Subservice' : <Plus className="w-5 h-5 mx-auto" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Image URL Modal */}
            {editImageModal && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal">
                        <div className="admin-modal-header">
                            <div>
                                <h2 className="text-lg font-black text-gray-900">Edit Image URL</h2>
                                <p className="text-xs text-gray-500 font-medium">Paste a Supabase Storage URL or any public image URL</p>
                            </div>
                            <button onClick={() => setEditImageModal(null)} className="action-icon-btn"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="admin-modal-body">
                            {/* Live preview */}
                            {editImageModal.url && (
                                <div className="mb-4 rounded-xl overflow-hidden border border-gray-200 h-40 bg-gray-50 flex items-center justify-center">
                                    <img src={editImageModal.url} alt="preview" className="w-full h-full object-cover" onError={(e) => { (e.target as any).style.display = 'none'; }} />
                                </div>
                            )}

                            <div className="space-y-4">
                                <input
                                    className="admin-input"
                                    placeholder="https://your-project.supabase.co/storage/v1/object/public/..."
                                    value={editImageModal.url}
                                    onChange={e => setEditImageModal({ ...editImageModal, url: e.target.value })}
                                />
                                <p className="text-xs text-gray-400">
                                    💡 Upload images in <strong>Supabase Dashboard → Storage → service-images</strong>, then copy the public URL here.
                                </p>
                                <div className="flex gap-3 mt-4">
                                    <button onClick={() => setEditImageModal(null)} className="btn btn-secondary flex-1">Cancel</button>
                                    <button onClick={handleSaveImageUrl} disabled={saving} className="btn btn-primary flex-1">Save</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Rich Details Modal */}
            {isRichEditModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal admin-modal-lg">
                        <div className="admin-modal-header">
                            <div>
                                <h2 className="text-xl font-black text-gray-900">Edit Rich Details</h2>
                                <p className="text-sm text-gray-500 font-medium">Content for {subForm.name}</p>
                            </div>
                            <button onClick={() => setIsRichEditModalOpen(false)} className="action-icon-btn"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Visibility Flags */}
                            <section className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setSubForm({ ...subForm, is_popular: !subForm.is_popular })}
                                    className={`badge cursor-pointer ${subForm.is_popular ? 'badge-pending border-amber-400' : 'badge-suspended'}`}
                                >
                                    ⭐ Popular
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSubForm({ ...subForm, is_smart_pick: !subForm.is_smart_pick })}
                                    className={`badge cursor-pointer ${subForm.is_smart_pick ? 'badge-under_review border-indigo-400' : 'badge-suspended'}`}
                                >
                                    ⚡ Smart Pick
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSubForm({ ...subForm, is_recommended: !subForm.is_recommended })}
                                    className={`badge cursor-pointer ${subForm.is_recommended ? 'badge-rejected border-rose-400' : 'badge-suspended'}`}
                                >
                                    ❤️ Recommended
                                </button>
                            </section>

                            {/* 1. Long Description */}
                            <section className="space-y-3">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <ListTree className="w-4 h-4" /> Full Description
                                </h3>
                                <textarea
                                    className="admin-textarea h-32"
                                    placeholder="Detailed description of what the service entails, steps involved, etc."
                                    value={subForm.long_description}
                                    onChange={e => setSubForm({ ...subForm, long_description: e.target.value })}
                                />
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* 2. Benefits */}
                                <section className="space-y-3">
                                    <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                                        <Plus className="w-4 h-4" /> Benefits & Inclusion
                                    </h3>
                                    <div className="space-y-2">
                                        {subForm.benefits?.map((b, i) => (
                                            <div key={i} className="flex gap-2">
                                                <input
                                                    className="flex-1 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-xs font-bold outline-none"
                                                    value={b}
                                                    onChange={e => {
                                                        const next = [...subForm.benefits];
                                                        next[i] = e.target.value;
                                                        setSubForm({ ...subForm, benefits: next });
                                                    }}
                                                />
                                                <button onClick={() => {
                                                    const next = subForm.benefits.filter((_, idx) => idx !== i);
                                                    setSubForm({ ...subForm, benefits: next });
                                                }} className="action-icon-btn text-red-500"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => setSubForm({ ...subForm, benefits: [...(subForm.benefits || []), ''] })}
                                            className="w-full py-2 border-2 border-dashed border-emerald-100 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-50"
                                        >
                                            + Add Benefit
                                        </button>
                                    </div>
                                </section>

                                {/* 3. Exclusions */}
                                <section className="space-y-3">
                                    <h3 className="text-xs font-black text-rose-600 uppercase tracking-widest flex items-center gap-2">
                                        <X className="w-4 h-4" /> Exclusions
                                    </h3>
                                    <div className="space-y-2">
                                        {subForm.exclusions?.map((e, i) => (
                                            <div key={i} className="flex gap-2">
                                                <input
                                                    className="flex-1 p-2 bg-rose-50 border border-rose-100 rounded-lg text-xs font-bold outline-none"
                                                    value={e}
                                                    onChange={val => {
                                                        const next = [...subForm.exclusions];
                                                        next[i] = val.target.value;
                                                        setSubForm({ ...subForm, exclusions: next });
                                                    }}
                                                />
                                                <button onClick={() => {
                                                    const next = subForm.exclusions.filter((_, idx) => idx !== i);
                                                    setSubForm({ ...subForm, exclusions: next });
                                                }} className="action-icon-btn text-red-500"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => setSubForm({ ...subForm, exclusions: [...(subForm.exclusions || []), ''] })}
                                            className="w-full py-2 border-2 border-dashed border-rose-100 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-50"
                                        >
                                            + Add Exclusion
                                        </button>
                                    </div>
                                </section>
                            </div>

                            {/* 4. FAQs */}
                            <section className="space-y-3">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    FAQ Question & Answers
                                </h3>
                                <div className="space-y-4">
                                    {subForm.faqs?.map((f, i) => (
                                        <div key={i} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 relative group">
                                            <input
                                                className="admin-input bg-white"
                                                placeholder="Question"
                                                value={f.q}
                                                onChange={e => {
                                                    const next = [...subForm.faqs];
                                                    next[i] = { ...next[i], q: e.target.value };
                                                    setSubForm({ ...subForm, faqs: next });
                                                }}
                                            />
                                            <textarea
                                                className="admin-textarea bg-white"
                                                placeholder="Answer"
                                                value={f.a}
                                                onChange={e => {
                                                    const next = [...subForm.faqs];
                                                    next[i] = { ...next[i], a: e.target.value };
                                                    setSubForm({ ...subForm, faqs: next });
                                                }}
                                            />
                                            <button onClick={() => {
                                                const next = subForm.faqs.filter((_, idx) => idx !== i);
                                                setSubForm({ ...subForm, faqs: next });
                                            }} className="absolute top-2 right-2 action-icon-btn text-red-400 opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setSubForm({ ...subForm, faqs: [...(subForm.faqs || []), { q: '', a: '' }] })}
                                        className="w-full py-3 border-2 border-dashed border-gray-100 text-gray-500 rounded-2xl text-xs font-bold hover:bg-gray-50"
                                    >
                                        + Add FAQ Entry
                                    </button>
                                </div>
                            </section>

                            {/* 5. Gallery */}
                            <section className="space-y-3 pb-8">
                                <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4" /> Gallery Showcase
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {subForm.gallery_urls?.map((g, i) => (
                                        <div key={i} className="relative group/gal">
                                            <img src={g} className="w-full h-32 rounded-2xl object-cover border border-gray-100" onError={e => (e.target as any).style.display = 'none'} />
                                            <div className="absolute inset-x-0 bottom-0 p-2 bg-black/50 backdrop-blur-sm opacity-0 group-hover/gal:opacity-100 transition">
                                                <input
                                                    className="w-full bg-transparent text-[9px] text-white outline-none"
                                                    value={g}
                                                    onChange={e => {
                                                        const next = [...subForm.gallery_urls];
                                                        next[i] = e.target.value;
                                                        setSubForm({ ...subForm, gallery_urls: next });
                                                    }}
                                                />
                                            </div>
                                            <button onClick={() => {
                                                const next = subForm.gallery_urls.filter((_, idx) => idx !== i);
                                                setSubForm({ ...subForm, gallery_urls: next });
                                            }} className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover/gal:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setSubForm({ ...subForm, gallery_urls: [...(subForm.gallery_urls || []), ''] })}
                                        className="w-full py-3 border-2 border-dashed border-gray-100 text-gray-500 rounded-2xl text-xs font-bold hover:bg-gray-50"
                                    >
                                        + Add Photo
                                    </button>
                                </div>
                            </section>

                            {/* 6. Visibility Toggles */}
                            <section className="space-y-3 pb-8 border-t border-gray-100 pt-6">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Home Screen Visibility</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSubForm({ ...subForm, is_popular: !subForm.is_popular })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-black border transition ${subForm.is_popular ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                                    >
                                        ⭐ Popular Section
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSubForm({ ...subForm, is_smart_pick: !subForm.is_smart_pick })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-black border transition ${subForm.is_smart_pick ? 'bg-indigo-100 border-indigo-400 text-indigo-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                                    >
                                        ⚡ Smart Pick
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSubForm({ ...subForm, is_recommended: !subForm.is_recommended })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-black border transition ${subForm.is_recommended ? 'bg-rose-100 border-rose-400 text-rose-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                                    >
                                        ❤️ Recommendation
                                    </button>
                                </div>
                            </section>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex gap-4 bg-gray-50 shrink-0">
                            <button onClick={() => setIsRichEditModalOpen(false)} className="flex-1 py-4 bg-white border border-gray-200 text-gray-700 font-black rounded-2xl hover:bg-gray-100 transition">Discard Changes</button>
                            <button onClick={handleSaveRichDetails} disabled={saving} className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition">
                                {saving ? 'Syncing with Workla Cloud...' : 'Update Service Experience'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
