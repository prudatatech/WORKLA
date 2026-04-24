import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedAddress {
    id: string;
    label: string;
    name: string;
    address: string;
    landmark?: string;
    isDefault: boolean;
    latitude?: number;
    longitude?: number;
}

interface AddressState {
    selectedAddress: SavedAddress | null;
    rawLocationName: string;
    setSelectedAddress: (address: SavedAddress | null) => void;
    setRawLocationName: (name: string) => void;
    autoDetectAddress: (currentLat: number, currentLng: number, savedAddresses: SavedAddress[]) => void;
}

// Distance helper
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const useAddressStore = create<AddressState>()(
    persist(
        (set, get) => ({
            selectedAddress: null,
            rawLocationName: 'Please select location',

            setSelectedAddress: (address) => set({ selectedAddress: address }),
            setRawLocationName: (name) => set({ rawLocationName: name }),

            autoDetectAddress: (currentLat, currentLng, savedAddresses) => {
                if (!savedAddresses || savedAddresses.length === 0) return;

                let closestAddress: SavedAddress | null = null;
                let shortestDistance = Infinity;

                for (const addr of savedAddresses) {
                    if (addr.latitude && addr.longitude) {
                        const d = getDistanceFromLatLonInKm(currentLat, currentLng, addr.latitude, addr.longitude);
                        if (d < shortestDistance) {
                            shortestDistance = d;
                            closestAddress = addr;
                        }
                    }
                }

                // If close to a saved address, and nothing is selected or we're very close, consider updating
                if (closestAddress && shortestDistance <= 0.15) {
                    const current = get().selectedAddress;
                    // Only auto-switch if nothing selected or if the auto-detected one is the "Default" one
                    if (!current || (closestAddress.isDefault && current.id !== closestAddress.id)) {
                        set({ selectedAddress: closestAddress });
                    }
                } else {
                    if (!get().selectedAddress) {
                        const def = savedAddresses.find(a => a.isDefault) || savedAddresses[0];
                        if (def) set({ selectedAddress: def });
                    }
                }
            },
        }),
        {
            name: 'workla-address-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
