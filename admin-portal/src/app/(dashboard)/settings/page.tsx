'use client';

import {
    Database,
    Globe,
    Lock,
    Save,
    ShieldAlert
} from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
    const [saving, setSaving] = useState(false);

    const SECTIONS = [
        {
            title: 'General Configuration',
            icon: Globe,
            items: [
                { label: 'Platform Name', value: 'Workla', type: 'text' },
                { label: 'Support Email', value: 'admin@workla.in', type: 'email' },
                { label: 'Currency Symbol', value: '₹', type: 'text' },
            ]
        },
        {
            title: 'Commission & Fees',
            icon: Database,
            items: [
                { label: 'Base Platform Fee (%)', value: '10', type: 'number' },
                { label: 'Fixed Booking Fee (₹)', value: '25', type: 'number' },
                { label: 'Worker Payout Threshold (₹)', value: '500', type: 'number' },
            ]
        },
        {
            title: 'Security',
            icon: Lock,
            items: [
                { label: 'Auto-verify Workers', value: false, type: 'toggle' },
                { label: 'Require Face ID (Mobile App)', value: true, type: 'toggle' },
                { label: '2FA for Admins', value: true, type: 'toggle' },
            ]
        }
    ];

    const handleSave = () => {
        setSaving(true);
        setTimeout(() => {
            setSaving(false);
            alert('Settings saved successfully!');
        }, 1000);
    };

    return (
        <div className="admin-page-container animate-in fade-in duration-500 max-w-4xl pb-20">
            <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200 mb-8">
                <div>
                    <h1 className="page-title">System Settings</h1>
                    <p className="page-subtitle">Configure platform-wide variables and administrative controls</p>
                </div>
            </div>

            <div className="settings-list">
                {SECTIONS.map((section) => (
                    <div key={section.title} className="settings-section">
                        <div className="settings-section-header">
                            <section.icon className="w-4 h-4 text-blue-500" />
                            <h2 className="settings-section-title">{section.title}</h2>
                        </div>
                        <div className="settings-items-container">
                            {section.items.map((item) => (
                                <div key={item.label} className="settings-item">
                                    <div className="settings-item-info">
                                        <p className="settings-item-label">{item.label}</p>
                                        <p className="settings-item-help">Platform setting ID: {item.label.toLowerCase().replace(/ /g, '_')}</p>
                                    </div>

                                    {item.type === 'toggle' ? (
                                        <button className={`toggle-switch ${item.value ? 'active' : ''}`}>
                                            <div className="toggle-handle" />
                                        </button>
                                    ) : (
                                        <input
                                            type={item.type}
                                            defaultValue={item.value as string}
                                            className="admin-input w-48 text-right"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between p-6 bg-blue-50 rounded-2xl border border-blue-100 mt-8 mb-12">
                <div className="flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-blue-600" />
                    <p className="text-sm font-bold text-blue-800">Review changes before saving platform-wide configuration.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary px-8 py-3"
                >
                    {saving ? 'Saving...' : <><Save className="w-4 h-4 mr-2 inline" /> Save Changes</>}
                </button>
            </div>

            <div className="danger-zone">
                <h3 className="danger-zone-title">
                    <ShieldAlert className="w-4 h-4" /> Danger Zone
                </h3>
                <p className="danger-zone-description">Actions here are permanent and affect all system users.</p>
                <div className="flex gap-4">
                    <button className="btn-danger-outline">
                        Reset Platform Cache
                    </button>
                    <button className="btn-danger-outline">
                        Maintenance Mode: OFF
                    </button>
                </div>
            </div>
        </div>
    );
}
