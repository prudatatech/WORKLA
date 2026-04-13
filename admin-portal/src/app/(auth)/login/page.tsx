'use client';

import { createClient } from '@/utils/supabase/client';
import { Loader2, Lock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
//lets see
function LoginContent() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [agreed, setAgreed] = useState(false);

    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    useEffect(() => {
        const authError = searchParams.get('error');
        if (authError === 'unauthorized') {
            setError('Unauthorized: Admin access required.');
        }
    }, [searchParams]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            setError(signInError.message);
            setLoading(false);
            return;
        }

        // Verify Admin role specifically for the logged in user
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', authData.user?.id)
            .single();

        if (!profile?.is_admin) {
            await supabase.auth.signOut();
            setError('Unauthorized: Admin access required.');
            setLoading(false);
            return;
        }

        router.push('/');
        router.refresh();
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 shadow-inner">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Workla Admin</h1>
                    <p className="text-sm text-gray-500 mt-2 font-medium">Secure Portal Login</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 mb-1 block">Email</label>
                        <input
                            type="email"
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-medium"
                            placeholder="admin@workla.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 mb-1 block">Password</label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-lg font-bold placeholder:font-normal placeholder:text-gray-300"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm font-bold p-3 rounded-xl border border-red-100 text-center animate-in fade-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-4">
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className="relative flex items-center mt-0.5">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(e) => setAgreed(e.target.checked)}
                                    className="peer appearance-none w-5 h-5 border-2 border-gray-200 rounded-lg checked:bg-blue-600 checked:border-blue-600 transition-all cursor-pointer"
                                />
                                <svg className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none left-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed group-hover:text-gray-600 transition-colors">
                                I agree to the <a href="/tos" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
                            </span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !email || !password || !agreed}
                        className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:shadow-none disabled:grayscale flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enter Portal'}
                    </button>
                </form>
                <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center gap-6">
                    <a href="/tos" className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-blue-600 transition-colors">Terms of Service</a>
                    <a href="/privacy" className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-blue-600 transition-colors">Privacy Policy</a>
                </div>
            </div>
            <p className="mt-8 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">Workla Management Systems v1.0</p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}
