import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, CheckCircle2, Mail, MapPin, Phone, User } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function EditProfileScreen() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Form fields
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [city, setCity] = useState('');
    const [gender, setGender] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [gstin, setGstin] = useState('');
    const [placeOfSupply, setPlaceOfSupply] = useState('Karnataka');

    useEffect(() => {
        (async () => {
            const { data: { user: u } } = await supabase.auth.getUser();
            setUser(u);
            if (u) {
                setPhone(u.phone ?? '');
                setEmail(u.email ?? '');
                const res = await api.get('/api/v1/users/me');
                if (res.data) {
                    setFullName(res.data.full_name ?? '');
                    setCity(res.data.city ?? '');
                    setGender(res.data.gender ?? '');
                    setBusinessName(res.data.business_name ?? '');
                    setGstin(res.data.gstin ?? '');
                    setPlaceOfSupply(res.data.place_of_supply ?? 'Karnataka');
                }
            }
        })();
    }, []);

    const handleSave = async () => {
        if (!fullName.trim()) { Alert.alert('Required', 'Please enter your full name.'); return; }
        setSaving(true);
        try {
            const payload: any = {
                full_name: fullName.trim(),
                bio: city.trim(),
                address: city.trim(),
                place_of_supply: placeOfSupply.trim(),
            };

            if (businessName.trim()) {
                payload.business_name = businessName.trim();
            }

            if (gstin.trim()) {
                payload.gstin = gstin.trim().toUpperCase();
            }

            const res = await api.patch('/api/v1/users/me', payload);

            if (res.error) throw new Error(res.error);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setSaving(false);
        }
    };

    const initials = (fullName || user?.phone || '?').charAt(0).toUpperCase();

    return (
        <SafeAreaView style={s.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Edit Profile</Text>
                <TouchableOpacity
                    style={[s.saveBtn, saving && { opacity: 0.7 }]}
                    onPress={handleSave} disabled={saving}
                >
                    {saving ? <ActivityIndicator size={14} color="#FFF" /> :
                        saved ? <CheckCircle2 size={16} color="#FFF" /> :
                            <Text style={s.saveBtnText}>Save</Text>}
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                    {/* Avatar section */}
                    <View style={s.avatarSection}>
                        <View style={s.avatarCircle}>
                            <Text style={s.avatarInitial}>{initials}</Text>
                        </View>
                        <TouchableOpacity style={s.avatarEditBtn}>
                            <Camera size={16} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={s.avatarHint}>Tap to change photo</Text>
                    </View>

                    {/* Personal Info */}
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Personal Information</Text>

                        <View style={s.field}>
                            <Text style={s.fieldLabel}>Full Name</Text>
                            <View style={s.inputRow}>
                                <User size={16} color="#9CA3AF" />
                                <TextInput
                                    style={s.input} placeholder="Your full name"
                                    placeholderTextColor="#9CA3AF"
                                    value={fullName} onChangeText={setFullName}
                                />
                            </View>
                        </View>

                        <View style={s.field}>
                            <Text style={s.fieldLabel}>Phone Number</Text>
                            <View style={[s.inputRow, s.inputRowDisabled]}>
                                <Phone size={16} color="#D1D5DB" />
                                <TextInput
                                    style={[s.input, { color: '#9CA3AF' }]} value={phone}
                                    editable={false} placeholder="Phone"
                                    placeholderTextColor="#9CA3AF"
                                />
                            </View>
                            <Text style={s.fieldHint}>Phone cannot be changed. Contact support if needed.</Text>
                        </View>

                        <View style={s.field}>
                            <Text style={s.fieldLabel}>Email Address</Text>
                            <View style={[s.inputRow, s.inputRowDisabled]}>
                                <Mail size={16} color="#D1D5DB" />
                                <TextInput
                                    style={[s.input, { color: '#9CA3AF' }]} value={email}
                                    editable={false} placeholder="Email"
                                    placeholderTextColor="#9CA3AF"
                                />
                            </View>
                        </View>

                        <View style={s.field}>
                            <Text style={s.fieldLabel}>City</Text>
                            <View style={s.inputRow}>
                                <MapPin size={16} color="#9CA3AF" />
                                <TextInput
                                    style={s.input} placeholder="Your city"
                                    placeholderTextColor="#9CA3AF"
                                    value={city} onChangeText={setCity}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Business/GST Details Section */}
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Business Details (For Invoicing)</Text>
                        <Text style={s.cardSub}>If you are a business, enter your details here for GST-compliant invoices.</Text>

                        <View style={s.field}>
                            <Text style={s.fieldLabel}>Registered Business Name</Text>
                            <View style={s.inputRow}>
                                <TextInput
                                    style={s.input} placeholder="e.g. Acme Tech Solutions"
                                    placeholderTextColor="#9CA3AF"
                                    value={businessName} onChangeText={setBusinessName}
                                />
                            </View>
                        </View>

                        <View style={s.field}>
                            <Text style={s.fieldLabel}>GSTIN</Text>
                            <View style={s.inputRow}>
                                <TextInput
                                    style={s.input} placeholder="15-digit GST Number"
                                    placeholderTextColor="#9CA3AF"
                                    value={gstin} onChangeText={setGstin}
                                    autoCapitalize="characters"
                                    maxLength={15}
                                />
                            </View>
                            <Text style={s.fieldHint}>Ensure this matches your registered certificate.</Text>
                        </View>

                        <View style={s.field}>
                            <Text style={s.fieldLabel}>Place of Supply (State)</Text>
                            <View style={s.inputRow}>
                                <TextInput
                                    style={s.input} placeholder="e.g. Karnataka"
                                    placeholderTextColor="#9CA3AF"
                                    value={placeOfSupply} onChangeText={setPlaceOfSupply}
                                />
                            </View>
                            <Text style={s.fieldHint}>Determines IGST vs CGST/SGST calculation.</Text>
                        </View>
                    </View>

                    {/* Gender selector */}
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Gender</Text>
                        <View style={s.genderRow}>
                            {['Male', 'Female', 'Other', 'Prefer not to say'].map(g => (
                                <TouchableOpacity
                                    key={g}
                                    style={[s.genderChip, gender === g && s.genderChipActive]}
                                    onPress={() => setGender(g)}
                                >
                                    <Text style={[s.genderChipText, gender === g && s.genderChipTextActive]}>{g}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Delete account */}
                    <View style={s.card}>
                        <TouchableOpacity
                            style={s.deleteRow}
                            onPress={() => Alert.alert('Delete Account', 'Are you sure? This cannot be undone.', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Delete', style: 'destructive' },
                            ])}
                        >
                            <Text style={s.deleteText}>Delete My Account</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={{ height: 60 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
    saveBtn: { backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
    scroll: { padding: 16 },
    // Avatar
    avatarSection: { alignItems: 'center', paddingVertical: 24 },
    avatarCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFF', shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
    avatarInitial: { fontSize: 36, fontWeight: '900', color: '#FFF' },
    avatarEditBtn: { position: 'absolute', bottom: 28, right: '32%', width: 30, height: 30, borderRadius: 15, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
    avatarHint: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
    // Card
    card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
    cardTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 },
    field: { marginBottom: 16 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
    fieldHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    inputRowDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
    input: { flex: 1, fontSize: 14, color: '#111827' },
    // Gender
    genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    genderChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
    genderChipActive: { backgroundColor: '#EEF2FF', borderColor: PRIMARY },
    genderChipText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    genderChipTextActive: { color: PRIMARY, fontWeight: '700' },
    // Delete
    deleteRow: { paddingVertical: 4 },
    deleteText: { fontSize: 14, color: '#DC2626', fontWeight: '600', textAlign: 'center' },
});
