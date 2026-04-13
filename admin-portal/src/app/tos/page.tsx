'use client';

import { ArrowLeft, Printer, Shield } from 'lucide-react';
import Link from 'next/link';

export default function TOSPage() {
    return (
        <div className="min-h-screen bg-gray-50 font-sans selection:bg-blue-100 selection:text-blue-900">
            {/* Design Elements */}
            <div className="fixed top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 z-50" />
            <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-blue-100/30 blur-[120px] rounded-full pointer-events-none -mr-48 -mt-48" />
            <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-indigo-100/30 blur-[120px] rounded-full pointer-events-none -ml-48 -mb-48" />

            <div className="relative z-10 p-8 md:p-20 max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-16">
                    <Link 
                        href="/login"
                        className="group flex items-center gap-3 text-gray-500 font-bold hover:text-blue-600 transition-all bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-100 w-fit"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
                        Back to Portal
                    </Link>
                    
                    <button 
                        onClick={() => window.print()}
                        className="flex items-center gap-3 bg-gray-900 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-black transition-all shadow-xl shadow-gray-200 w-fit"
                    >
                        <Printer className="w-4 h-4 text-blue-400" />
                        PRINT FOR RECORDS
                    </button>
                </div>

                <div className="bg-white rounded-[40px] shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                    <div className="p-12 md:p-20">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-inner">
                                <Shield className="w-7 h-7" />
                            </div>
                            <div>
                                <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">Terms of Service</h1>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">Legal Compliance & Operational Policy</p>
                            </div>
                        </div>

                        <div className="space-y-12 text-gray-600 leading-relaxed font-medium">
                            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-8">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-3 py-1 bg-white border border-gray-200 rounded-lg">Official Document</span>
                                <span className="text-sm font-bold text-gray-500">Last updated: March 15, 2026</span>
                            </div>

                            <section>
                                <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-sm">01</span>
                                    Acceptance of Terms
                                </h2>
                                <p className="pl-11 text-lg">By accessing the Workla Admin Portal, you agree to be bound by these professional terms of conduct and operational policies. This portal provides advanced administrative capabilities that impact real-world service delivery and financial ecosystems.</p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm">02</span>
                                    Confidentiality & Data Integrity
                                </h2>
                                <p className="pl-11 text-lg">All data accessed within this portal—including Customer PII and Provider business details—is strictly confidential. Unauthorized disclosure, data scraping, or secondary use of information is strictly prohibited and subject to immediate termination and legal action.</p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center text-sm">03</span>
                                    Administrative Responsibility
                                </h2>
                                <p className="pl-11 text-lg">This portal is for authorized administrative use only. Actions performed here, including service verification, payment overrides, and safety alert resolution, carry binding operational consequences. Users must exercise extreme caution and follow standard operating procedures.</p>
                            </section>

                            <div className="pt-20 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
                                <p className="text-sm font-bold text-gray-400 italic">For full legal documentation or inquiries: <a href="mailto:legal@workla.in" className="text-blue-600 hover:underline">legal@workla.in</a></p>
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Version 1.0.4 r44</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
