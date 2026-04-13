'use client';

import { ArrowLeft, Printer, Eye, Lock } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-50 font-sans selection:bg-blue-100 selection:text-blue-900">
            {/* Design Elements */}
            <div className="fixed top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 via-blue-600 to-indigo-600 z-50" />
            <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-emerald-50/50 blur-[120px] rounded-full pointer-events-none -mr-48 -mt-48" />
            <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-blue-50/50 blur-[120px] rounded-full pointer-events-none -ml-48 -mb-48" />

            <div className="relative z-10 p-8 md:p-20 max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-16">
                    <Link 
                        href="/login"
                        className="group flex items-center gap-3 text-gray-500 font-bold hover:text-emerald-600 transition-all bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-100 w-fit"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
                        Back to Portal
                    </Link>
                    
                    <button 
                        onClick={() => window.print()}
                        className="flex items-center gap-3 bg-gray-900 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-black transition-all shadow-xl shadow-gray-200 w-fit"
                    >
                        <Printer className="w-4 h-4 text-emerald-400" />
                        PRINT FOR RECORDS
                    </button>
                </div>

                <div className="bg-white rounded-[40px] shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                    <div className="p-12 md:p-20">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-inner">
                                <Lock className="w-7 h-7" />
                            </div>
                            <div>
                                <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">Privacy Policy</h1>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">Data Protection & Privacy Standards</p>
                            </div>
                        </div>

                        <div className="space-y-12 text-gray-600 leading-relaxed font-medium">
                            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-8">
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-lg">GDPR Compliant</span>
                                <span className="text-sm font-bold text-gray-500">Last updated: March 15, 2026</span>
                            </div>

                            <section>
                                <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm">01</span>
                                    Data Collection Philosophy
                                </h2>
                                <p className="pl-11 text-lg">Workla collects and processes only the specific data points necessary for the secure fulfillment of home service bookings and administrative management. This includes identity verification, geolocation for service routing, and transaction history for financial transparency.</p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-sm">02</span>
                                    Encryption & Protection
                                </h2>
                                <p className="pl-11 text-lg">We implement institutional-grade security measures, including AES-256 at-rest encryption and TLS 1.3 for all data in transit. Admin access is strictly governed by multi-factor authentication and role-based access control (RBAC) to prevent unauthorized internal exposure.</p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm">03</span>
                                    Third-Party Shield
                                </h2>
                                <p className="pl-11 text-lg">Data is only shared with verified service providers to the extent required for service delivery. Workla does not sell, lease, or trade administrative or user data to third-party marketing entities. Our data sharing protocols are regularly audited for compliance.</p>
                            </section>

                            <div className="pt-20 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
                                <p className="text-sm font-bold text-gray-400 italic">For data deletion requests or rights inquiries: <a href="mailto:privacy@workla.in" className="text-emerald-600 hover:underline">privacy@workla.in</a></p>
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ISO 27001 Certified System</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
