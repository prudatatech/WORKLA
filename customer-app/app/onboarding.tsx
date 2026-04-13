import { useRouter } from 'expo-router';
import { ArrowRight, Mail, User } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function OnboardingScreen() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const router = useRouter();

    const handleCompleteProfile = async () => {
        if (!fullName.trim() || !email.trim()) {
            setErrorMsg('Please enter both your name and email');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setErrorMsg('Please enter a valid email address');
            return;
        }

        setLoading(true);
        setErrorMsg(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName.trim(),
                    email: email.trim(),
                })
                .eq('id', user.id);

            if (error) {
                if (error.code === '23505' && error.message.includes('email')) {
                    setErrorMsg('This email is already linked to another account. Please use a different email or log in with that account.');
                } else {
                    throw error;
                }
                return;
            }

            router.replace('/(tabs)');
        } catch (error: any) {
            setErrorMsg(error.message || 'Failed to update profile. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>One last thing!</Text>
                        <Text style={styles.subtitle}>
                            Help us personalize your experience and send you order updates.
                        </Text>
                    </View>

                    <View style={styles.form}>
                        {errorMsg && (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorText}>{errorMsg}</Text>
                            </View>
                        )}

                        <View style={styles.inputWrapper}>
                            <Text style={styles.label}>Full Name</Text>
                            <View style={styles.inputContainer}>
                                <User size={20} color="#9CA3AF" style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. Rahul Sharma"
                                    value={fullName}
                                    onChangeText={setFullName}
                                    autoFocus
                                />
                            </View>
                        </View>

                        <View style={styles.inputWrapper}>
                            <Text style={styles.label}>Email Address</Text>
                            <View style={styles.inputContainer}>
                                <Mail size={20} color="#9CA3AF" style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. rahul@example.com"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.continueBtn, loading && styles.disabledBtn]}
                            onPress={handleCompleteProfile}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Text style={styles.continueBtnText}>Explore Workla</Text>
                                    <ArrowRight size={20} color="#FFF" style={{ marginLeft: 8 }} />
                                </>
                            )}
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={styles.skipBtn} 
                            onPress={() => router.replace('/(tabs)')}
                            disabled={loading}
                        >
                            <Text style={styles.skipBtnText}>I&apos;ll do this later</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
    container: { flex: 1, paddingHorizontal: 28, paddingTop: 60 },
    header: { marginBottom: 40 },
    title: { fontSize: 32, fontWeight: '800', color: '#111827', marginBottom: 12 },
    subtitle: { fontSize: 16, color: '#6B7280', lineHeight: 24 },
    form: { flex: 1 },
    errorBanner: { marginBottom: 20 },
    errorText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
    inputWrapper: { marginBottom: 24 },
    label: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 58,
    },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#111827', fontWeight: '500' },
    continueBtn: {
        backgroundColor: PRIMARY,
        height: 60,
        borderRadius: 18,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 20,
        elevation: 4,
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    disabledBtn: { backgroundColor: '#93A8FF' },
    continueBtnText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
    skipBtn: { marginTop: 24, paddingVertical: 12, alignItems: 'center' },
    skipBtnText: { fontSize: 15, color: '#9CA3AF', fontWeight: '600' },
});
