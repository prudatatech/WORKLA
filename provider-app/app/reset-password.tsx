import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Save } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ProviderResetPasswordScreen() {
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
        const handleSession = async () => {
             const { data: { session } } = await supabase.auth.getSession();
             if (!session) {
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
                router.replace('/');
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
            <View style={styles.container}>
                <View style={styles.successContent}>
                    <CheckCircle2 size={80} color={PRIMARY} />
                    <Text style={styles.successTitle}>Password Reset!</Text>
                    <Text style={styles.successSubtitle}>Your password has been updated. Redirecting to login...</Text>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
                <ArrowLeft size={24} color="#333" />
            </TouchableOpacity>

            <Animated.View style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}>
                <Text style={styles.title}>New Password</Text>
                <Text style={styles.subtitle}>Please set a new secure password for your provider account.</Text>

                {errorMsg && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{errorMsg}</Text>
                    </View>
                )}

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>New Password</Text>
                    <View style={styles.inputWrapper}>
                        <Lock size={20} color="#666" style={styles.icon} />
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            placeholder="••••••••"
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff size={20} color="#666" /> : <Eye size={20} color="#666" />}
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Confirm New Password</Text>
                    <View style={styles.inputWrapper}>
                        <Lock size={20} color="#666" style={styles.icon} />
                        <TextInput
                            style={styles.input}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry={!showPassword}
                            placeholder="••••••••"
                        />
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && styles.disabledButton]}
                    onPress={handleReset}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <Save size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.buttonText}>Update Password</Text>
                        </>
                    )}
                </TouchableOpacity>
            </Animated.View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF', padding: 24, justifyContent: 'center' },
    backBtn: { position: 'absolute', top: 50, left: 24, zIndex: 10 },
    title: { fontSize: 32, fontWeight: 'bold', color: '#111', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 32 },
    form: { width: '100%' },
    errorContainer: { marginBottom: 16 },
    errorText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, color: '#444', marginBottom: 8, fontWeight: '600' },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0',
        borderRadius: 14, paddingHorizontal: 16, height: 58, backgroundColor: '#F9F9F9'
    },
    icon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#333' },
    button: {
        backgroundColor: PRIMARY, height: 58, borderRadius: 16, flexDirection: 'row',
        justifyContent: 'center', alignItems: 'center', marginTop: 12, elevation: 4
    },
    disabledButton: { backgroundColor: '#99BEFF' },
    buttonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
    successContent: { alignItems: 'center' },
    successTitle: { fontSize: 24, fontWeight: 'bold', color: '#111', marginTop: 24, marginBottom: 12 },
    successSubtitle: { fontSize: 16, color: '#666', textAlign: 'center' }
});
