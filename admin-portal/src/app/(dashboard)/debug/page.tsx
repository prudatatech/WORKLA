'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

export default function DebugPage() {
    const supabase = createClient();
    const [locations, setLocations] = useState<any[]>([]);
    const [details, setDetails] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchState = async () => {
            const { data: locs } = await supabase.from('provider_locations').select('*');
            const { data: dets } = await supabase.from('provider_details').select('*');
            if (locs) setLocations(locs);
            if (dets) setDetails(dets);
            setLoading(false);
        };
        fetchState();
    }, []);

    return (
        <div className="admin-page-container animate-in fade-in duration-500 font-mono text-sm">
            <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200 mb-8">
                <div>
                    <h1 className="page-title text-2xl font-bold">Live Database State (Debug)</h1>
                    <p className="page-subtitle">Inspect raw provider tracking and registry records in real-time.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="chart-card p-0 overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-100 p-4">
                            <h2 className="font-black text-gray-900 uppercase tracking-widest text-[10px]">provider_locations (Tracking)</h2>
                        </div>
                        <pre className="bg-gray-900 text-green-400 p-6 overflow-auto h-[400px] text-xs">
                            {JSON.stringify(locations, null, 2)}
                        </pre>
                    </div>

                    <div className="chart-card p-0 overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-100 p-4">
                            <h2 className="font-black text-gray-900 uppercase tracking-widest text-[10px]">provider_details (Registry)</h2>
                        </div>
                        <pre className="bg-gray-900 text-green-400 p-6 overflow-auto h-[400px] text-xs">
                            {JSON.stringify(details, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
