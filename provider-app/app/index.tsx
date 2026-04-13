import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { CheckCircle2, Eye, EyeOff, Lock, LogIn, Mail, UserPlus, ArrowLeft } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ProviderAuthScreen() {
    const [mode, setMode] = useState<'phone' | 'otp' | 'email'>('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [timer, setTimer] = useState(0);
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const router = useRouter();
    const timerRef = useRef<any>(null);

    const startTimer = () => {
        setTimer(30);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const triggerShake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    };

    const handleSendOtp = async () => {
        setErrorMsg(null);
        if (!phone || phone.length < 10) {
            setErrorMsg('Please enter a valid 10-digit mobile number');
            triggerShake();
            return;
        }

        setLoading(true);
        try {
            const formattedPhone = `+91${phone.replace(/\s/g, '')}`;
            const { error } = await supabase.auth.signInWithOtp({
                phone: formattedPhone,
                options: {
                    data: {
                        user_type: 'PROVIDER'
                    }
                }
            });

            if (error) throw error;
            
            setMode('otp');
            startTimer();
        } catch (error: any) {
            setErrorMsg(error.message || 'Failed to send OTP. Try again.');
            triggerShake();
        } finally {
            setLoading(false);
        }
    };

    const handleEmailLogin = async () => {
        setErrorMsg(null);
        if (!email || !password) {
            setErrorMsg('Please enter both email and password');
            triggerShake();
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            router.replace('/(tabs)');
        } catch (error: any) {
            setErrorMsg(error.message || 'Login failed. Check your credentials.');
            triggerShake();
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        setErrorMsg(null);
        if (!email) {
            setErrorMsg('Please enter your email to reset password');
            triggerShake();
            return;
        }
        setLoading(true);
        try {
            const resetLink = Linking.createURL('reset-password');
            const { error } = await supabase.auth.resetPasswordForEmail(email, { 
                redirectTo: resetLink 
            });
            if (error) throw error;
            setErrorMsg('Password reset link sent! Please check your email inbox.');
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (overrideOtp?: string) => {
        const verifyOtp = overrideOtp || otp;
        setErrorMsg(null);
        if (verifyOtp.length !== 6) {
            setErrorMsg('Please enter the 6-digit OTP code');
            triggerShake();
            return;
        }

        setLoading(true);
        try {
            const formattedPhone = `+91${phone.replace(/\s/g, '')}`;
            const { data: { session }, error } = await supabase.auth.verifyOtp({
                phone: formattedPhone,
                token: verifyOtp,
                type: 'sms',
            });

            if (error) throw error;

            if (session?.user) {
                let onboardingStatusFetched = false;
                for (let i = 0; i < 3; i++) {
                    const { data: providerData } = await supabase
                        .from('provider_details')
                        .select('onboarding_completed')
                        .eq('provider_id', session.user.id)
                        .single();

                    if (providerData) {
                        onboardingStatusFetched = true;
                        if (providerData.onboarding_completed) {
                            router.replace('/(tabs)');
                        } else {
                            router.replace('/onboarding');
                        }
                        break;
                    }
                    await new Promise(r => setTimeout(r, 150));
                }

                if (!onboardingStatusFetched) {
                    router.replace('/onboarding');
                }
            }
        } catch (error: any) {
            setErrorMsg(error.message || 'Invalid OTP. Please try again.');
            triggerShake();
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
            
            <View style={styles.header}>
                <Image
                    source={require('../assets/images/icon.png')}
                    style={styles.logo}
                />
                <Text style={styles.title}>Provider Portal</Text>
                <Text style={styles.subtitle}>
                    {mode === 'phone'
                        ? 'Enter your mobile number to continue'
                        : mode === 'email'
                        ? 'Enter your email to continue'
                        : `Enter the 6-digit code sent to +91 ${phone}`}
                </Text>
            </View>

            <Animated.View style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}>
                {errorMsg && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{errorMsg}</Text>
                    </View>
                )}
                
                {mode === 'email' ? (
                    <View style={styles.inputGroup}>
                        <View style={{ marginBottom: 16 }}>
                            <Text style={styles.label}>Email Address</Text>
                            <View style={styles.inputWrapper}>
                                <Mail size={20} color="#9CA3AF" style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="your@email.com"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>
                        </View>
                        <View style={{ marginBottom: 8 }}>
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.inputWrapper}>
                                <Lock size={20} color="#9CA3AF" style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="••••••••"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                />
                            </View>
                        </View>
                        <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
                            <Text style={styles.forgotText}>Forgot Password?</Text>
                        </TouchableOpacity>
                    </View>
                ) : mode === 'phone' ? (
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Mobile Number</Text>
                        <View style={styles.inputWrapper}>
                            <Text style={styles.countryCode}>+91</Text>
                            <View style={styles.divider} />
                            <TextInput
                                style={styles.input}
                                value={phone}
                                onChangeText={(text) => {
                                    const cleaned = text.replace(/\D/g, '');
                                    if (cleaned.length > 5) {
                                        setPhone(`${cleaned.slice(0, 5)} ${cleaned.slice(5)}`);
                                    } else {
                                        setPhone(cleaned);
                                    }
                                }}
                                keyboardType="phone-pad"
                                placeholder="00000 00000"
                                maxLength={11}
                                autoFocus
                            />
                        </View>
                    </View>
                ) : (
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Enter OTP</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={[styles.input, { letterSpacing: 10, textAlign: 'center', fontWeight: 'bold' }]}
                                value={otp}
                                onChangeText={(text) => {
                                    setOtp(text);
                                    if (text.length === 6) {
                                        handleVerifyOtp(text);
                                    }
                                }}
                                keyboardType="number-pad"
                                placeholder="••••••"
                                maxLength={6}
                                autoFocus
                            />
                        </View>
                        <TouchableOpacity 
                            style={styles.resendBtn} 
                            onPress={handleSendOtp}
                            disabled={timer > 0}
                        >
                            <Text style={[styles.resendText, timer > 0 && styles.resendDisabled]}>
                                {timer > 0 ? `Resend OTP in ${timer}s` : 'Resend OTP'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.button, loading && styles.disabledButton]}
                    onPress={() => mode === 'email' ? handleEmailLogin() : (mode === 'phone' ? handleSendOtp() : handleVerifyOtp())}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <LogIn size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.buttonText}>
                                {mode === 'email' ? 'Login' : (mode === 'phone' ? 'Get OTP ⭢' : 'Verify & Continue')}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>

                {mode !== 'otp' && (
                    <TouchableOpacity 
                        style={styles.toggle} 
                        onPress={() => setMode(mode === 'phone' ? 'email' : 'phone')}
                    >
                        <Text style={styles.toggleText}>
                            {mode === 'phone' ? 'Login with Email instead' : 'Login with Mobile Number'}
                        </Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        </KeyboardAvoidingView>
        
        <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => {
                if (mode === 'phone') {
                    router.back();
                } else {
                    setMode('phone');
                }
            }}
        >
            <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
    </SafeAreaView>
);
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
    container: { flex: 1, backgroundColor: '#FFFFFF', padding: 24, justifyContent: 'center' },
    backBtn: { position: 'absolute', top: 10, left: 16, zIndex: 100, padding: 10 },
    header: { alignItems: 'center', marginBottom: 40 },
    logo: { width: 80, height: 80, borderRadius: 20, marginBottom: 16 },
    logoText: { color: '#FFF', fontSize: 28, fontWeight: '900' },
    title: { fontSize: 32, fontWeight: 'bold', color: '#111', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#666', textAlign: 'center' },
    form: { width: '100%' },
    errorContainer: { marginBottom: 16 },
    errorText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, color: '#444', marginBottom: 8, fontWeight: '600' },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0',
        borderRadius: 14, paddingHorizontal: 16, height: 58, backgroundColor: '#F9F9F9'
    },
    countryCode: { fontSize: 16, fontWeight: '700', color: '#111827', marginRight: 10 },
    divider: { width: 1, height: 24, backgroundColor: '#E5E7EB', marginRight: 15 },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#333' },
    resendBtn: { marginTop: 16, alignSelf: 'center' },
    resendText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
    resendDisabled: { color: '#9CA3AF' },
    button: {
        backgroundColor: PRIMARY, height: 58, borderRadius: 16, flexDirection: 'row',
        justifyContent: 'center', alignItems: 'center', marginTop: 12, elevation: 4
    },
    disabledButton: { backgroundColor: '#99BEFF' },
    buttonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
    toggle: { marginTop: 24, alignItems: 'center' },
    toggleText: { fontSize: 15, color: PRIMARY, fontWeight: '600' },
    forgotBtn: { alignSelf: 'flex-end', marginTop: 8 },
    forgotText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
    tosContainer: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, paddingHorizontal: 4 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 2 },
    checkboxActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    tosText: { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 20 },
    linkText: { color: PRIMARY, fontWeight: '600' }
});
