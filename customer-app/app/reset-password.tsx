import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Save } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
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

export default function ResetPasswordScreen() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const router = useRouter();
    const params = useLocalSearchParams();

    useEffect(() => {
        // Supabase sends the recovery tokens in a URL fragment (#).
        // expo-router attempts to parse these into params.
        const handleSession = async () => {
             // In some cases, Supabase might automatically establish the session
             // via the deep link if detectSessionInUrl is true.
             // We'll check if we have an active session or need to use tokens.
             const { data: { session } } = await supabase.auth.getSession();
             if (!session) {
                 // Check if tokens are in the params (hash fragment)
                 // Note: Supabase fragments often need manual parsing if not handled by client
                 const { access_token, refresh_token } = params as any;
                 if (access_token && refresh_token) {
                     await supabase.auth.setSession({
                         access_token,
                         refresh_token
                     });
                 }
             }
        };
        handleSession();
    }, [params]);

    const triggerShake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    };

    const handleReset = async () => {
        setErrorMsg(null);
        if (!password || !confirmPassword) {
            setErrorMsg('All fields are required');
            triggerShake();
            return;
        }

        if (password.length < 6) {
            setErrorMsg('Password must be at least 6 characters');
            triggerShake();
            return;
        }

        if (password !== confirmPassword) {
            setErrorMsg('Passwords do not match');
            triggerShake();
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            
            setSuccess(true);
            setTimeout(() => {
                router.replace('/auth');
            }, 2000);
        } catch (error: any) {
            setErrorMsg(error.message || 'Failed to update password');
            triggerShake();
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.successContainer}>
                    <CheckCircle2 size={80} color={PRIMARY} />
                    <Text style={styles.successTitle}>Password Reset!</Text>
                    <Text style={styles.successSubtitle}>Your password has been updated successfully. Redirecting you to login...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/auth')}>
                    <ArrowLeft size={22} color="#374151" />
                </TouchableOpacity>

                <Animated.View style={[styles.formContainer, { transform: [{ translateX: shakeAnim }] }]}>
                    <Text style={styles.formTitle}>Set New Password</Text>
                    <Text style={styles.formSubtitle}>
                        Your recovery session is active. Please enter your new secure password below to regain access.
                    </Text>

                    {errorMsg && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{errorMsg}</Text>
                        </View>
                    )}

                    <View style={styles.inputWrapper}>
                        <Text style={styles.label}>New Password</Text>
                        <View style={styles.inputContainer}>
                            <Lock size={20} color="#6B7280" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="••••••••"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                            />
                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff size={20} color="#6B7280" /> : <Eye size={20} color="#6B7280" />}
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.inputWrapper}>
                        <Text style={styles.label}>Confirm New Password</Text>
                        <View style={styles.inputContainer}>
                            <Lock size={20} color="#6B7280" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showPassword}
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.continueBtn, loading && styles.disabledBtn]}
                        onPress={handleReset}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="#FFF" /> : (
                            <>
                                <Save size={20} color="#FFF" style={{ marginRight: 10 }} />
                                <Text style={styles.continueBtnText}>Update Password</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
    backBtn: { padding: 20 },
    formContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
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
    input: { flex: 1, fontSize: 16, color: '#111827' },
    continueBtn: {
        backgroundColor: PRIMARY, height: 58, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        marginTop: 12, elevation: 4
    },
    disabledBtn: { backgroundColor: '#93A8FF' },
    continueBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    successTitle: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 24, marginBottom: 12 },
    successSubtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24 }
});
