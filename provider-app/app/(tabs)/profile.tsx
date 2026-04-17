import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
    Banknote,
    Camera,
    CheckCircle2,
    ChevronRight,
    Clock,
    Edit3,
    HelpCircle,
    LogOut,
    MapPin,
    Phone,
    Shield,
    Star,
    Wrench,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Modal,
    RefreshControl as RNRefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatIndianPhone } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ProviderProfileScreen() {
    const [profile, setProfile] = useState<any>(null);
    const [provider, setProvider] = useState<any>(null);
    const [notifEnabled, setNotifEnabled] = useState(true);
    const [locationEnabled, setLocationEnabled] = useState(true);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editName, setEditName] = useState('');
    const [editBusiness, setEditBusiness] = useState('');
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();

    const loadProfile = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: up } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        const { data: sp } = await supabase.from('provider_details').select('*').eq('provider_id', user.id).single();
        setProfile(up);
        setProvider(sp);
        setEditName(up?.full_name || '');
        setEditBusiness(sp?.business_name || '');
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await loadProfile();
        setRefreshing(false);
    }, [loadProfile]);

    useEffect(() => { loadProfile(); }, [loadProfile]);

    const handleUpdateProfile = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Update profiles table
            const { error: pErr } = await supabase.from('profiles').update({ full_name: editName }).eq('id', user.id);
            if (pErr) throw pErr;

            // Update provider_details table (or service_providers)
            const { error: sErr } = await supabase.from('provider_details').update({ business_name: editBusiness }).eq('provider_id', user.id);
            if (sErr) throw sErr;

            await loadProfile();
            setEditModalVisible(false);
        } catch (e: any) {
            alert(e.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.replace('/');
    };

    const fullName = profile?.full_name ?? 'Worker';
    const initial = fullName.charAt(0).toUpperCase();
    const rating = provider?.avg_rating ?? 0;
    const reviews = provider?.total_reviews ?? 0;
    const status = provider?.verification_status ?? 'pending';

    const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
        verified: { label: '✓ Verified', color: '#059669', bg: '#D1FAE5' },
        pending: { label: '⏳ Under Review', color: '#D97706', bg: '#FEF3C7' },
        rejected: { label: '❌ Rejected', color: '#DC2626', bg: '#FEE2E2' },
        suspended: { label: '🚫 Suspended', color: '#DC2626', bg: '#FEE2E2' },
    };
    const statusConf = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

    const MENU_SECTIONS = [
        {
            title: 'Account',
            items: [
                { label: 'Edit Profile', Icon: Edit3, onPress: () => setEditModalVisible(true) },
                { label: 'Service Categories', Icon: Wrench, onPress: () => router.push('/services' as any) },
                { label: 'Earnings & Payouts', Icon: Banknote, onPress: () => router.push('/payouts' as any) },
                { label: 'Working Hours', Icon: Clock, onPress: () => { } },
                { label: 'Service Areas', Icon: MapPin, onPress: () => router.push('/service-areas' as any) },
            ],
        },
        {
            title: 'Preferences',
            items: [
                { label: 'Phone Number', Icon: Phone, value: formatIndianPhone(profile?.phone), onPress: () => { } },
            ],
        },
        {
            title: 'Help & Legal',
            items: [
                { label: 'Help & Support', Icon: HelpCircle, onPress: () => router.navigate('/(tabs)/support' as any) },
            ],
        },
    ];

    return (
        <SafeAreaView style={s.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            <View style={s.header}>
                <Text style={s.headerTitle}>My Profile</Text>
                <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
                    <LogOut size={18} color="#DC2626" />
                </TouchableOpacity>
            </View>

            <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={s.scroll}
                refreshControl={<RNRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
            >

                {/* Profile hero */}
                <View style={s.profileCard}>
                    <View style={s.avatarWrap}>
                        <View style={s.avatar}>
                            <Text style={s.avatarText}>{initial}</Text>
                        </View>
                        <TouchableOpacity style={s.cameraBtn}>
                            <Camera size={14} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    <Text style={s.profileName}>{fullName}</Text>
                    <Text style={s.profileBusiness}>{provider?.business_name ?? 'Independent Worker'}</Text>

                    <View style={[s.statusBadge, { backgroundColor: statusConf.bg }]}>
                        <Text style={[s.statusText, { color: statusConf.color }]}>{statusConf.label}</Text>
                    </View>

                    {/* Rating */}
                    <View style={s.ratingRow}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={18} color={i < Math.round(rating) ? '#F59E0B' : '#E5E7EB'} fill={i < Math.round(rating) ? '#F59E0B' : 'transparent'} />
                        ))}
                        <Text style={s.ratingNum}>{rating > 0 ? rating.toFixed(1) : '–'}</Text>
                        <Text style={s.ratingReviews}>({reviews} reviews)</Text>
                    </View>
                </View>

                {/* Quick stats */}
                <View style={s.statsRow}>
                    <View style={s.statBox}>
                        <Text style={s.statVal}>{provider?.service_categories?.length ?? 0}</Text>
                        <Text style={s.statLbl}>Services</Text>
                    </View>
                    <View style={s.statDiv} />
                    <View style={s.statBox}>
                        <Text style={s.statVal}>{rating > 0 ? rating.toFixed(1) : '–'}</Text>
                        <Text style={s.statLbl}>Rating</Text>
                    </View>
                    <View style={s.statDiv} />
                    <View style={s.statBox}>
                        <CheckCircle2 size={14} color="#059669" />
                        <Text style={[s.statVal, { color: '#059669', fontSize: 12 }]}>{status}</Text>
                        <Text style={s.statLbl}>Status</Text>
                    </View>
                </View>

                {/* Settings toggles */}
                <View style={s.settingsCard}>
                    <Text style={s.settingsTitle}>Notifications</Text>
                    <View style={s.toggleRow}>
                        <Text style={s.toggleLabel}>Job Alerts</Text>
                        <Switch value={notifEnabled} onValueChange={setNotifEnabled} trackColor={{ false: '#E5E7EB', true: `${PRIMARY}60` }} thumbColor={notifEnabled ? PRIMARY : '#9CA3AF'} />
                    </View>
                    <View style={s.toggleRow}>
                        <Text style={s.toggleLabel}>Location Sharing</Text>
                        <Switch value={locationEnabled} onValueChange={setLocationEnabled} trackColor={{ false: '#E5E7EB', true: '#05966960' }} thumbColor={locationEnabled ? '#059669' : '#9CA3AF'} />
                    </View>
                </View>

                {/* Menu sections */}
                {MENU_SECTIONS.map(section => (
                    <View key={section.title} style={s.menuCard}>
                        <Text style={s.menuTitle}>{section.title}</Text>
                        {section.items.map((item, i) => (
                            <TouchableOpacity key={item.label} style={[s.menuRow, i < section.items.length - 1 && s.menuBorder]} onPress={item.onPress}>
                                <View style={s.menuIcon}><item.Icon size={16} color={PRIMARY} /></View>
                                <Text style={s.menuLabel}>{item.label}</Text>
                                {(item as any).value && <Text style={s.menuValue}>{(item as any).value}</Text>}
                                <ChevronRight size={14} color="#D1D5DB" />
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}

                {/* Verification badge */}
                <View style={[s.verifyCard, status === 'rejected' && s.verifyCardError]}>
                    <Shield size={20} color={status === 'verified' ? '#059669' : status === 'rejected' ? '#DC2626' : '#D97706'} />
                    <View style={{ flex: 1 }}>
                        <Text style={[s.verifyTitle, status === 'rejected' && { color: '#DC2626' }]}>
                            {status === 'verified' ? 'Identity Verified' : status === 'rejected' ? 'Action Required' : 'Review in Progress'}
                        </Text>
                        <Text style={[s.verifySub, status === 'rejected' && { color: '#991B1B' }]}>
                            {status === 'verified' 
                                ? 'Your identity and credentials have been verified by Workla.' 
                                : status === 'rejected' 
                                    ? `Verification failed: ${provider?.rejection_reason || 'Please contact support or re-upload documents.'}`
                                    : 'Our team is currently reviewing your documents. You will be notified once complete.'}
                        </Text>
                        {status === 'rejected' && (
                            <TouchableOpacity style={s.reuploadBtn} onPress={() => router.push('/onboarding' as any)}>
                                <Text style={s.reuploadBtnText}>Fix Identity Issues</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            <Modal visible={editModalVisible} animationType="slide" transparent={true}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>Edit Profile</Text>
                        
                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>Full Name</Text>
                            <TextInput 
                                style={s.input} 
                                value={editName} 
                                onChangeText={setEditName}
                                placeholder="Enter your full name"
                            />
                        </View>

                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>Business Name</Text>
                            <TextInput 
                                style={s.input} 
                                value={editBusiness} 
                                onChangeText={setEditBusiness}
                                placeholder="Enter your business name"
                            />
                        </View>

                        <View style={s.modalBtns}>
                            <TouchableOpacity style={s.cancelBtn} onPress={() => setEditModalVisible(false)}>
                                <Text style={s.cancelTxt}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[s.saveBtn, saving && { opacity: 0.7 }]} 
                                onPress={handleUpdateProfile}
                                disabled={saving}
                            >
                                <Text style={s.saveTxt}>{saving ? 'Saving...' : 'Save Changes'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
    signOutBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 16 },
    profileCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#F3F4F6' },
    avatarWrap: { position: 'relative', marginBottom: 12 },
    avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 34, fontWeight: '900', color: PRIMARY },
    cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
    profileName: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 2 },
    profileBusiness: { fontSize: 13, color: '#6B7280', marginBottom: 10 },
    statusBadge: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 12 },
    statusText: { fontSize: 13, fontWeight: '700' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    ratingNum: { fontSize: 16, fontWeight: '800', color: '#111827', marginLeft: 6 },
    ratingReviews: { fontSize: 12, color: '#9CA3AF', marginLeft: 2 },
    statsRow: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#F3F4F6' },
    statBox: { flex: 1, alignItems: 'center', gap: 2 },
    statDiv: { width: 1, backgroundColor: '#F3F4F6' },
    statVal: { fontSize: 18, fontWeight: '900', color: '#111827' },
    statLbl: { fontSize: 11, color: '#9CA3AF' },
    settingsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#F3F4F6' },
    settingsTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    toggleLabel: { fontSize: 14, color: '#374151' },
    menuCard: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: '#F3F4F6' },
    menuTitle: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, textTransform: 'uppercase' },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    menuBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
    menuIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    menuLabel: { flex: 1, fontSize: 14, color: '#374151' },
    menuValue: { fontSize: 13, color: '#9CA3AF', marginRight: 4 },
    verifyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#D1DBFF' },
    verifyCardError: { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' },
    verifyTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 2 },
    verifySub: { fontSize: 12, color: '#3B82F6', lineHeight: 17 },
    reuploadBtn: { marginTop: 12, backgroundColor: '#DC2626', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' },
    reuploadBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 24 },
    inputGroup: { marginBottom: 20 },
    inputLabel: { fontSize: 14, fontWeight: '700', color: '#4B5563', marginBottom: 8 },
    input: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 16, fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#E5E7EB' },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
    cancelBtn: { flex: 1, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
    cancelTxt: { fontSize: 16, fontWeight: '700', color: '#6B7280' },
    saveBtn: { flex: 2, height: 56, borderRadius: 16, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },
    saveTxt: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
