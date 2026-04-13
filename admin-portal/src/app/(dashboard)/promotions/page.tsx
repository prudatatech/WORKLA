'use client';

import { adminApi } from '@/utils/api';
import { createClient } from '@/utils/supabase/client';
import {
    CheckCircle2,
    Gift,
    ImageIcon,
    Loader2,
    Plus,
    Tag,
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

export default function PromotionsPage() {
    const [promotions, setPromotions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Modal States
    const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
    const [editPromo, setEditPromo] = useState<any>(null);

    // Form States
    const initialForm = {
        code: '',
        title: '',
        description: '',
        discount_type: 'percentage',
        discount_value: '',
        image_url: '',
        is_banner: false,
        is_active: true,
        valid_till: ''
    };
    const [form, setForm] = useState(initialForm);

    const supabase = createClient();

    async function fetchPromotions() {
        setLoading(true);
        const { data, error } = await supabase
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setPromotions(data);
        setLoading(false);
    };

    useEffect(() => { fetchPromotions(); }, []);

    const handleSavePromo = async () => {
        if (!form.code || !form.discount_value) return;
        setSaving(true);

        const promoData = {
            ...form,
            discount_value: parseFloat(form.discount_value as string) || 0,
            valid_till: form.valid_till || null
        };

        const { error } = editPromo
            ? await adminApi.patch(`/api/v1/coupons/${editPromo.id}`, promoData)
            : await adminApi.post('/api/v1/coupons', promoData);

        if (!error) {
            await fetchPromotions();
            setIsPromoModalOpen(false);
            setEditPromo(null);
            setForm(initialForm);
        } else {
            alert(`Failed: ${error}`);
        }
        setSaving(false);
    };

    const handleDeletePromo = async (id: string) => {
        if (!confirm('Are you sure you want to delete this promotion?')) return;
        const { error } = await adminApi.delete(`/api/v1/coupons/${id}`);
        if (!error) { fetchPromotions(); } else { alert(`Delete failed: ${error}`); }
    };

    const toggleStatus = async (id: string, currentStatus: boolean, field: string) => {
        const { error } = await adminApi.patch(`/api/v1/coupons/${id}`, { [field]: !currentStatus });
        if (!error) { fetchPromotions(); }
    };

    if (loading) return <div className="p-8 text-gray-500 font-medium flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading Promotions...</div>;

    return (
        <div className="admin-page-container animate-in fade-in duration-500">
            {/* Header */}
            <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200">
                <div>
                    <h1 className="page-title">Promotions & Offers</h1>
                    <p className="page-subtitle">Manage discount coupons and home screen banners.</p>
                </div>
                <button
                    onClick={() => { setEditPromo(null); setForm(initialForm); setIsPromoModalOpen(true); }}
                    className="btn btn-primary"
                >
                    <Plus className="w-4 h-4" /> New Promotion
                </button>
            </div>

            {/* List */}
            <div className="promo-grid">
                {promotions.length === 0 && (
                    <div className="col-span-full text-center text-gray-400 py-20 border-2 border-dashed border-gray-200 rounded-3xl">
                        <Gift className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-bold">No active promotions. Click "New Promotion" to get started.</p>
                    </div>
                )}

                {promotions.map(promo => (
                    <div key={promo.id} className="promo-card">
                        {/* Status Badges */}
                        <div className="absolute top-4 right-4 z-10 flex gap-2">
                            {promo.is_banner && <span className="badge badge-pending border-amber-400">Banner</span>}
                            <button
                                onClick={() => toggleStatus(promo.id, promo.is_active, 'is_active')}
                                className={`badge cursor-pointer ${promo.is_active ? 'badge-verified' : 'badge-suspended'}`}
                            >
                                {promo.is_active ? 'Active' : 'Inactive'}
                            </button>
                        </div>

                        {/* Image Header */}
                        <div className="promo-image-header">
                            {promo.image_url ? (
                                <img src={promo.image_url} alt={promo.title} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-indigo-50">
                                    <Tag className="w-12 h-12 text-indigo-200" />
                                </div>
                            )}
                            <div className="promo-gradient-overlay">
                                <span className="promo-code-label">Promo Code</span>
                                <h3 className="promo-code-text">{promo.code}</h3>
                                <p className="text-white/70 text-xs font-bold truncate">{promo.title || 'Special Discount'}</p>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-gray-500 font-medium line-clamp-2 h-8">{promo.description || 'No description provided.'}</p>

                            <div className="promo-benefit-row">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1 text-left">Benefit</p>
                                    <p className="promo-benefit-value">
                                        {promo.discount_type === 'percentage' ? `${promo.discount_value}% OFF` : `₹${promo.discount_value} OFF`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setEditPromo(promo);
                                            setForm({
                                                code: promo.code,
                                                title: promo.title || '',
                                                description: promo.description || '',
                                                discount_type: promo.discount_type,
                                                discount_value: promo.discount_value.toString(),
                                                image_url: promo.image_url || '',
                                                is_banner: promo.is_banner,
                                                is_active: promo.is_active,
                                                valid_till: promo.valid_till ? new Date(promo.valid_till).toISOString().split('T')[0] : ''
                                            });
                                            setIsPromoModalOpen(true);
                                        }}
                                        className="action-icon-btn"
                                        title="Edit"
                                      >
                                          <Plus className="w-4 h-4 rotate-45 scale-125" />
                                      </button>
                                      <button
                                          onClick={() => handleDeletePromo(promo.id)}
                                          className="action-icon-btn text-gray-300 hover:text-red-500"
                                          title="Delete"
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
              {isPromoModalOpen && (
                  <div className="admin-modal-overlay">
                      <div className="admin-modal">
                          <div className="admin-modal-header">
                              <div>
                                  <h2 className="text-xl font-black text-gray-900">{editPromo ? 'Update' : 'Create'} Promotion</h2>
                                  <p className="text-sm text-gray-500 font-medium">Define offer details and visibility.</p>
                              </div>
                              <button onClick={() => setIsPromoModalOpen(false)} className="action-icon-btn"><X className="w-5 h-5" /></button>
                          </div>
  
                          <div className="admin-modal-body grid grid-cols-2 gap-5">
                              <div className="col-span-1">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Promo Code</label>
                                  <input
                                      className="admin-input font-black text-indigo-600 uppercase"
                                      placeholder="e.g. SAVE50"
                                      value={form.code}
                                      onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                  />
                              </div>
                              <div className="col-span-1">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Expiry Date</label>
                                  <input
                                      type="date"
                                      className="admin-input font-bold"
                                      value={form.valid_till}
                                      onChange={e => setForm({ ...form, valid_till: e.target.value })}
                                  />
                              </div>
  
                              <div className="col-span-2">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Title</label>
                                  <input
                                      className="admin-input font-bold"
                                      placeholder="Enter localized offer title"
                                      value={form.title}
                                      onChange={e => setForm({ ...form, title: e.target.value })}
                                  />
                              </div>
  
                              <div className="col-span-2">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Description</label>
                                  <textarea
                                      className="admin-textarea"
                                      placeholder="Terms and details..."
                                      value={form.description}
                                      onChange={e => setForm({ ...form, description: e.target.value })}
                                  />
                              </div>
  
                              <div className="col-span-1">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Type</label>
                                  <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-200">
                                      <button
                                          onClick={() => setForm({ ...form, discount_type: 'percentage' })}
                                          className={`flex-1 py-2 text-[11px] font-black rounded-xl transition ${form.discount_type === 'percentage' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}
                                      >
                                          PERCENTAGE
                                      </button>
                                      <button
                                          onClick={() => setForm({ ...form, discount_type: 'fixed' })}
                                          className={`flex-1 py-2 text-[11px] font-black rounded-xl transition ${form.discount_type === 'fixed' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}
                                      >
                                          FIXED (₹)
                                      </button>
                                  </div>
                              </div>
                              <div className="col-span-1">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block text-left">Value</label>
                                  <input
                                      type="number"
                                      className="admin-input font-black"
                                      placeholder={form.discount_type === 'percentage' ? '%' : '₹'}
                                      value={form.discount_value}
                                      onChange={e => setForm({ ...form, discount_value: e.target.value })}
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
  
                              <div className="col-span-2 pt-4 flex gap-4">
                                  <button
                                      onClick={() => setForm({ ...form, is_banner: !form.is_banner })}
                                      className={`badge cursor-pointer flex-1 py-4 justify-center gap-2 ${form.is_banner ? 'badge-pending border-amber-400 shadow-lg' : 'badge-suspended'}`}
                                  >
                                      <ImageIcon className={`w-4 h-4 ${form.is_banner ? 'animate-bounce' : ''}`} />
                                      BANNER
                                  </button>
                                  <button
                                      onClick={() => setForm({ ...form, is_active: !form.is_active })}
                                      className={`badge cursor-pointer flex-1 py-4 justify-center gap-2 ${form.is_active ? 'badge-verified shadow-lg' : 'badge-suspended'}`}
                                  >
                                      <CheckCircle2 className="w-4 h-4" />
                                      ACTIVE
                                  </button>
                              </div>
                          </div>
  
                          <div className="p-8 pt-4">
                              <button
                                  onClick={handleSavePromo}
                                  disabled={saving || !form.code || !form.discount_value}
                                  className="btn btn-primary w-full py-5 text-base flex justify-center gap-3"
                              >
                                  {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                      <>
                                          <CheckCircle2 className="w-6 h-6" />
                                          {editPromo ? 'UPDATE PROMOTION' : 'LAUNCH PROMOTION'}
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
