import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, HelpCircle, Mail, MessageSquare, Phone } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Linking,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#1A3FFF';

const FAQS = [
    {
        q: "How do I cancel a booking?",
        a: "To cancel an active booking, go to the tracking screen (Tap 'Track' on your booking) and select 'Cancel Booking' at the bottom. Please provide a reason to help us improve."
    },
    {
        q: "How are prices calculated?",
        a: "Prices include a Base Service fee, a Platform Booking fee, and standard government taxes. You see the final price before booking."
    },
    {
        q: "What if the worker doesn't arrive?",
        a: "If the worker is significantly delayed without notice, you can cancel without penalty or contact our support team for a priority replacement."
    },
    {
        q: "How do I use my Wallet balance?",
        a: "Your Wallet balance is automatically applied when you select 'Wallet' as your payment method during checkout."
    },
    {
        q: "Is Workla Gold refundable?",
        a: "Workla Gold subscriptions are not refundable, but you can cancel auto-renewal at any time."
    }
];

export default function SupportScreen() {
    const router = useRouter();
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const handleCall = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const url = Platform.OS === 'android' ? 'tel:18001234567' : 'telprompt:18001234567';
        Linking.openURL(url).catch(err => console.error('Error opening dialer', err));
    };

    const handleEmail = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Linking.openURL('mailto:support@workla.in?subject=Customer Support Request');
    };

    const toggleFAQ = (index: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Help & Support</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                <View style={s.hero}>
                    <View style={s.heroIcon}>
                        <HelpCircle size={40} color={PRIMARY} />
                    </View>
                    <Text style={s.heroTitle}>How can we help you?</Text>
                    <Text style={s.heroSub}>Find answers or get in touch below.</Text>
                </View>

                {/* Contact Cards */}
                <View style={s.contactGrid}>
                    <TouchableOpacity style={s.contactCard} onPress={handleCall} activeOpacity={0.8}>
                        <View style={[s.iconBox, { backgroundColor: '#EEF2FF' }]}>
                            <Phone size={20} color={PRIMARY} />
                        </View>
                        <Text style={s.contactTitle}>Call Us</Text>
                        <Text style={s.contactSub}>24/7 Support line</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.contactCard} onPress={handleEmail} activeOpacity={0.8}>
                        <View style={[s.iconBox, { backgroundColor: '#FEF2F2' }]}>
                            <Mail size={20} color="#DC2626" />
                        </View>
                        <Text style={s.contactTitle}>Email Us</Text>
                        <Text style={s.contactSub}>Reply within 24h</Text>
                    </TouchableOpacity>
                </View>

                {/* FAQ Section */}
                <Text style={s.sectionTitle}>Frequently Asked Questions</Text>

                <View style={s.faqList}>
                    {FAQS.map((faq, idx) => {
                        const isExpanded = expandedIndex === idx;
                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[s.faqItem, isExpanded && s.faqItemExpanded]}
                                onPress={() => toggleFAQ(idx)}
                                activeOpacity={0.9}
                            >
                                <View style={s.faqQuestionRow}>
                                    <Text style={[s.faqQuestion, isExpanded && s.faqQuestionActive]}>{faq.q}</Text>
                                    <View style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}>
                                        <ChevronRight size={18} color={isExpanded ? PRIMARY : '#9CA3AF'} />
                                    </View>
                                </View>
                                {isExpanded && (
                                    <Text style={s.faqAnswer}>{faq.a}</Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Chat Action */}
                <TouchableOpacity style={s.liveChatBtn} activeOpacity={0.9} onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    alert("Live Chat agent assignment is currently disabled.");
                }}>
                    <MessageSquare size={18} color="#FFF" />
                    <Text style={s.liveChatText}>Start Live Chat</Text>
                </TouchableOpacity>

            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    scroll: { padding: 20, paddingBottom: 60 },
    hero: { alignItems: 'center', marginVertical: 24 },
    heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    heroTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 6 },
    heroSub: { fontSize: 14, color: '#6B7280' },
    contactGrid: { flexDirection: 'row', gap: 16, marginBottom: 32 },
    contactCard: { flex: 1, backgroundColor: '#FFF', padding: 20, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    iconBox: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    contactTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
    contactSub: { fontSize: 12, color: '#6B7280' },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
    faqList: { gap: 12, marginBottom: 32 },
    faqItem: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    faqItemExpanded: { borderColor: PRIMARY, backgroundColor: '#F8FAFC' },
    faqQuestionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    faqQuestion: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151', paddingRight: 16 },
    faqQuestionActive: { color: PRIMARY },
    faqAnswer: { marginTop: 12, fontSize: 13, color: '#4B5563', lineHeight: 20 },
    liveChatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111827', padding: 16, borderRadius: 16 },
    liveChatText: { fontSize: 15, fontWeight: '800', color: '#FFF' }
});
