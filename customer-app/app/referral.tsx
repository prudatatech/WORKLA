import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Check,
    Copy,
    Gift,
    Share2,
    Tag,
    Users
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ReferralScreen() {
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('profiles')
                .select('full_name, referral_code, referred_by_id')
                .eq('id', user.id)
                .single();
            setProfile(data);
            setLoading(false);
        })();
    }, []);

    const referralCode = profile?.referral_code ?? '—';
    const referralLink = `https://workla.in/join?ref=${referralCode}`;

    const handleCopy = () => {
        // Show the code in an alert so users can copy it manually
        // (full clipboard requires @react-native-clipboard/clipboard which is not installed)
        Alert.alert('Your Referral Code', referralCode, [
            { text: 'Close' },
            {
                text: 'Share Instead',
                onPress: handleShare,
            },
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        try {
            await Share.share({
                message: `Join me on Workla — India's best home services app! Use my referral code **${referralCode}** and get ₹50 off your first booking.\n\n${referralLink}`,
                title: 'Join Workla with my code!',
            });
        } catch (e) {
            Alert.alert('Could not share', 'Please try again.');
        }
    };

    const BENEFITS = [
        { id: 1, icon: Gift, title: '₹50 for your friend', sub: 'They get ₹50 off their first booking' },
        { id: 2, icon: Tag, title: '₹100 for you', sub: 'You earn ₹100 wallet credit when they complete their first booking' },
        { id: 3, icon: Users, title: 'No limits', sub: 'Refer as many friends as you want' },
    ];

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <ArrowLeft size={22} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Refer & Earn</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={BENEFITS}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={s.scroll}
                ListHeaderComponent={
                    <>
                        {/* Hero */}
                        <View style={s.hero}>
                            <View style={s.heroIcon}>
                                <Gift size={36} color={PRIMARY} />
                            </View>
                            <Text style={s.heroTitle}>Invite friends,{'\n'}earn together!</Text>
                            <Text style={s.heroSub}>
                                Share your unique code and both of you get rewarded when your friend completes their first booking.
                            </Text>
                        </View>

                        {/* Referral code card */}
                        <View style={s.codeCard}>
                            <Text style={s.codeLabel}>Your Referral Code</Text>
                            <View style={s.codeRow}>
                                <Text style={s.codeText} selectable>{referralCode}</Text>
                                <TouchableOpacity style={s.copyBtn} onPress={handleCopy}>
                                    {copied
                                        ? <Check size={16} color="#059669" />
                                        : <Copy size={16} color={PRIMARY} />
                                    }
                                    <Text style={[s.copyBtnText, copied && { color: '#059669' }]}>
                                        {copied ? 'Copied!' : 'Copy'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.8}>
                                <Share2 size={16} color="#FFF" />
                                <Text style={s.shareBtnText}>Share with Friends</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={s.benefitsHeader}>How it works</Text>
                    </>
                }
                renderItem={({ item }) => (
                    <View style={s.benefitRow}>
                        <View style={s.benefitIconWrap}>
                            <item.icon size={20} color={PRIMARY} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.benefitTitle}>{item.title}</Text>
                            <Text style={s.benefitSub}>{item.sub}</Text>
                        </View>
                    </View>
                )}
                ListFooterComponent={
                    <View style={s.tncBox}>
                        <Text style={s.tncText}>
                            *Rewards are credited to your Workla Wallet after your friend completes their first booking. T&C apply.
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
    scroll: { padding: 16, gap: 12 },
    // Hero
    hero: { alignItems: 'center', paddingVertical: 24, gap: 10 },
    heroIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    heroTitle: { fontSize: 24, fontWeight: '900', color: '#111827', textAlign: 'center', lineHeight: 30 },
    heroSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
    // Code card
    codeCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#E5E7EB', gap: 14 },
    codeLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600', textAlign: 'center' },
    codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#EEF2FF', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20 },
    codeText: { fontSize: 24, fontWeight: '900', color: PRIMARY, letterSpacing: 4 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    copyBtnText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
    shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14 },
    shareBtnText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
    // Benefits
    benefitsHeader: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 8 },
    benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
    benefitIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    benefitTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 3 },
    benefitSub: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
    // T&C
    tncBox: { paddingVertical: 16 },
    tncText: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16 },
});
