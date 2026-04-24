/**
 * bucketStore.ts
 * Ephemeral Zomato-style service bucket (cart).
 * Max 3 items. Lives in memory only — cleared when app restarts.
 */
import { create } from 'zustand';

export interface BucketItem {
  id: string; // local uuid
  serviceId: string;
  serviceName: string;
  subcategoryId: string;
  subcategoryName: string;
  basePrice: number;
  // Per-item scheduling
  mode: 'now' | 'scheduled';
  scheduledDate: string; // 'Today' | 'Tomorrow'
  scheduledSlot: string; // slot label
  specialInstructions: string;
  paymentMethod: 'cod' | 'online';
  // Pricing
  platformFee: number;
  taxAmount: number;
  totalAmount: number;
}

interface BucketState {
  items: BucketItem[];
  addItem: (item: Omit<BucketItem, 'id'>) => boolean; // returns false if bucket full
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<BucketItem>) => void;
  clearBucket: () => void;
  total: () => number;
}

let _idCounter = 0;

export const useBucketStore = create<BucketState>((set, get) => ({
  items: [],

  addItem: (item) => {
    if (get().items.length >= 3) return false;
    const id = `bucket-${Date.now()}-${_idCounter++}`;
    set((s) => ({ items: [...s.items, { ...item, id }] }));
    return true;
  },

  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),

  clearBucket: () => set({ items: [] }),

  total: () => get().items.reduce((sum, i) => sum + i.totalAmount, 0),
}));
