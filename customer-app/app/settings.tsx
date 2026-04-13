import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Bell,
    ChevronRight,
    Globe,
    Lock,
    Shield,
    Smartphone,
    Trash2,
    Wifi
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#1A3FFF';

export default function SettingsScreen() {
    const router = useRouter();

    // Toggle states
    const [notifBooking, setNotifBooking] = useState(true);
    const [notifPromo, setNotifPromo] = useState(true);
    const [notifChat, setNotifChat] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [locationAlways, setLocationAlways] = useState(false);
    const [biometric, setBiometric] = useState(false);
    const [dataSync, setDataSync] = useState(true);

    const SETTINGS_SECTIONS = [
        {
            title: 'Notifications',
            Icon: Bell,
            items: [
                { label: 'Booking Updates', sub: 'Worker assigned, status changes', value: notifBooking, set: setNotifBooking },
                { label: 'Promotional Offers', sub: 'Deals and discount alerts', value: notifPromo, set: setNotifPromo },
                { label: 'Chat Messages', sub: 'New messages from workers', value: notifChat, set: setNotifChat },
            ],
        },
        {
            title: 'App Preferences',
            Icon: Smartphone,
            items: [
                { label: 'Dark Mode', sub: 'Coming soon', value: darkMode, set: setDarkMode, disabled: true },
                { label: 'Background Sync', sub: 'Keep booking data up to date', value: dataSync, set: setDataSync },
            ],
        },
        {
            title: 'Privacy & Security',
            Icon: Shield,
            items: [
                { label: 'Always share location', sub: 'For faster worker dispatch', value: locationAlways, set: setLocationAlways },
                { label: 'Biometric Login', sub: 'Use fingerprint/face to login', value: biometric, set: setBiometric },
            ],
        },
    ];

    const LINK_ROWS = [
        { label: 'Language', sub: 'English', Icon: Globe, onPress: () => Alert.alert('Coming Soon', 'Multi-language support is coming.') },
        { label: 'Change Password', sub: '', Icon: Lock, onPress: () => Alert.alert('Coming Soon', 'Change password via OTP SMS.') },
        { label: 'Linked Devices', sub: '1 device', Icon: Smartphone, onPress: () => { } },
        { label: 'Data & Storage', sub: '', Icon: Wifi, onPress: () => { } },
        { label: 'Clear Cache', sub: '', Icon: Trash2, onPress: () => Alert.alert('Clear Cache', 'Cache cleared successfully.') },
    ];

    return (
        <SafeAreaView style={s.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Settings</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Toggle sections */}
                {SETTINGS_SECTIONS.map(section => (
                    <View key={section.title} style={s.card}>
                        <View style={s.cardTitleRow}>
                            <section.Icon size={16} color={PRIMARY} />
                            <Text style={s.cardTitle}>{section.title}</Text>
                        </View>
                        {section.items.map((item, idx) => (
                            <View key={item.label} style={[s.settingRow, idx < section.items.length - 1 && s.settingRowBorder]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.settingLabel, item.disabled && { color: '#9CA3AF' }]}>{item.label}</Text>
                                    <Text style={s.settingSub}>{item.sub}</Text>
                                </View>
                                <Switch
                                    value={item.value}
                                    onValueChange={item.disabled ? undefined : item.set}
                                    trackColor={{ false: '#E5E7EB', true: `${PRIMARY}60` }}
                                    thumbColor={item.value ? PRIMARY : '#FFF'}
                                    disabled={item.disabled}
                                />
                            </View>
                        ))}
                    </View>
                ))}

                {/* Link rows */}
                <View style={s.card}>
                    <View style={s.cardTitleRow}>
                        <Smartphone size={16} color={PRIMARY} />
                        <Text style={s.cardTitle}>More Settings</Text>
                    </View>
                    {LINK_ROWS.map((row, idx) => (
                        <TouchableOpacity
                            key={row.label}
                            style={[s.linkRow, idx < LINK_ROWS.length - 1 && s.settingRowBorder]}
                            onPress={row.onPress}
                            activeOpacity={0.7}
                        >
                            <View style={s.linkIconWrap}>
                                <row.Icon size={15} color="#6B7280" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.settingLabel}>{row.label}</Text>
                                {row.sub ? <Text style={s.settingSub}>{row.sub}</Text> : null}
                            </View>
                            <ChevronRight size={15} color="#D1D5DB" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* App version */}
                <View style={s.versionCard}>
                    <Text style={s.versionLabel}>Workla Customer App</Text>
                    <Text style={s.versionNumber}>Version 1.0.0 (Build 1)</Text>
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
    scroll: { padding: 16 },
    card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
    cardTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
    settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    settingRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
    settingLabel: { fontSize: 14, color: '#111827', fontWeight: '500', marginBottom: 2 },
    settingSub: { fontSize: 12, color: '#9CA3AF' },
    linkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    linkIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    versionCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 12 },
    versionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 4 },
    versionNumber: { fontSize: 12, color: '#9CA3AF' },
});
