import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { pickAndCompressImage } from '../lib/image';
import { useRouter } from 'expo-router';
import { Briefcase, ChevronRight, FileText, Landmark, MapPin, User } from 'lucide-react-native';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
    const TOTAL_STEPS = 5;
    const [aadhaarUri, setAadhaarUri] = useState<string | null>(null);
    const [aadhaarNumber, setAadhaarNumber] = useState('');
    const [aadhaarName, setAadhaarName] = useState<string>('');

    const [panUri, setPanUri] = useState<string | null>(null);
    const [panName, setPanName] = useState<string>('');
    const [panNumber, setPanNumber] = useState('');

    const [bankAccountName, setBankAccountName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ifscCode, setIfscCode] = useState('');

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

            // Load Documents
            const { data: docs } = await supabase.from('provider_documents').select('*').eq('provider_id', user.id);
            if (docs) {
                const aadhaar = docs.find(d => d.document_type === 'aadhaar');
                const pan = docs.find(d => d.document_type === 'pan');
                if (aadhaar) {
                    setAadhaarNumber(aadhaar.document_number || '');
                    if (aadhaar.verified_status === 'verified') setAadhaarUri('EXISTING');
                }
                if (pan) {
                    setPanNumber(pan.document_number || '');
                    if (pan.verified_status === 'verified') setPanUri('EXISTING');
                }

                // Smart Skip Logic: Determine first uncompleted step
                if (!profile?.full_name) setStep(1);
                else if (!details?.business_name || !details?.years_of_experience) setStep(2);
                else if (!profile?.city || !profile?.pincode) setStep(3);
                else if (aadhaar?.verified_status !== 'verified' || pan?.verified_status !== 'verified') setStep(4);
                else if (!bankAccountName) setStep(5);
            }
        } catch (e) {
            console.error('Error loading onboarding data:', e);
        } finally {
            setLoading(false);
        }
    }, [bankAccountName]);

    useEffect(() => {
        loadExistingData();
    }, [loadExistingData]);

    const pickDocument = async (type: 'aadhaar' | 'pan') => {
        try {
            const compressed = await pickAndCompressImage(0.7, 1200);
            if (compressed && compressed.uri) {
                if (type === 'aadhaar') {
                    setAadhaarUri(compressed.uri);
                    setAadhaarName(`Aadhaar_${Date.now()}.jpg`);
                } else {
                    setPanUri(compressed.uri);
                    setPanName(`PAN_${Date.now()}.jpg`);
                }
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to pick image');
        }
    };

    const uploadDocument = async (userId: string, uri: string, type: 'aadhaar' | 'pan') => {
        if (uri === 'EXISTING') return null; // No need to re-upload

        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const filePath = `${type}/${userId}_${Date.now()}`;
        
        const { error: uploadError } = await supabase.storage
            .from('provider-documents')
            .upload(filePath, decode(base64), { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        return filePath; // Return relative path instead of public URL
    };

    const submitProfile = async () => {
        setLoading(true);
        setErrorMsg(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // 1. Update basic profile
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName,
                    city: city,
                    pincode: pincode,
                    updated_at: new Date()
                })
                .eq('id', user.id);

            if (profileError) throw profileError;

            // 2. Update provider details (STRICT: verification_status = 'pending')
            const { error: providerError } = await supabase
                .from('provider_details')
                .update({
                    business_name: businessName || fullName,
                    years_of_experience: parseInt(experience) || 0,
                    verification_status: 'pending',
                    onboarding_completed: true,
                    updated_at: new Date()
                })
                .eq('provider_id', user.id);

            if (providerError) throw providerError;

            // 3. Document Uploads
            const docPromises = [];
            
            if (aadhaarUri && aadhaarNumber) {
                docPromises.push((async () => {
                    const urlOrPath = await uploadDocument(user.id, aadhaarUri, 'aadhaar');
                    const update: any = {
                        provider_id: user.id,
                        document_type: 'aadhaar',
                        document_number: aadhaarNumber.trim(),
                        verified_status: 'pending'
                    };
                    if (urlOrPath) update.document_url = urlOrPath;

                    return supabase.from('provider_documents').upsert(update, { onConflict: 'provider_id, document_type' });
                })());
            }

            if (panUri && panNumber) {
                docPromises.push((async () => {
                    const urlOrPath = await uploadDocument(user.id, panUri, 'pan');
                    const update: any = {
                        provider_id: user.id,
                        document_type: 'pan',
                        document_number: panNumber.trim().toUpperCase(),
                        verified_status: 'pending'
                    };
                    if (urlOrPath) update.document_url = urlOrPath;

                    return supabase.from('provider_documents').upsert(update, { onConflict: 'provider_id, document_type' });
                })());
            }

            await Promise.all(docPromises);

            // 4. Bank Details
            if (bankAccountName && accountNumber) {
                await supabase
                    .from('provider_bank_accounts')
                    .insert({
                        provider_id: user.id,
                        account_holder_name: bankAccountName,
                        account_number_encrypted: accountNumber,
                        ifsc_code: ifscCode,
                        is_primary: true
                    });
            }

            Alert.alert(
                'Application Submitted! 🛡️',
                'Your documents are being reviewed by our team. This usually takes 24-48 hours.\n\nYou can still browse the app, but you will be able to go online after verification.',
                [{ text: 'Got it', onPress: () => router.replace('/(tabs)/profile' as any) }]
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
        else if (step === 3 && city && pincode) setStep(4);
        else if (step === 4) {
            // Strict Validation for Aadhaar and PAN
            const aadhaarRegex = /^\d{12}$/;
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

            if (!aadhaarRegex.test(aadhaarNumber)) {
                return Alert.alert('Invalid Aadhaar', 'Aadhaar number must be exactly 12 digits.');
            }
            if (!aadhaarUri) {
                return Alert.alert('Missing Document', 'Please upload your Aadhaar card image.');
            }
            if (!panRegex.test(panNumber.toUpperCase())) {
                return Alert.alert('Invalid PAN', 'Please enter a valid PAN card number (e.g. ABCDE1234F).');
            }
            if (!panUri) {
                return Alert.alert('Missing Document', 'Please upload your PAN card image.');
            }
            setStep(5);
        }
        else if (step === 5 && bankAccountName && accountNumber && ifscCode) submitProfile();
        else Alert.alert('Missing Info', 'Please fill all required fields to continue.');
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

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

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

                {step === 4 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <FileText color="#0056FF" size={32} />
                        </View>
                        <Text style={styles.stepTitle}>Identity Verification 🛡️</Text>

                        {/* Aadhaar Section */}
                        <Text style={styles.label}>Aadhaar Number</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="1234 5678 9012"
                            keyboardType="number-pad"
                            value={aadhaarNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}
                            onChangeText={(val) => setAadhaarNumber(val.replace(/\s/g, ''))}
                            maxLength={14}
                        />
                        <TouchableOpacity style={styles.uploadButton} onPress={() => pickDocument('aadhaar')}>
                            <Text style={styles.uploadButtonText}>
                                {aadhaarUri ? 'Aadhaar Selected ✅' : 'Upload Aadhaar Card'}
                            </Text>
                        </TouchableOpacity>

                        {/* PAN Section */}
                        <Text style={styles.label}>PAN Card Number</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="ABCDE1234F"
                            autoCapitalize="characters"
                            value={panNumber}
                            onChangeText={setPanNumber}
                            maxLength={10}
                        />
                        <TouchableOpacity style={styles.uploadButton} onPress={() => pickDocument('pan')}>
                            <Text style={styles.uploadButtonText}>
                                {panUri ? 'PAN Selected ✅' : 'Upload PAN Card'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {step === 5 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <Landmark color="#0056FF" size={32} />
                        </View>
                        <Text style={styles.stepTitle}>Bank Details for Payouts</Text>

                        <Text style={styles.label}>Account Holder Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="John Doe"
                            value={bankAccountName}
                            onChangeText={setBankAccountName}
                        />

                        <Text style={styles.label}>Account Number</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="1234567890"
                            keyboardType="number-pad"
                            value={accountNumber}
                            onChangeText={setAccountNumber}
                        />

                        <Text style={styles.label}>IFSC Code</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="SBIN0001234"
                            autoCapitalize="characters"
                            value={ifscCode}
                            onChangeText={setIfscCode}
                        />
                    </View>
                )}

            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.button, (!fullName && step === 1) && styles.buttonDisabled]}
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
