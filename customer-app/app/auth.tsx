import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { ArrowLeft, Lock, LogIn, Mail, X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function AuthScreen() {
    const [mode, setMode] = useState<'phone' | 'otp' | 'welcome' | 'email'>('welcome');
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
            const formattedPhone = `+91${phone}`;
            const { error } = await supabase.auth.signInWithOtp({
                phone: formattedPhone,
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
            const formattedPhone = `+91${phone}`;
            const { data: { session }, error } = await supabase.auth.verifyOtp({
                phone: formattedPhone,
                token: verifyOtp,
                type: 'sms',
            });

            if (error) throw error;

            if (session?.user) {
                // 1. Wait for Profile Trigger (Reliability Layer)
                // Triggers can be async. We poll up to 3 times (500ms total) to ensure profile exists.
                let profileFound = false;
                for (let i = 0; i < 3; i++) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name, email')
                        .eq('id', session.user.id)
                        .single();
                    
                    if (profile) {
                        profileFound = true;
                        // 2. Decide if user needs onboarding
                        // If name is the fallback "User ...1234" or email is missing
                        const isPlaceholderName = profile.full_name?.startsWith('User ');
                        if (isPlaceholderName || !profile.email) {
                            router.replace('/onboarding');
                        } else {
                            router.replace('/(tabs)');
                        }
                        break;
                    }
                    await new Promise(r => setTimeout(r, 150));
                }

                if (!profileFound) {
                    // Fallback to tabs if DB is really slow, but onboarding is safer
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

    if (mode === 'welcome') {
        return (
            <SafeAreaView style={styles.safeArea}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
                <View style={styles.welcomeClose}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <X size={24} color="#374151" />
                    </TouchableOpacity>
                </View>

                <View style={styles.welcomeContent}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../assets/images/icon.png')}
                            style={styles.logo}
                        />
                        <Text style={styles.brandName}>workla</Text>
                    </View>

                    <Text style={styles.welcomeTitle}>Welcome</Text>
                    <Text style={styles.welcomeSubtitle}>
                        Your one-stop destination for all home services.
                    </Text>

                    <TouchableOpacity
                        style={styles.primaryLoginBtn}
                        onPress={() => setMode('phone')}
                    >
                        <LogIn size={20} color="#FFF" style={{ marginRight: 10 }} />
                        <Text style={styles.primaryLoginText}>Continue with Phone</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => router.replace('/(tabs)')}
                        style={styles.guestBtn}
                    >
                        <Text style={styles.guestBtnText}>Continue as Guest →</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <TouchableOpacity 
                    style={styles.backBtn} 
                    onPress={() => {
                        if (mode === 'otp') setMode('phone');
                        else setMode('welcome');
                    }}
                >
                    <ArrowLeft size={22} color="#374151" />
                </TouchableOpacity>

                <Animated.View style={[styles.formContainer, { transform: [{ translateX: shakeAnim }] }]}>
                    <Text style={styles.formTitle}>
                        {mode === 'phone' ? 'Phone Number' : 'Verification'}
                    </Text>
                    <Text style={styles.formSubtitle}>
                        {mode === 'phone'
                            ? 'Enter your mobile number to receive an OTP.'
                            : `Enter the 6-digit code sent to +91 ${phone}`}
                    </Text>

                    {errorMsg && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{errorMsg}</Text>
                        </View>
                    )}

                    {mode === 'email' ? (
                        <View style={styles.inputWrapper}>
                            <View style={{ marginBottom: 16 }}>
                                <Text style={styles.label}>Email Address</Text>
                                <View style={styles.inputContainer}>
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
                                <View style={styles.inputContainer}>
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
                        <View style={styles.inputWrapper}>
                            <Text style={styles.label}>Mobile Number</Text>
                            <View style={styles.inputContainer}>
                                <Text style={styles.countryCode}>+91</Text>
                                <View style={styles.divider} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="00000 00000"
                                    value={phone}
                                    onChangeText={(text) => {
                                        // Auto-formatting: add space after 5 digits
                                        const cleaned = text.replace(/\D/g, '');
                                        if (cleaned.length > 5) {
                                            setPhone(`${cleaned.slice(0, 5)} ${cleaned.slice(5)}`);
                                        } else {
                                            setPhone(cleaned);
                                        }
                                    }}
                                    keyboardType="phone-pad"
                                    maxLength={11} // 10 digits + 1 space
                                    autoFocus
                                />
                            </View>
                        </View>
                    ) : (
                        <View style={styles.inputWrapper}>
                            <Text style={styles.label}>Enter OTP</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={[styles.input, { letterSpacing: 10, textAlign: 'center', fontWeight: 'bold' }]}
                                    placeholder="••••••"
                                    value={otp}
                                    onChangeText={(text) => {
                                        setOtp(text);
                                        if (text.length === 6) {
                                            handleVerifyOtp(text);
                                        }
                                    }}
                                    keyboardType="number-pad"
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
                        style={[styles.continueBtn, loading && styles.disabledBtn]}
                        onPress={() => mode === 'email' ? handleEmailLogin() : (mode === 'phone' ? handleSendOtp() : handleVerifyOtp())}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.continueBtnText}>
                            {mode === 'email' ? 'Login' : (mode === 'phone' ? 'Get OTP ⭢' : 'Verify & Continue')}
                        </Text>}
                    </TouchableOpacity>

                    {mode !== 'otp' && (
                        <TouchableOpacity 
                            style={styles.toggleBtn} 
                            onPress={() => setMode(mode === 'phone' ? 'email' : 'phone')}
                        >
                            <Text style={styles.toggleText}>
                                {mode === 'phone' ? 'Login with Email instead' : 'Login with Mobile Number'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
    welcomeClose: { paddingHorizontal: 24, paddingTop: 16, alignItems: 'flex-end' },
    welcomeContent: { flex: 1, paddingHorizontal: 28, paddingTop: 60, alignItems: 'center' },
    logoContainer: { alignItems: 'center', marginBottom: 40 },
    logo: {
        width: 80, height: 80, borderRadius: 24, marginBottom: 16
    },
    logoText: { color: '#FFF', fontSize: 32, fontWeight: '900' },
    brandName: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: 1 },
    welcomeTitle: { fontSize: 32, fontWeight: '800', color: '#111827', marginBottom: 12, textAlign: 'center' },
    welcomeSubtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 48, lineHeight: 24 },
    primaryLoginBtn: {
        width: '100%', height: 58, borderRadius: 16, backgroundColor: PRIMARY,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
        elevation: 4
    },
    primaryLoginText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    guestBtn: { marginTop: 24, paddingVertical: 12 },
    guestBtnText: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
    backBtn: { padding: 20 },
    formContainer: { flex: 1, paddingHorizontal: 24 },
    errorBanner: { paddingBottom: 16 },
    errorText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
    formTitle: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 8 },
    formSubtitle: { fontSize: 15, color: '#6B7280', marginBottom: 32, lineHeight: 22 },
    inputWrapper: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
        borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, height: 56
    },
    inputIcon: { marginRight: 12 },
    countryCode: { fontSize: 16, fontWeight: '700', color: '#111827', marginRight: 10 },
    divider: { width: 1, height: 24, backgroundColor: '#E5E7EB', marginRight: 15 },
    input: { flex: 1, fontSize: 16, color: '#111827' },
    resendBtn: { marginTop: 16, alignSelf: 'center' },
    resendText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
    resendDisabled: { color: '#9CA3AF' },
    continueBtn: {
        backgroundColor: PRIMARY, height: 58, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
        marginTop: 20, elevation: 4
    },
    disabledBtn: { backgroundColor: '#93A8FF' },
    continueBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
    toggleBtn: { marginTop: 24, alignItems: 'center' },
    toggleText: { fontSize: 15, color: PRIMARY, fontWeight: '600' },
    forgotBtn: { alignSelf: 'flex-end', marginTop: 8 },
    forgotText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
    icon: { marginRight: 12 },
    tosContainer: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, paddingHorizontal: 4 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 2 },
    checkboxActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    tosText: { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 20 },
    linkText: { color: PRIMARY, fontWeight: '600' }
});
