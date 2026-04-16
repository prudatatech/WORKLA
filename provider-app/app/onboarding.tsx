import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { pickAndCompressImage } from '../lib/image';
import { useRouter } from 'expo-router';
import { Briefcase, ChevronRight, FileText, Landmark, MapPin, User } from 'lucide-react-native';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { supabase } from '../lib/supabase';

export default function OnboardingScreen() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const router = useRouter();

    // Form State
    const [fullName, setFullName] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [experience, setExperience] = useState('');
    const [city, setCity] = useState('');
    const [pincode, setPincode] = useState('');

    // Verification States
    const TOTAL_STEPS = 3;
    
    // We only keep the 3 basic step states. 
    // KYC and Bank will happen in kyc.tsx over at the tabs menu.


    const loadExistingData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Load Profile
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (profile) {
                setFullName(profile.full_name || '');
                setCity(profile.city || '');
                setPincode(profile.pincode || '');
            }

            // Load Provider Details
            const { data: details } = await supabase.from('provider_details').select('*').eq('provider_id', user.id).single();
            if (details) {
                setBusinessName(details.business_name || '');
                setExperience(details.years_of_experience?.toString() || '');
            }

                // Smart Skip Logic: Determine first uncompleted step
                if (!profile?.full_name) setStep(1);
                else if (!details?.business_name || !details?.years_of_experience) setStep(2);
                else if (!profile?.city || !profile?.pincode) setStep(3);
                else {
                    // All basic onboarding complete
                    router.replace('/(tabs)/' as any);
                }

        } catch (e) {
            console.error('Error loading onboarding data:', e);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        loadExistingData();
    }, [loadExistingData]);

    // Document handling moved to kyc.tsx

    const submitProfile = async () => {
        setLoading(true);
        setErrorMsg(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // 1. Update basic profile
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    full_name: fullName,
                    city: city,
                    pincode: pincode,
                    updated_at: new Date()
                }, { onConflict: 'id' });

            if (profileError) throw profileError;

            // 2. Update provider details (STRICT: verification_status = 'unverified' initially)
            const { error: providerError } = await supabase
                .from('provider_details')
                .upsert({
                    provider_id: user.id,
                    business_name: businessName || fullName,
                    years_of_experience: parseInt(experience) || 0,
                    verification_status: 'unverified',
                    onboarding_completed: true,
                    updated_at: new Date()
                }, { onConflict: 'provider_id' });

            if (providerError) throw providerError;

            Alert.alert(
                'Basic Setup Complete! 🎉',
                'Let\'s head to the dashboard. You will need to complete your KYC & Bank details to start receiving work.',
                [{ text: 'Go to Dashboard', onPress: () => router.replace('/(tabs)/' as any) }]
            );
        } catch (error: any) {
            let userFriendlyMsg = error.message || "Onboarding failed";
            
            // Handle Unique Constraint (Fraud Prevention) Error
            if (error.code === '23505' || error.message?.includes('unique constraint')) {
                userFriendlyMsg = "This identity document is already registered with another account. Please use your own documents.";
            }
            
            setErrorMsg(userFriendlyMsg);
            Alert.alert('Submission Error', userFriendlyMsg);
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => {
        if (step === 1 && fullName) setStep(2);
        else if (step === 2 && businessName && experience) setStep(3);
        else if (step === 3 && city && pincode) submitProfile();
        else Alert.alert('Missing Info', 'Please fill all required fields to continue.');
    };

    const prevStep = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };


    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Provider Setup</Text>
                <Text style={styles.subtitle}>Step {step} of {TOTAL_STEPS}</Text>
            </View>

            <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
            </View>

            {errorMsg && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
            )}

            <KeyboardAwareScrollView 
                contentContainerStyle={{ padding: 24, paddingBottom: 60 }} 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                enableOnAndroid={true}
                extraScrollHeight={100}
                extraHeight={100}
            >

                {step === 1 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <User color="#0056FF" size={32} />
                        </View>
                        <Text style={styles.stepTitle}>Let&apos;s start with the basics</Text>

                        <Text style={styles.label}>Full Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="John Doe"
                            value={fullName}
                            onChangeText={setFullName}
                        />
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <Briefcase color="#0056FF" size={32} />
                        </View>
                        <Text style={styles.stepTitle}>Tell us about your work</Text>

                        <Text style={styles.label}>Business Name / Work Title</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. John's Plumbing"
                            value={businessName}
                            onChangeText={setBusinessName}
                        />

                        <Text style={styles.label}>Years of Experience</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. 5"
                            keyboardType="number-pad"
                            value={experience}
                            onChangeText={setExperience}
                        />
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <MapPin color="#0056FF" size={32} />
                        </View>
                        <Text style={styles.stepTitle}>Where do you work?</Text>

                        <Text style={styles.label}>Service City</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Varanasi"
                            value={city}
                            onChangeText={setCity}
                        />

                        <Text style={styles.label}>Primary Pincode</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="221005"
                            keyboardType="number-pad"
                            value={pincode}
                            onChangeText={setPincode}
                        />
                    </View>
                )}

                {/* Removed Step 4 and 5 */}

            </KeyboardAwareScrollView>

            <View style={styles.footer}>
                <View style={styles.footerButtons}>
                    {step > 1 && (
                        <TouchableOpacity
                            style={[styles.button, styles.backButton]}
                            onPress={prevStep}
                            disabled={loading}
                        >
                            <Text style={styles.backButtonText}>Back</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={[styles.button, (!fullName && step === 1) && styles.buttonDisabled, { flex: 1 }]}
                        onPress={nextStep}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>
                                    {step === TOTAL_STEPS ? 'Submit for Review' : 'Continue'}
                                </Text>
                                {step !== TOTAL_STEPS && <ChevronRight color="#FFF" size={20} />}
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    errorBanner: {
        backgroundColor: '#FEF2F2',
        padding: 12,
        marginHorizontal: 24,
        marginTop: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    errorText: {
        color: '#B91C1C',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 24,
        paddingBottom: 20,
        backgroundColor: '#0056FF',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
    },
    progressContainer: {
        height: 4,
        backgroundColor: '#E0E0E0',
        width: '100%',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#00D1FF', // Pop color
    },
    scrollContent: {
        padding: 24,
    },
    stepContainer: {
        paddingTop: 20,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#F0F5FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    stepTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111',
        marginBottom: 32,
    },
    label: {
        fontSize: 14,
        color: '#555',
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        fontSize: 16,
        color: '#111',
        marginBottom: 24,
        backgroundColor: '#F8F9FA'
    },
    footer: {
        padding: 24,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        backgroundColor: '#FFF'
    },
    button: {
        backgroundColor: '#0056FF',
        height: 56,
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    backButton: {
        backgroundColor: '#F0F5FF',
        flex: 0.4,
    },
    backButtonText: {
        color: '#0056FF',
        fontSize: 16,
        fontWeight: '600',
    },
    buttonDisabled: {
        backgroundColor: '#A0AEC0',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
        marginRight: 8,
    },
    uploadButton: {
        borderWidth: 1,
        borderColor: '#0056FF',
        borderStyle: 'dashed',
        borderRadius: 12,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F5FF',
        marginBottom: 24,
    },
    uploadButtonText: {
        color: '#0056FF',
        fontSize: 16,
        fontWeight: '500',
    }
});
