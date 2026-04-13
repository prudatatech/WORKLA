import { create } from 'zustand';

interface ResilienceState {
    isRecovering: boolean;
    lastError: string | null;
    setRecovering: (recovering: boolean, error?: string | null) => void;
}

/**
 * 🛡️ Global Resilience Store
 * Tracks backend "Circuit Breaker" status to show user-friendly
 * recovery banners across the entire application.
 */
export const useResilienceStore = create<ResilienceState>((set) => ({
    isRecovering: false,
    lastError: null,

    setRecovering: (recovering, error = null) => {
        set({ isRecovering: recovering, lastError: error });
        
        // Auto-reset recovering state after 30s if not updated
        // (Matches the backend circuit breaker cooldown)
        if (recovering) {
            setTimeout(() => {
                set((state) => ({ 
                    isRecovering: state.isRecovering ? false : false 
                }));
            }, 30000);
        }
    },
}));
